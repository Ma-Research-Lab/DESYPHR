"""
Color Wheel Analysis for the AFM backend runtime.
Adapted from 3.colorwheel.py for use via API endpoints.
"""
import matplotlib
matplotlib.use('Agg')

import math
import os
import io
import base64
import tempfile
import random
from collections import deque
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter
from sklearn.cluster import KMeans
from skimage import measure
from skimage.morphology import skeletonize


def check_cupy_available():
    try:
        import cupy  # noqa: F401
        return True
    except ImportError:
        return False


def compute_average_angle(gray_array):
    """Compute average orientation angle from a grayscale numpy array."""
    blurred = cv2.GaussianBlur(gray_array, (3, 3), 0)
    skeleton = skeletonize(blurred // 255, method='lee').astype(np.uint8) * 255
    _, binary_skel = cv2.threshold(skeleton, 1, 255, cv2.THRESH_BINARY)
    contours, _ = cv2.findContours(binary_skel, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)

    angles = []
    for contour in contours:
        for i in range(0, len(contour) - 10, 10):
            sub = contour[i:i + 10]
            if len(sub) >= 2:
                dx = sub[-1][0][0] - sub[0][0][0]
                dy = sub[-1][0][1] - sub[0][0][1]
                angles.append(math.degrees(math.atan2(dy, dx)))
    return sum(angles) / len(angles) if angles else 0


class ColorWheelProcessor:
    def __init__(self, image_array, gpu_accelerated, color_wheel_origin=0):
        self.binarized_image = image_array
        self.sym = 2
        self.color = 5
        self.brightness = 1
        self.contrast = 5
        self.gpu_accelerated = gpu_accelerated
        self.color_wheel_origin = math.radians(color_wheel_origin)
        self.cp = __import__("cupy") if gpu_accelerated else np

    def process_image(self):
        data = np.array(self.binarized_image)
        clrwhl = self._bldclrwhl(data.shape[0], data.shape[1], self.sym)
        imnp = self._nofft(clrwhl, data, data.shape[0], data.shape[1])

        imnp = imnp - np.min(imnp)
        maxv = np.max(imnp) if imnp.size > 0 else 0
        if maxv != 0:
            imnp = imnp / maxv * 255.0
        else:
            imnp = imnp * 0.0

        rgb2 = Image.fromarray(np.uint8(imnp))
        img2 = rgb2.filter(ImageFilter.GaussianBlur(radius=0.5))
        img2 = ImageEnhance.Color(img2).enhance(self.color)
        img2 = ImageEnhance.Brightness(img2).enhance(self.brightness)
        img2 = ImageEnhance.Contrast(img2).enhance(self.contrast)
        return img2

    def _bldclrwhl(self, nx, ny, sym):
        cp = self.cp
        cda = cp.ones((nx, ny, 2))
        cx = cp.linspace(-nx, nx, nx)
        cy = cp.linspace(-ny, ny, ny)
        cxx, cyy = cp.meshgrid(cy, cx)
        czz = (((cp.arctan2(cxx, cyy) - self.color_wheel_origin) / math.pi + 1.0) / 2.0) * sym
        cd2 = cp.dstack((czz, cda))
        carr = cd2
        chi = cp.floor(carr[..., 0] * 6)
        f = carr[..., 0] * 6 - chi
        p = carr[..., 2] * (1 - carr[..., 1])
        q = carr[..., 2] * (1 - f * carr[..., 1])
        t = carr[..., 2] * (1 - (1 - f) * carr[..., 1])
        v = carr[..., 2]
        chi = cp.stack([chi, chi, chi], axis=-1).astype(cp.uint8) % 6
        out = cp.choose(chi, cp.stack([
            cp.stack((v, t, p), axis=-1), cp.stack((q, v, p), axis=-1),
            cp.stack((p, v, t), axis=-1), cp.stack((p, q, v), axis=-1),
            cp.stack((t, p, v), axis=-1), cp.stack((v, p, q), axis=-1)
        ]))
        return cp.asnumpy(out) if self.gpu_accelerated else out

    def _nofft(self, whl, img, nx, ny):
        cp = self.cp
        imnp = cp.array(img)
        fimg = cp.fft.fft2(imnp)
        whl = cp.fft.fftshift(whl)
        proimg = cp.zeros((nx, ny, 3))
        comb = cp.zeros((nx, ny, 3), dtype=complex)
        magnitude = cp.repeat(np.abs(fimg)[:, :, cp.newaxis], 3, axis=2)
        phase = cp.repeat(np.angle(fimg)[:, :, cp.newaxis], 3, axis=2)
        proimg = whl * magnitude
        comb = cp.multiply(proimg, cp.exp(1j * phase))
        for n in range(3):
            proimg[:, :, n] = cp.real(cp.fft.ifft2(comb[:, :, n]))
            proimg[:, :, n] = proimg[:, :, n] - cp.min(proimg[:, :, n])
            proimg[:, :, n] = proimg[:, :, n] / cp.max(proimg[:, :, n])
        return cp.asnumpy(proimg) if self.gpu_accelerated else proimg


class PhaseSubtraction:
    def __init__(self, input_image, binarized_image):
        self.input_image = input_image
        self.binarized_image = binarized_image

    def subtract_black_from_input(self):
        input_array = np.array(self.input_image)
        binned_array = np.array(self.binarized_image)
        if len(binned_array.shape) == 2:
            binned_array = np.expand_dims(binned_array, axis=-1)
        result_array = np.where(binned_array == 0, input_array, 255)
        return Image.fromarray(result_array.astype(np.uint8))


class ColorMaskProcessor:
    def __init__(self, input_image, output_path):
        self.input_image = input_image
        self.output_path = output_path

    def create_color_mask(self, num_clusters):
        img_array = np.array(self.input_image)
        reshaped = img_array.reshape((-1, 3))
        kmeans = KMeans(n_clusters=num_clusters, random_state=42, n_init=10)
        kmeans.fit(reshaped)
        labels = kmeans.labels_
        segmented = labels.reshape(img_array.shape[:2])
        return [(segmented == i) for i in range(num_clusters)]

    def save_masks_as_images(self, image, masks):
        for i, mask in enumerate(masks):
            color_mask = np.zeros_like(image)
            color_mask[mask] = image[mask]
            mask_img = Image.fromarray(color_mask)
            mask_img.save(os.path.join(self.output_path, f"mask_{i}.png"))

            mask_array = np.array(mask_img)
            non_black = (mask_array[:, :, :3] > 0).any(axis=2)
            labeled, num = measure.label(non_black, connectivity=2, return_num=True)
            for lbl in range(1, num + 1):
                if np.sum(labeled == lbl) < 15:
                    non_black[labeled == lbl] = 0

            result = np.zeros_like(mask_array)
            result[non_black] = mask_array[non_black]
            Image.fromarray(result, self.input_image.mode).save(
                os.path.join(self.output_path, f"filtered_mask_{i}.png")
            )

    def process_image(self, num_clusters=4):
        masks = self.create_color_mask(num_clusters=num_clusters)
        self.save_masks_as_images(np.array(self.input_image), masks)


def _pil_to_base64(pil_img):
    buf = io.BytesIO()
    pil_img.save(buf, format='PNG')
    return f"data:image/png;base64,{base64.b64encode(buf.getvalue()).decode()}"


def _file_to_base64(path):
    if not os.path.exists(path):
        return None
    with open(path, 'rb') as f:
        data = f.read()
    return f"data:image/png;base64,{base64.b64encode(data).decode()}"


def run_colorwheel(
    mask_array,
    num_clusters=5,
    invert=True,
    image_size_um=None,
    compute_domain_spacing=False,
    domain_spacing_debug=False,
):
    """
    Run color wheel analysis on a grayscale mask.

    Args:
        mask_array: numpy uint8 (H,W) grayscale image
        num_clusters: number of orientation clusters for k-means
        invert: whether to invert the mask before processing

    Returns:
        dict with results and base64 images
    """
    gpu = check_cupy_available()
    num_clusters = max(1, min(int(num_clusters), 5))

    if invert:
        mask_array = 255 - mask_array

    domain_spacing = None
    if compute_domain_spacing and image_size_um is not None:
        try:
            from .domain_spacing import compute_domain_spacing_from_array

            domain_spacing = compute_domain_spacing_from_array(
                mask_array,
                float(image_size_um),
                input_is_mask=True,
                debug=bool(domain_spacing_debug),
            )
        except Exception as e:
            domain_spacing = {
                'success': False,
                'error': str(e),
            }

    # Compute orientation angle
    angle = compute_average_angle(mask_array)

    # Color wheel processing
    processor = ColorWheelProcessor(mask_array, gpu, color_wheel_origin=angle)
    color_wheel_img = processor.process_image()

    # Phase subtraction
    phase_sub = PhaseSubtraction(color_wheel_img, mask_array)
    one_phase = phase_sub.subtract_black_from_input()

    # Create masks in temp dir
    with tempfile.TemporaryDirectory() as tmpdir:
        mask_maker = ColorMaskProcessor(one_phase, tmpdir)
        mask_maker.process_image(num_clusters=num_clusters)

        # Collect mask images as base64
        mask_images = []
        for i in range(num_clusters):
            fpath = os.path.join(tmpdir, f"filtered_mask_{i}.png")
            b64 = _file_to_base64(fpath)
            if b64:
                mask_images.append(b64)

    return {
        'success': True,
        'orientation_angle': float(angle),
        'num_clusters': num_clusters,
        'gpu_accelerated': gpu,
        'color_wheel_base64': _pil_to_base64(color_wheel_img),
        'one_phase_base64': _pil_to_base64(one_phase),
        'grain_masks_base64': mask_images,
        'domain_spacing': domain_spacing,
    }
