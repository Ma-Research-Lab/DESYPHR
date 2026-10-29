from __future__ import annotations

import uuid
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from afm_runtime.utils.colorwheel_analysis import run_colorwheel
from afm_runtime.utils.dan_binarization import (
    analyze_spacing as dan_analyze_spacing,
    binarize as dan_binarize,
)
from afm_runtime.utils.domain_spacing import compute_domain_spacing_from_array
from afm_runtime.utils.dot_extraction import extract_dots
from afm_runtime.utils.image_processing import (
    confidence_to_base64,
    image_to_base64,
    mask_to_base64,
    postprocess_mask,
    preprocess_image,
)
from afm_runtime.utils.inference import predict_segmentation
from afm_runtime.utils.voronoi_wrapper import run_voronoi

from model_bundle import ModelBundle
from utils import (
    decode_base64_image,
    extract_class_probabilities,
    image_path_to_data_url,
    parse_numeric_metrics,
    save_edited_mask_from_base64,
    save_uploaded_image_from_bytes,
)


def _data_url_from_mask_base64(mask_base64: str) -> str:
    return f"data:image/png;base64,{mask_base64}"


def _save_data_url_image(data_url: str, output_path: Path) -> str:
    if not data_url:
        return ""

    image = decode_base64_image(data_url).convert("RGBA")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(output_path)
    return str(output_path)


def _predict_mask(
    model_manager,
    image: Image.Image,
    *,
    threshold: float = 0.5,
    denoise_strength: int = 0,
    sharpen_amount: int = 0,
    to_grayscale: bool = False,
    invert_pixels: bool = False,
    invert_mask: bool = False,
    morph_kernel: int = 0,
):
    img_tensor, preprocessed_display = preprocess_image(
        image,
        img_size=model_manager.img_size,
        denoise_strength=denoise_strength,
        sharpen_amount=sharpen_amount,
        to_grayscale=to_grayscale,
        invert=invert_pixels,
        in_channels=model_manager.in_channels,
    )

    prediction = predict_segmentation(
        model_manager.model,
        img_tensor,
        model_manager.device,
        threshold=threshold,
        is_binary=model_manager.is_binary,
    )

    mask_classes = prediction["mask"].astype(np.uint8)
    if morph_kernel > 0:
        mask_255 = (mask_classes * 255).astype(np.uint8) if mask_classes.max() <= 1 else (mask_classes * 127).astype(np.uint8)
        mask_255 = postprocess_mask(mask_255, morph_kernel)
        mask_classes = (mask_255 > 127).astype(np.uint8)

    return {
        "mask_classes": mask_classes,
        "mask_data_url": _data_url_from_mask_base64(mask_to_base64(mask_classes, invert=invert_mask)),
        "confidence_data_url": _data_url_from_mask_base64(confidence_to_base64(prediction["confidence"])),
        "preprocessed_data_url": image_to_base64(preprocessed_display),
        "confidence": prediction["confidence"],
        "avg_confidence": float(prediction["confidence"].mean()),
        "min_confidence": float(prediction["confidence"].min()),
        "max_confidence": float(prediction["confidence"].max()),
        "mask_shape": list(mask_classes.shape),
    }


def _truthy(value) -> bool:
    return str(value).lower() == "true"


def _odd(value, minimum: int) -> int:
    number = max(int(value), minimum)
    return number if number % 2 else number + 1


def _binarization_kwargs(params) -> dict:
    """Binarization settings for irregular images, from upload / re-segment params."""
    use_adaptive = _truthy(params.get("binarizeAdaptive", "true"))
    use_niblack = _truthy(params.get("binarizeNiblack", "true"))
    if use_adaptive and use_niblack:
        method = "both"
    elif use_niblack:
        method = "niblack"
    else:
        method = "adaptive"
    return {
        "method": method,
        "adaptive_method": str(params.get("binarizeAdaptiveMethod", "gaussian")),
        "block_size": _odd(params.get("binarizeBlockSize", 11), 3),
        "C": int(float(params.get("binarizeC", 2))),
        "niblack_window": _odd(params.get("binarizeNiblackWindow", 25), 3),
        "k": float(params.get("binarizeK", 0.1)),
        "blur": str(params.get("binarizeBlur", "none")),
        "blur_ksize": _odd(params.get("binarizeBlurKsize", 5), 3),
        "equalize": _truthy(params.get("binarizeEqualize", "false")),
        "clahe": _truthy(params.get("binarizeClahe", "false")),
        "combine_mode": str(params.get("binarizeCombineMode", "OR")),
        "alpha": float(params.get("binarizeAlpha", 0.5)),
    }


def _binarize_mask(models: ModelBundle, image: Image.Image, params) -> dict:
    """Irregular images skip the U-Net: the binarized preprocessed image is the mask."""
    _, preprocessed_display = preprocess_image(
        image,
        img_size=models.model_manager.img_size,
        denoise_strength=int(params.get("denoise", 0)),
        sharpen_amount=int(params.get("sharpen", 0)),
        to_grayscale=_truthy(params.get("grayscale", "false")),
        invert=_truthy(params.get("invert", "false")),
        in_channels=models.model_manager.in_channels,
    )
    gray_array = np.array(preprocessed_display.convert("L"))
    binary = dan_binarize(gray_array, **_binarization_kwargs(params))["binary_array"]
    if _truthy(params.get("invertMask", "false")):
        binary = 255 - binary

    return {
        "mask_data_url": image_to_base64(Image.fromarray(binary)),
        "confidence_data_url": "",
        "preprocessed_data_url": image_to_base64(preprocessed_display),
        "avg_confidence": 0.0,
        "min_confidence": 0.0,
        "max_confidence": 0.0,
        "mask_shape": list(binary.shape),
        "black_pixel_percent": round(float(np.mean(binary == 255) * 100), 1),
    }


def _segment_image(models: ModelBundle, image: Image.Image, predicted_class: str, params) -> dict:
    if predicted_class == "irregular":
        return _binarize_mask(models, image, params)

    return _predict_mask(
        models.model_manager,
        image,
        threshold=float(params.get("threshold", 0.5)),
        denoise_strength=int(params.get("denoise", 0)),
        sharpen_amount=int(params.get("sharpen", 0)),
        to_grayscale=_truthy(params.get("grayscale", "false")),
        invert_pixels=_truthy(params.get("invert", "false")),
        invert_mask=_truthy(params.get("invertMask", "false")),
        morph_kernel=int(params.get("morphology", 0)),
    )


def _segmentation_settings(params) -> dict:
    return {
        "preprocessing": {
            "denoise": int(params.get("denoise", 0)),
            "sharpen": int(params.get("sharpen", 0)),
            "grayscale": str(params.get("grayscale", "false")).lower() == "true",
            "invert": str(params.get("invert", "false")).lower() == "true",
        },
        "postprocessing": {
            "threshold": float(params.get("threshold", 0.5)),
            "morphology": int(params.get("morphology", 0)),
            "invert_mask": str(params.get("invertMask", "false")).lower() == "true",
        },
        "binarization": _binarization_kwargs(params),
    }


def process_single_file(models: ModelBundle, file_storage, job_dir: Path, index: int, params: dict | None = None) -> dict:
    if not file_storage or not file_storage.filename:
        raise ValueError("Encountered an empty file in the batch.")

    original_filename = Path(file_storage.filename).name
    item_id = uuid.uuid4().hex[:10]
    item_dir = job_dir / f"item_{index:03d}_{item_id}"
    item_dir.mkdir(parents=True, exist_ok=True)

    raw = file_storage.read()
    params = params or {}
    saved_path = save_uploaded_image_from_bytes(raw, original_filename, item_dir, index)

    with Image.open(saved_path) as image:
        image = image.copy()
        cls = models.cnn_classifier.classify(image)
        predicted = cls.get("predicted_class", "unknown")
        mask_result = _segment_image(models, image, predicted, params)

    probabilities = extract_class_probabilities(cls.get("probabilities", {}))

    mask_path = item_dir / f"{Path(saved_path).stem}_mask.png"
    if mask_result["mask_data_url"]:
        _save_data_url_image(mask_result["mask_data_url"], mask_path)

    return {
        "item_id": item_id,
        "item_index": index,
        "item_dir": str(item_dir),
        "saved_path": saved_path,
        "saved_filename": Path(saved_path).name,
        "original_filename": original_filename,
        "mask_path": str(mask_path) if mask_result["mask_data_url"] else "",
        "mask_filename": mask_path.name if mask_result["mask_data_url"] else "",
        "predicted_class": predicted,
        "confidence": float(cls.get("confidence", 0.0)),
        "probabilities": probabilities,
        "cnn_model_name": Path(models.cnn_classifier.model_path).name if getattr(models.cnn_classifier, "model_path", None) else "cnn_rgb_classifier.pth",
        "unet_model_name": Path(models.model_manager.active_checkpoint).name if models.model_manager.active_checkpoint else "",
        "original_image_url": image_path_to_data_url(saved_path),
        "mask_image_url": mask_result["mask_data_url"],
        "preprocessed_image_url": mask_result["preprocessed_data_url"],
        "confidence_image_url": mask_result["confidence_data_url"],
        "avg_confidence": mask_result["avg_confidence"],
        "min_confidence": mask_result["min_confidence"],
        "max_confidence": mask_result["max_confidence"],
        "mask_shape": mask_result["mask_shape"],
        "black_pixel_percent": mask_result.get("black_pixel_percent"),
        "segmented_class": predicted,
        **_segmentation_settings(params),
    }


def resegment_item(models: ModelBundle, item_payload: dict, params: dict | None = None) -> dict:
    """Re-run preprocessing + U-Net for one already-uploaded item, keeping its id.

    Only the segmentation fields change; the CNN classification is left as-is
    because it does not depend on the segmentation parameters.
    """
    params = params or {}
    saved_path = item_payload["saved_path"]
    item_dir = Path(item_payload.get("item_dir") or Path(saved_path).parent)
    predicted = item_payload.get("predicted_class", "unknown")

    with Image.open(saved_path) as image:
        mask_result = _segment_image(models, image.copy(), predicted, params)

    mask_path = item_dir / f"{Path(saved_path).stem}_mask.png"
    if mask_result["mask_data_url"]:
        _save_data_url_image(mask_result["mask_data_url"], mask_path)

    return {
        "item_id": item_payload.get("item_id", ""),
        "mask_path": str(mask_path) if mask_result["mask_data_url"] else "",
        "mask_filename": mask_path.name if mask_result["mask_data_url"] else "",
        "unet_model_name": Path(models.model_manager.active_checkpoint).name if models.model_manager.active_checkpoint else "",
        "mask_image_url": mask_result["mask_data_url"],
        "preprocessed_image_url": mask_result["preprocessed_data_url"],
        "confidence_image_url": mask_result["confidence_data_url"],
        "avg_confidence": mask_result["avg_confidence"],
        "min_confidence": mask_result["min_confidence"],
        "max_confidence": mask_result["max_confidence"],
        "mask_shape": mask_result["mask_shape"],
        "black_pixel_percent": mask_result.get("black_pixel_percent"),
        "segmented_class": predicted,
        **_segmentation_settings(params),
    }


def _append_data_output(additional_outputs: list[dict], label: str, data_url: str):
    if data_url:
        additional_outputs.append({"label": label, "url": data_url})


def _format_metric_number(value) -> str | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return f"{number:.4f}" if np.isfinite(number) else None


def _mixed_grain_area(dot_area_um2, line_area_um2):
    """Average the dot and line grain areas; if either is missing or 0, use the other."""
    valid = []
    for value in (dot_area_um2, line_area_um2):
        try:
            number = float(value)
        except (TypeError, ValueError):
            continue
        if np.isfinite(number) and number > 0:
            valid.append(number)
    return sum(valid) / len(valid) if valid else None


def _valid_areas(values) -> list[float]:
    areas = []
    for value in values or []:
        try:
            number = float(value)
        except (TypeError, ValueError):
            continue
        if np.isfinite(number):
            areas.append(number)
    return areas


def _mixed_grain_area_std(dot_area_um2, dot_areas, line_area_um2, line_areas):
    """Stdev over the dot and line grains together, skipping a side whose average is missing or 0."""
    pooled = []
    if _mixed_grain_area(dot_area_um2, None) is not None:
        pooled.extend(_valid_areas(dot_areas))
    if _mixed_grain_area(None, line_area_um2) is not None:
        pooled.extend(_valid_areas(line_areas))
    return float(np.std(pooled)) if pooled else None


DOT_LINE_MAP_BACKGROUND = (255, 255, 255)
DOT_LINE_MAP_LINE = (128, 128, 128)
DOT_LINE_MAP_DOT = (30, 90, 230)


def _dot_line_map(feature_mask: np.ndarray, dots_region_mask: np.ndarray) -> Image.Image:
    """Colour a mixed mask: line features grey, dot features blue, background white.

    feature_mask holds every feature (dots and lines); dots_region_mask holds the
    components dot extraction kept as dots. Dot extraction works on a slightly
    opened mask, so the dot regions are grown back by a pixel within the features.
    """
    features = feature_mask > 127
    dots = cv2.dilate((dots_region_mask > 0).astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool) & features
    rgb = np.empty((*features.shape, 3), dtype=np.uint8)
    rgb[:] = DOT_LINE_MAP_BACKGROUND
    rgb[features & ~dots] = DOT_LINE_MAP_LINE
    rgb[dots] = DOT_LINE_MAP_DOT
    return Image.fromarray(rgb)


def _report_metrics(saved_path: str, image_size_um: float, spacing_nm, grain_area_um2, grain_area_std_um2=None) -> list[dict]:
    """The reduced metric set reported for dots, lines and mixed images."""
    metrics = []
    if saved_path:
        with Image.open(saved_path) as image:
            width, height = image.size
        metrics.append({"key": "image_size_px", "label": "Image size (px)", "value": f"{width} x {height}"})
    metrics.append({"key": "image_size_um", "label": "Image size (um)", "value": f"{image_size_um:g}"})

    spacing = _format_metric_number(spacing_nm)
    if spacing is not None:
        metrics.append({"key": "domain_spacing_nm", "label": "Periodicity / domain spacing (nm)", "value": spacing})
    grain = _format_metric_number(grain_area_um2)
    if grain is not None:
        metrics.append({"key": "grain_area_um2", "label": "Grain area (um^2)", "value": grain})
    grain_std = _format_metric_number(grain_area_std_um2)
    if grain_std is not None:
        metrics.append({"key": "grain_area_std_um2", "label": "Grain area stdev (um^2)", "value": grain_std})
    return metrics


def analyze_one_item(models: ModelBundle, item_payload: dict, edited_mask_data_url: str = "") -> dict:
    job_id = item_payload.get("job_id")
    job_dir = Path(item_payload.get("job_dir"))
    item_id = item_payload.get("item_id")
    item_dir = Path(item_payload.get("item_dir") or job_dir)

    saved_path = item_payload.get("saved_path")
    mask_path = item_payload.get("mask_path")
    predicted_class = item_payload.get("predicted_class", "unknown")
    cnn_model_name = item_payload.get("cnn_model_name", "")
    unet_model_name = item_payload.get("unet_model_name", "")
    original_filename = item_payload.get("original_filename", Path(saved_path).name if saved_path else "")
    image_size_um = float(item_payload.get("image_size_um", 1.0))

    final_mask_path = mask_path or ""
    if edited_mask_data_url and final_mask_path:
        edited_final_out = item_dir / "edited_mask.png"
        final_mask_path = save_edited_mask_from_base64(edited_mask_data_url, mask_path, edited_final_out)

    extra1_url = extra2_url = extra3_url = extra4_url = ""
    extra1_note = extra2_note = extra3_note = extra4_note = ""
    summary_parts: list[str] = []
    detail_lines = [f"CNN predicted class: {predicted_class.capitalize()}"]
    metrics: list[dict] = []
    additional_outputs: list[dict] = []
    domain_spacing = None
    full_mask_spacing_nm = None
    voronoi_results: dict = {}
    line_grain_area_um2 = None
    line_grain_area_std_um2 = None
    line_grain_areas_um2: list = []
    dots_region_mask = None
    domain_spacing_histogram_url = ""
    domain_spacing_skeleton_url = ""
    dot_extraction = None
    group_pixel_counts_text = ""

    mask_array = np.array(Image.open(final_mask_path).convert("L")) if final_mask_path else None

    if predicted_class in {"dots", "mixed"} and mask_array is not None:
        # Mirror the reference frontend flow:
        # the reviewed U-Net mask stays raw for display/editing, then the
        # Voronoi branch inverts it before dot extraction / tessellation.
        voronoi_input = 255 - mask_array

        # Measure domain spacing on the mask with all features, before dot
        # extraction strips the line features out of mixed images.
        try:
            full_mask_spacing = compute_domain_spacing_from_array(mask_array, image_size_um, input_is_mask=True)
            full_mask_spacing_nm = full_mask_spacing.get("spacing_nm")
        except Exception as e:
            detail_lines.append(f"Full-mask domain spacing error: {e}")

        dot_stats = None
        extract_dots_flag = bool(item_payload.get("extract_dots", predicted_class in {"dots", "mixed"}))
        if extract_dots_flag:
            dot_result = extract_dots(
                voronoi_input,
                min_circularity=float(item_payload.get("min_circularity", 0.6)),
                max_aspect_ratio=float(item_payload.get("max_aspect_ratio", 1.8)),
                min_area=int(item_payload.get("min_area", 0)),
                max_area=int(item_payload.get("max_area", 1200)),
            )
            voronoi_input = dot_result["dots_mask"]
            dots_region_mask = dot_result.get("dots_region_mask")
            dot_stats = {
                "total_components": dot_result["total_components"],
                "kept_dots": dot_result["kept_dots"],
                "rejected": dot_result["rejected"],
            }
            dots_filename = "dots_only_mask.png" if predicted_class == "dots" else "mixed_dots_only.png"
            dots_path = item_dir / dots_filename
            # Saved for display as black dots on white; voronoi_input itself is unchanged.
            Image.fromarray(255 - voronoi_input).save(dots_path)
            dots_mask_url = image_path_to_data_url(str(dots_path))
            dot_extraction = {
                **dot_stats,
                "dots_mask_url": dots_mask_url,
            }
            _append_data_output(additional_outputs, "Dots Only Mask", dots_mask_url)
            if predicted_class == "mixed" and dots_region_mask is not None:
                # 255 - mask_array is the feature phase dot extraction ran on.
                map_path = item_dir / "mixed_dot_line_map.png"
                _dot_line_map(255 - mask_array, dots_region_mask).save(map_path)
                _append_data_output(additional_outputs, "Dot & Line Map", image_path_to_data_url(str(map_path)))

        voronoi = run_voronoi(
            voronoi_input,
            image_size_um=image_size_um,
            threshold_edge=float(item_payload.get("threshold_edge", 0.25)),
            max_size=int(item_payload.get("max_size", 1024)),
            packing_edges=int(item_payload.get("packing_edges", 6)),
            domain_spacing_nm=full_mask_spacing_nm,
        )

        if dot_stats:
            voronoi["dot_extraction"] = dot_stats

        if voronoi.get("success"):
            extra1_url = voronoi.get("overlay_base64") or ""
            extra2_url = voronoi.get("morphology_map_base64") or ""
            extra3_url = voronoi.get("snapshot_base64") or extra3_url
            extra4_url = voronoi.get("original_base64") or extra4_url
            extra1_note = "Voronoi Overlay"
            extra2_note = "Morphology Map"
            if not extra3_note:
                extra3_note = "Voronoi Snapshot"
            if not extra4_note:
                extra4_note = "Voronoi Original"
            if predicted_class == "dots":
                # The morphology map and snapshot are not part of the dots report.
                extra2_url = extra2_note = ""
                extra3_url = extra3_note = ""

            voronoi_results = voronoi.get("results", {})
            metrics.extend(parse_numeric_metrics(voronoi_results))
            summary_parts.append("Voronoi")
            detail_lines.append("Voronoi analysis complete")
            group_pixel_counts_text = voronoi.get("group_pixel_counts_text") or ""
            if voronoi.get("warnings"):
                detail_lines.extend([f"Voronoi warning: {warning}" for warning in voronoi["warnings"]])

    if predicted_class in {"lines", "mixed"} and mask_array is not None:
        colorwheel = run_colorwheel(
            mask_array,
            num_clusters=min(int(item_payload.get("num_clusters", 4)), 5),
            invert=bool(item_payload.get("invert_colorwheel", True)),
            image_size_um=image_size_um,
            compute_domain_spacing=True,
            domain_spacing_debug=bool(item_payload.get("domain_spacing_debug", True)),
            # In mixed images, line grains are measured away from the dots.
            grain_exclude_mask=(dots_region_mask > 0) if predicted_class == "mixed" and dots_region_mask is not None else None,
        )

        if colorwheel.get("success"):
            phase_image_url = colorwheel.get("one_phase_base64") or ""
            fft_magnitude_url = ((colorwheel.get("domain_spacing") or {}).get("debug") or {}).get("fft_magnitude_base64") or ""
            if predicted_class == "lines":
                extra1_url = phase_image_url or extra1_url
                extra1_note = "Phase Image" if phase_image_url else extra1_note
            else:
                extra3_url = phase_image_url
                extra4_url = fft_magnitude_url
                extra3_note = "Phase Image" if phase_image_url else ""
                extra4_note = "FFT Magnitude" if fft_magnitude_url else ""

            cw_spacing = colorwheel.get("domain_spacing") or {}
            line_grain_area_um2 = colorwheel.get("grain_area_um2")
            line_grain_area_std_um2 = colorwheel.get("grain_area_std_um2")
            line_grain_areas_um2 = colorwheel.get("grain_areas_um2") or []
            # Average microdomain size in each orientation mask, before the mode filter.
            for micro in colorwheel.get("microdomains") or []:
                metrics.extend(
                    parse_numeric_metrics(
                        {
                            f"mask{micro['mask_index']}_microdomain_mean_px": micro.get("mean_size_px"),
                            f"mask{micro['mask_index']}_microdomain_mode_px": micro.get("mode_size_px"),
                            f"mask{micro['mask_index']}_microdomains_removed": micro.get("removed"),
                        }
                    )
                )
            if cw_spacing:
                metrics.extend(
                    parse_numeric_metrics(
                        {
                            "orientation_angle_deg": colorwheel.get("orientation_angle"),
                            "domain_spacing_nm": cw_spacing.get("spacing_nm"),
                            "paper_fit_r2": ((cw_spacing.get("paper_fit") or {}).get("r2")),
                            "fft_peak_index": cw_spacing.get("peak_index"),
                        }
                    )
                )
            # Kept for later use; not part of the reported metric set.
            metrics.extend(
                parse_numeric_metrics(
                    {
                        "phase_black_white_ratio": colorwheel.get("phase_black_white_ratio"),
                        "line_grain_count": colorwheel.get("grain_count"),
                    }
                )
            )
            _append_data_output(additional_outputs, "Grain Map", colorwheel.get("grain_map_base64") or "")
            if cw_spacing and (cw_spacing.get("debug") or {}).get("fft_magnitude_base64"):
                _append_data_output(additional_outputs, "FFT Magnitude", cw_spacing["debug"]["fft_magnitude_base64"])
            for idx, grain_mask in enumerate((colorwheel.get("grain_masks_base64") or [])[:5], start=1):
                _append_data_output(additional_outputs, f"Phase Cluster {idx}", grain_mask)
            if cw_spacing and (cw_spacing.get("debug") or {}).get("radial_profile_plot_base64"):
                _append_data_output(additional_outputs, "Radial FFT Profile", cw_spacing["debug"]["radial_profile_plot_base64"])
            summary_parts.append("ColorWheel")
            detail_lines.append("Color wheel analysis complete")

    if predicted_class == "irregular" and mask_array is not None:
        # The binarized mask was made (and possibly edited) in the Upload & edit stage.
        binary_array = np.where(mask_array > 127, 255, 0).astype(np.uint8)
        metrics.extend(
            parse_numeric_metrics(
                {
                    "black_pixel_percent": round(float(np.mean(binary_array == 255) * 100), 1),
                }
            )
        )

        spacing = dan_analyze_spacing(
            binary_array,
            image_size_um=image_size_um,
            invert=bool(item_payload.get("spacing_invert", False)),
        )
        if spacing.get("success"):
            domain_spacing = {
                "mean_spacing_nm": float(spacing.get("mean_spacing_nm", 0.0)),
                "median_spacing_nm": float(spacing.get("median_spacing_nm", 0.0)),
                "std_spacing_nm": float(spacing.get("std_spacing_nm", 0.0)),
                "min_spacing_nm": float(spacing.get("min_spacing_nm", 0.0)),
                "max_spacing_nm": float(spacing.get("max_spacing_nm", 0.0)),
                "num_measurements": int(spacing.get("num_measurements", 0)),
            }
            domain_spacing_histogram_url = spacing.get("histogram_base64") or ""
            domain_spacing_skeleton_url = spacing.get("skeleton_overlay_base64") or ""
            extra2_url = domain_spacing_histogram_url or extra2_url
            extra3_url = domain_spacing_skeleton_url or extra3_url
            extra2_note = "Spacing Histogram"
            extra3_note = "Skeleton Overlay"
            metrics.extend(parse_numeric_metrics(domain_spacing))
            summary_parts.append("Interfeature Spacing")
            detail_lines.append("Binarization and interfeature spacing analysis complete")
        else:
            detail_lines.append(f"Interfeature spacing error: {spacing.get('error', 'Unknown error')}")

    seen = set()
    unique_metrics = []
    for metric in metrics:
        key = metric.get("key")
        if key and key not in seen and metric.get("value") not in {"None", None}:
            seen.add(key)
            unique_metrics.append(metric)

    raw_metrics = unique_metrics
    if predicted_class in {"dots", "lines", "mixed"}:
        metric_by_key = {metric["key"]: metric["value"] for metric in unique_metrics}
        dot_grain_area_um2 = voronoi_results.get("average_group_area_um2")
        if predicted_class == "lines":
            spacing_nm = metric_by_key.get("domain_spacing_nm")
            grain_area_um2 = line_grain_area_um2
            grain_area_std_um2 = line_grain_area_std_um2
        else:
            spacing_nm = full_mask_spacing_nm
            if spacing_nm is None:
                spacing_nm = voronoi_results.get("periodicity") if predicted_class == "dots" else metric_by_key.get("domain_spacing_nm")
            if predicted_class == "dots":
                grain_area_um2 = dot_grain_area_um2
                grain_area_std_um2 = voronoi_results.get("std_group_area_um2")
            else:
                grain_area_um2 = _mixed_grain_area(dot_grain_area_um2, line_grain_area_um2)
                grain_area_std_um2 = _mixed_grain_area_std(
                    dot_grain_area_um2,
                    voronoi_results.get("group_areas_um2"),
                    line_grain_area_um2,
                    line_grain_areas_um2,
                )
        unique_metrics = _report_metrics(saved_path, image_size_um, spacing_nm, grain_area_um2, grain_area_std_um2)

    summary = f"{predicted_class.capitalize()} class"
    if summary_parts:
        summary += " · " + " + ".join(summary_parts)

    return {
        "message": "Analysis complete",
        "summary": summary,
        "job_id": job_id,
        "job_dir": str(job_dir),
        "item_id": item_id,
        "cnn_model_name": cnn_model_name,
        "unet_model_name": unet_model_name,
        "predicted_class": predicted_class,
        "confidence": float(item_payload.get("confidence", 0.0)),
        "probabilities": extract_class_probabilities(item_payload.get("probabilities", {})),
        "final_mask_path": final_mask_path,
        "final_mask_filename": Path(final_mask_path).name if final_mask_path else "",
        "original_filename": original_filename,
        "original_image_url": image_path_to_data_url(saved_path),
        "final_mask_url": image_path_to_data_url(final_mask_path),
        "extra1_url": extra1_url,
        "extra2_url": extra2_url,
        "extra3_url": extra3_url,
        "extra4_url": extra4_url,
        "extra1_note": extra1_note,
        "extra2_note": extra2_note,
        "extra3_note": extra3_note,
        "extra4_note": extra4_note,
        "domain_spacing": domain_spacing,
        "domain_spacing_histogram_url": domain_spacing_histogram_url,
        "domain_spacing_skeleton_url": domain_spacing_skeleton_url,
        "dot_extraction": dot_extraction,
        "group_pixel_counts_text": group_pixel_counts_text,
        "metrics": unique_metrics,
        "raw_metrics": raw_metrics,
        "details": "\n".join(detail_lines),
        "additional_outputs": additional_outputs,
    }
def predict_json_from_upload(models: ModelBundle, file_storage, params: dict):
    if not file_storage or not file_storage.filename:
        raise ValueError("No file provided")

    threshold = float(params.get("threshold", 0.5))
    denoise_strength = int(params.get("denoise", 0))
    sharpen_amount = int(params.get("sharpen", 0))
    morph_kernel = int(params.get("morphology", 0))
    to_grayscale = str(params.get("grayscale", "false")).lower() == "true"
    invert = str(params.get("invert", "false")).lower() == "true"
    invert_mask = str(params.get("invertMask", "false")).lower() == "true"

    image = Image.open(file_storage.stream)
    original_size = list(image.size)

    img_tensor, preprocessed_display = preprocess_image(
        image,
        img_size=models.model_manager.img_size,
        denoise_strength=denoise_strength,
        sharpen_amount=sharpen_amount,
        to_grayscale=to_grayscale,
        invert=invert,
        in_channels=models.model_manager.in_channels,
    )

    prediction = predict_segmentation(
        models.model_manager.model,
        img_tensor,
        models.model_manager.device,
        threshold=threshold,
        is_binary=models.model_manager.is_binary,
    )

    mask_classes = prediction["mask"].astype(np.uint8)
    if morph_kernel > 0:
        mask_255 = (mask_classes * 255).astype(np.uint8) if mask_classes.max() <= 1 else (mask_classes * 127).astype(np.uint8)
        mask_255 = postprocess_mask(mask_255, morph_kernel)
        mask_classes = (mask_255 > 127).astype(np.uint8)

    unique_classes = np.unique(mask_classes).tolist()
    class_distribution = {}
    for cls in unique_classes:
        percentage = 100 * (mask_classes == cls).sum() / mask_classes.size
        class_name = models.model_manager.class_names[cls] if cls < len(models.model_manager.class_names) else f"class_{cls}"
        class_distribution[class_name] = float(percentage)

    mask_b64 = mask_to_base64(mask_classes, invert=invert_mask)
    conf_b64 = confidence_to_base64(prediction["confidence"])

    return {
        "success": True,
        "mode": "production",
        "filename": file_storage.filename,
        "original_size": original_size,
        "processed_size": [models.model_manager.img_size, models.model_manager.img_size],
        "avg_confidence": float(prediction["confidence"].mean()),
        "min_confidence": float(prediction["confidence"].min()),
        "max_confidence": float(prediction["confidence"].max()),
        "unique_classes": unique_classes,
        "class_distribution": class_distribution,
        "mask_base64": mask_b64,
        "confidence_base64": conf_b64,
        "preprocessed_base64": image_to_base64(preprocessed_display),
        "mask_shape": list(mask_classes.shape),
        "threshold_used": threshold,
        "processing_time_ms": 0,
        "preprocessing": {
            "denoise": denoise_strength,
            "sharpen": sharpen_amount,
            "grayscale": to_grayscale,
            "invert": invert,
        },
        "postprocessing": {
            "morphology": morph_kernel,
        },
    }
