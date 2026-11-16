"""
Greyscale input preparation for the morphology CNN.

Shared by the app (inference) and training/train.py so both always build the
network input the same way. Depends only on numpy, OpenCV and Pillow.

Pipeline:
  0. Trim a thin dark frame (1-3 px) if present. Most dots/lines/mixed training
     TIFFs had a 1 px black border and no irregular image did, so a frame
     alone could have given the class away.
  1. Convert to greyscale luminance. AFM colour maps are a display choice, so the
     model must not depend on them.
  2. Mirror-pad non-square images to square. Black padding was an artificial
     edge the old model could latch onto.
  3. Resize to INPUT_SIZE x INPUT_SIZE (area interpolation when shrinking).
  4. Stretch intensities so the 1st-99th percentiles span [0, 1]. This removes
     brightness/contrast differences between instruments and screenshots.
"""
from __future__ import annotations

import cv2
import numpy as np
from PIL import Image

INPUT_SIZE = 217
LOW_PCT, HIGH_PCT = 1.0, 99.0


def to_grey(pil_image: Image.Image) -> np.ndarray:
    """Luminance in [0, 1] as float32 (H, W). Alpha is composited onto black."""
    if pil_image.mode in ("RGBA", "LA", "P"):
        rgba = pil_image.convert("RGBA")
        bg = Image.new("RGBA", rgba.size, (0, 0, 0, 255))
        pil_image = Image.alpha_composite(bg, rgba)
    if pil_image.mode in ("I;16", "I;16B", "I;16L", "I", "F"):
        arr = np.asarray(pil_image, dtype=np.float32)
        lo, hi = float(arr.min()), float(arr.max())
        return ((arr - lo) / (hi - lo + 1e-12)).astype(np.float32)
    return np.asarray(pil_image.convert("L"), dtype=np.float32) / 255.0


def trim_dark_frame(arr: np.ndarray, max_px: int = 3, ratio: float = 0.35) -> np.ndarray:
    """Remove up to ``max_px`` edge rows/columns much darker than the interior."""
    h, w = arr.shape[:2]
    if min(h, w) < 4 * max_px + 8:
        return arr
    inner = float(arr[max_px:-max_px, max_px:-max_px].mean())
    if inner <= 1e-6:
        return arr
    top = bottom = left = right = 0
    while top < max_px and arr[top].mean() < ratio * inner:
        top += 1
    while bottom < max_px and arr[h - 1 - bottom].mean() < ratio * inner:
        bottom += 1
    while left < max_px and arr[:, left].mean() < ratio * inner:
        left += 1
    while right < max_px and arr[:, w - 1 - right].mean() < ratio * inner:
        right += 1
    return arr[top:h - bottom, left:w - right]


def normalize_intensity(arr: np.ndarray) -> np.ndarray:
    lo, hi = np.percentile(arr, [LOW_PCT, HIGH_PCT])
    if hi - lo < 1e-6:
        return np.zeros_like(arr, dtype=np.float32)
    return np.clip((arr - lo) / (hi - lo), 0.0, 1.0).astype(np.float32)


def mirror_square(arr: np.ndarray) -> np.ndarray:
    h, w = arr.shape[:2]
    if h == w:
        return arr
    n = max(h, w)
    py, px = n - h, n - w
    return np.pad(arr, ((py // 2, py - py // 2), (px // 2, px - px // 2)), mode="symmetric")


def resize_square(arr: np.ndarray, size: int = INPUT_SIZE) -> np.ndarray:
    interp = cv2.INTER_AREA if arr.shape[0] > size else cv2.INTER_CUBIC
    return cv2.resize(arr, (size, size), interpolation=interp)


def reframe(arr: np.ndarray, view: float) -> np.ndarray:
    """Centre square of side ``view`` px, mirror-tiling past the edges."""
    h, w = arr.shape[:2]
    side = max(8, int(round(view)))
    pad_y = max(0, (side - h + 1) // 2 + 1)
    pad_x = max(0, (side - w + 1) // 2 + 1)
    if pad_y or pad_x:
        arr = np.pad(arr, ((pad_y, pad_y), (pad_x, pad_x)), mode="symmetric")
    H, W = arr.shape[:2]
    y0, x0 = (H - side) // 2, (W - side) // 2
    return arr[y0:y0 + side, x0:x0 + side]


def model_input(pil_image: Image.Image, view: float | None = None, size: int = INPUT_SIZE) -> np.ndarray:
    """
    Float32 (size, size) array in [0, 1], ready for the network.

    ``view``: optional side (native px) of the field of view to use instead
    of the whole image. Used for scale normalisation and zoom tests.
    """
    arr = trim_dark_frame(to_grey(pil_image))
    arr = reframe(arr, view) if view is not None else mirror_square(arr)
    return normalize_intensity(resize_square(arr, size))
