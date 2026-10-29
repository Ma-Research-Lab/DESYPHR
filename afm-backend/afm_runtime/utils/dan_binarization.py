"""
Dan's Binarization & Spacing Analysis for the AFM backend runtime.
Adapted from 2.2.dansegmentation.py for use via API endpoints.
"""
import matplotlib
matplotlib.use('Agg')

import os
import io
import base64
import tempfile
import numpy as np
import cv2
import matplotlib.pyplot as plt
from scipy.ndimage import distance_transform_edt, label as scipy_label
from skimage.morphology import skeletonize
from skimage.filters import threshold_niblack
from PIL import Image


def _array_to_base64(arr):
    """Convert a uint8 numpy array to base64 PNG data URI."""
    img = Image.fromarray(arr)
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return f"data:image/png;base64,{base64.b64encode(buf.getvalue()).decode()}"


def _fig_to_base64(fig):
    """Convert a matplotlib figure to base64 PNG data URI."""
    buf = io.BytesIO()
    fig.savefig(buf, format='png', dpi=150, bbox_inches='tight')
    plt.close(fig)
    buf.seek(0)
    return f"data:image/png;base64,{base64.b64encode(buf.getvalue()).decode()}"


def binarize(gray_array, method='adaptive', adaptive_method='gaussian',
             block_size=11, C=2, niblack_window=25, k=0.1,
             blur='none', blur_ksize=5, equalize=False, clahe=False,
             combine_mode='OR', alpha=0.5):
    """
    Binarize a grayscale image using adaptive/niblack thresholding.

    Args:
        gray_array: uint8 grayscale numpy array (H, W)
        method: 'adaptive', 'niblack', or 'both'
        ... (all other parameters match Dan's implementation)

    Returns:
        dict with binary_base64, black_pixel_percent, binary_array
    """
    processed = gray_array.copy()

    # Preprocessing
    if equalize:
        processed = cv2.equalizeHist(processed)
    if clahe:
        clahe_obj = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        processed = clahe_obj.apply(processed)
    if blur == 'gaussian':
        processed = cv2.GaussianBlur(processed, (blur_ksize, blur_ksize), 0)
    elif blur == 'median':
        processed = cv2.medianBlur(processed, blur_ksize)
    elif blur == 'bilateral':
        processed = cv2.bilateralFilter(processed, 9, 75, 75)

    # Thresholding
    thresh_adaptive = None
    thresh_niblack_arr = None

    if method in ['adaptive', 'both']:
        flag = (cv2.ADAPTIVE_THRESH_GAUSSIAN_C if adaptive_method == 'gaussian'
                else cv2.ADAPTIVE_THRESH_MEAN_C)
        thresh_adaptive = cv2.adaptiveThreshold(
            processed, 255, flag, cv2.THRESH_BINARY_INV, block_size, C
        )

    if method in ['niblack', 'both']:
        t = threshold_niblack(processed, window_size=niblack_window, k=k)
        thresh_niblack_arr = (processed < t).astype(np.uint8) * 255

    # Combine
    if method == 'adaptive':
        final = thresh_adaptive
    elif method == 'niblack':
        final = thresh_niblack_arr
    elif method == 'both':
        if combine_mode == 'AND':
            final = cv2.bitwise_and(thresh_adaptive, thresh_niblack_arr)
        elif combine_mode == 'OR':
            final = cv2.bitwise_or(thresh_adaptive, thresh_niblack_arr)
        elif combine_mode == 'adaptive':
            final = thresh_adaptive
        elif combine_mode == 'niblack':
            final = thresh_niblack_arr
        elif combine_mode == 'weighted':
            blend = (alpha * thresh_adaptive.astype(np.float32) +
                     (1 - alpha) * thresh_niblack_arr.astype(np.float32))
            final = (blend > 127).astype(np.uint8) * 255
        else:
            final = cv2.bitwise_or(thresh_adaptive, thresh_niblack_arr)
    else:
        raise ValueError(f"Unknown method: {method}")

    black_percent = float(np.sum(final == 255) / final.size * 100)

    return {
        'success': True,
        'binary_base64': _array_to_base64(final),
        'black_pixel_percent': round(black_percent, 1),
        'binary_array': final,  # kept for chaining into spacing analysis
    }


def analyze_spacing(binary_array, image_size_um=2.0, invert=False):
    """
    Voronoi-based spacing analysis on a binary image.

    Args:
        binary_array: uint8 numpy array (H, W) binary mask (0/255)
        image_size_um: physical image size in micrometers
        invert: swap feature/background phase

    Returns:
        dict with spacing statistics and visualization base64 images
    """
    binary_img = binary_array.copy()
    pixel_size_nm = (image_size_um / binary_img.shape[0]) * 1000

    # Make the feature phase black. Features are separate islands in a
    # connected background, so a phase that splits into clearly more pieces
    # is the feature phase; otherwise fall back to the minority phase. (On a
    # ~50/50 image the minority rule alone can pick the connected background,
    # which has no cell boundaries and gives no spacing values.)
    black = binary_img == 0
    _, n_black = scipy_label(black)
    _, n_white = scipy_label(~black)
    if n_black >= 2 * max(n_white, 1):
        features_black = True
    elif n_white >= 2 * max(n_black, 1):
        features_black = False
    else:
        features_black = np.sum(black) <= np.sum(~black)
    if not features_black:
        binary_img = 255 - binary_img
    if invert:
        binary_img = 255 - binary_img

    # Label features
    black_mask = binary_img == 0
    region_labels, _ = scipy_label(black_mask)

    # Distance transform
    dist_transform, (inds_y, inds_x) = distance_transform_edt(
        ~black_mask, return_indices=True
    )
    nearest_labels = region_labels[inds_y, inds_x]

    # Voronoi boundaries
    padded = np.pad(nearest_labels, 1, mode='edge')
    boundary_mask = (
        (padded[1:-1, 1:-1] != padded[:-2, 1:-1]) |
        (padded[1:-1, 1:-1] != padded[2:, 1:-1]) |
        (padded[1:-1, 1:-1] != padded[1:-1, :-2]) |
        (padded[1:-1, 1:-1] != padded[1:-1, 2:])
    )
    skeleton_mask = boundary_mask & (~black_mask)
    skeleton_mask = skeletonize(skeleton_mask)

    # Calculate spacings
    diameter_px = 2.0 * dist_transform[skeleton_mask]
    diameter_nm = diameter_px * pixel_size_nm
    valid = diameter_nm[np.isfinite(diameter_nm) & (diameter_nm > 0)]

    if len(valid) == 0:
        return {
            'success': False,
            'error': 'No spacing values computed (no features detected)',
        }

    results = {
        'success': True,
        'mean_spacing_nm': round(float(np.mean(valid)), 2),
        'median_spacing_nm': round(float(np.median(valid)), 2),
        'std_spacing_nm': round(float(np.std(valid)), 2),
        'min_spacing_nm': round(float(np.min(valid)), 2),
        'max_spacing_nm': round(float(np.max(valid)), 2),
        'num_measurements': int(len(valid)),
    }

    # Generate histogram
    fig_hist, ax = plt.subplots(figsize=(6, 4), dpi=150)
    ax.hist(valid, bins=30, density=True,
            color=(1.0, 213 / 255., 73 / 255.), edgecolor='black', alpha=0.7)
    ax.axvline(results['mean_spacing_nm'], color='red', linestyle='--',
               label=f"Mean: {results['mean_spacing_nm']:.1f} nm")
    ax.axvline(results['median_spacing_nm'], color='blue', linestyle='--',
               label=f"Median: {results['median_spacing_nm']:.1f} nm")
    ax.set_xlabel('Inter-feature spacing (nm)')
    ax.set_ylabel('Probability Density')
    ax.set_title('Voronoi Spacing Distribution')
    ax.legend()
    ax.grid(alpha=0.3)
    fig_hist.tight_layout()
    results['histogram_base64'] = _fig_to_base64(fig_hist)

    # Generate skeleton overlay
    h, w = binary_img.shape[:2]
    fig_skel, ax2 = plt.subplots(figsize=(6, 6), dpi=150)
    ax2.imshow(binary_img, cmap='gray', vmin=0, vmax=255, interpolation='nearest')
    # Bold pink/purple cell lines: the 1 px skeleton is thickened for display only.
    cell_lines = cv2.dilate(skeleton_mask.astype(np.uint8), np.ones((2, 2), np.uint8)) > 0
    overlay = np.zeros((h, w, 4), dtype=float)
    overlay[..., :3] = (209 / 255., 31 / 255., 182 / 255.)  # #D11FB6
    overlay[cell_lines, 3] = 1.0
    ax2.imshow(overlay, interpolation='nearest')
    ax2.set_title('Voronoi Skeleton Overlay')
    ax2.axis('off')
    fig_skel.tight_layout()
    results['skeleton_overlay_base64'] = _fig_to_base64(fig_skel)

    return results
