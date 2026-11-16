"""
On-the-fly augmentation for greyscale AFM images.

Everything is drawn fresh for every sample, so the network never sees the
same input twice. Geometry is a single affine warp with mirrored borders.
"""
from __future__ import annotations

import math

import cv2
import numpy as np

from afm_runtime.utils.cnn_preprocess import (
    INPUT_SIZE,
    mirror_square,
    normalize_intensity,
    reframe,
    resize_square,
)

# Zoom relative to "short side of the image fills the input". The training
# scans repeat every ~7 px at the input, so 0.5-2.8x covers ~3.5-20 px.
ZOOM_RANGE = (0.5, 2.8)


def random_view(arr: np.ndarray, rng: np.random.Generator, zoom: float | None = None,
                angle: float | None = None, flip: bool | None = None,
                centre: tuple[float, float] | None = None, size: int = INPUT_SIZE) -> np.ndarray:
    """Zoom + rotation + flip + translation in one warp, with mirrored borders."""
    h, w = arr.shape
    n = min(h, w)
    if zoom is None:
        zoom = math.exp(rng.uniform(math.log(ZOOM_RANGE[0]), math.log(ZOOM_RANGE[1])))
    if angle is None:
        angle = rng.uniform(0, 360)
    if flip is None:
        flip = rng.random() < 0.5
    if centre is None:
        centre = (rng.uniform(0, w), rng.uniform(0, h))

    scale = size * zoom / n  # output px per source px
    src = arr
    if scale < 1:
        # Anti-alias before shrinking.
        src = cv2.GaussianBlur(arr, (0, 0), 0.5 / scale)

    m = cv2.getRotationMatrix2D(centre, angle, scale)
    m[0, 2] += size / 2 - centre[0]
    m[1, 2] += size / 2 - centre[1]
    if flip:
        m = np.array([[-1, 0, size], [0, 1, 0]], dtype=np.float64) @ np.vstack([m, [0, 0, 1]])
    return cv2.warpAffine(src, m, (size, size), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT_101)


def add_tilt(arr, rng, max_amp=0.6):
    """Residual sample tilt / bow: a random plane plus a little curvature."""
    yy, xx = np.mgrid[-1:1:complex(0, arr.shape[0]), -1:1:complex(0, arr.shape[1])]
    a, b = rng.uniform(-1, 1, 2) * max_amp / 2
    c = rng.uniform(-1, 1) * max_amp / 4
    return arr + (a * xx + b * yy + c * (xx ** 2 + yy ** 2)).astype(np.float32)


def add_scan_lines(arr, rng, max_sigma=0.08):
    """Per-row height offsets, like uncorrected fast-scan line jumps."""
    rows = rng.normal(0, rng.uniform(0.01, max_sigma), size=(arr.shape[0], 1))
    # A few rows with a larger jump.
    jumps = rng.random(arr.shape[0]) < 0.02
    rows[jumps, 0] += rng.normal(0, 0.25, jumps.sum())
    return arr + rows.astype(np.float32)


def augment(arr: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """``arr``: native-resolution greyscale float image in [0, 1]. Returns (217, 217) in [0, 1]."""
    x = random_view(arr, rng)

    # Instrument artefacts are added before the display-level normalisation.
    if rng.random() < 0.5:
        x = add_tilt(x, rng)
    if rng.random() < 0.3:
        x = add_scan_lines(x, rng)
    x = normalize_intensity(x)

    # Flipped contrast: features can appear bright-on-dark or dark-on-bright.
    if rng.random() < 0.5:
        x = 1.0 - x

    # Tone: gamma, contrast, brightness.
    if rng.random() < 0.8:
        x = np.clip(x, 0, 1) ** math.exp(rng.uniform(math.log(0.6), math.log(1.6)))
        x = (x - 0.5) * rng.uniform(0.7, 1.3) + 0.5 + rng.uniform(-0.1, 0.1)

    # Optics / noise.
    if rng.random() < 0.3:
        x = cv2.GaussianBlur(x, (0, 0), rng.uniform(0.3, 1.2))
    if rng.random() < 0.3:
        x = x + rng.normal(0, rng.uniform(0.005, 0.05), x.shape).astype(np.float32)

    return np.clip(x, 0, 1).astype(np.float32)


def eval_view(arr: np.ndarray, zoom: float = 1.0, contrast_flip: bool = False) -> np.ndarray:
    """
    Deterministic view at a given zoom for validation and robustness tests.

    Uses the app's own preprocessing (cnn_preprocess), so test numbers
    reflect exactly what the app will feed the network. zoom > 1 crops the
    centre (bigger features); zoom < 1 mirror-tiles (smaller features).
    """
    if zoom == 1.0:
        x = resize_square(mirror_square(arr))
    else:
        x = resize_square(reframe(arr, min(arr.shape) / zoom))
    x = normalize_intensity(x)
    return (1.0 - x) if contrast_flip else x
