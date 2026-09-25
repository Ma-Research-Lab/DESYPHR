"""
Dot extraction utility for isolating dot-like features from segmentation masks.

Mirrors the notebook's extract_dots_step(): uses connected-component analysis
with circularity, aspect-ratio, and area filters to keep only round dot features
(removing lines and irregular shapes). Used as a pre-processing step before
Voronoi analysis on 'mixed' or 'dots' morphology masks.
"""

import cv2
import numpy as np
from skimage.measure import label, regionprops


def extract_dots(
    mask: np.ndarray,
    min_circularity: float = 0.6,
    max_aspect_ratio: float = 1.8,
    min_area: int = 15,
    max_area: int = 1200,
) -> dict:
    """
    Extract only dot-like features from a binary segmentation mask.

    Parameters
    ----------
    mask : np.ndarray
        Grayscale mask image (H×W, uint8, 0–255).
    min_circularity : float
        Minimum circularity (4π·area / perimeter²) to keep a component.
    max_aspect_ratio : float
        Maximum major/minor axis ratio to keep a component.
    min_area : int
        Minimum area (pixels) for a component to be considered a dot.
    max_area : int
        Maximum area (pixels) for a component to be considered a dot.

    Returns
    -------
    dict with keys:
        dots_mask : np.ndarray  — uint8 mask with only dot centroids (5×5 blobs)
        total_components : int
        kept_dots : int
        rejected : int
    """
    # Binarize
    if mask.ndim == 3:
        mask = cv2.cvtColor(mask, cv2.COLOR_BGR2GRAY)
    _, binary = cv2.threshold(mask, 127, 255, cv2.THRESH_BINARY)

    # Morphological opening to clean noise
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    opened = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel, iterations=1)

    # Connected-component analysis
    labels_img = label(opened > 0)
    props = regionprops(labels_img)

    output = np.zeros_like(binary)
    kept = 0

    for prop in props:
        area = prop.area
        perimeter = prop.perimeter
        circularity = (4 * np.pi * area / (perimeter ** 2)) if perimeter > 0 else 0
        aspect = (
            prop.major_axis_length / prop.minor_axis_length
            if prop.minor_axis_length > 0
            else float("inf")
        )

        if (
            min_area <= area <= max_area
            and circularity >= min_circularity
            and aspect <= max_aspect_ratio
        ):
            cy, cx = map(int, prop.centroid)
            y1, y2 = max(cy - 2, 0), min(cy + 3, output.shape[0])
            x1, x2 = max(cx - 2, 0), min(cx + 3, output.shape[1])
            output[y1:y2, x1:x2] = 255
            kept += 1

    return {
        "dots_mask": output,
        "total_components": len(props),
        "kept_dots": kept,
        "rejected": len(props) - kept,
    }
