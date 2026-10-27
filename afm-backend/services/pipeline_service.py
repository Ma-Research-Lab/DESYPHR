from __future__ import annotations

import uuid
from pathlib import Path

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


def _preprocess_only(
    model_manager,
    image: Image.Image,
    *,
    denoise_strength: int = 0,
    sharpen_amount: int = 0,
    to_grayscale: bool = False,
    invert_pixels: bool = False,
):
    _, preprocessed_display = preprocess_image(
        image,
        img_size=model_manager.img_size,
        denoise_strength=denoise_strength,
        sharpen_amount=sharpen_amount,
        to_grayscale=to_grayscale,
        invert=invert_pixels,
        in_channels=model_manager.in_channels,
    )

    return {
        "preprocessed_data_url": image_to_base64(preprocessed_display),
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
        if predicted == "irregular":
            mask_result = {
                **_preprocess_only(
                    models.model_manager,
                    image,
                    denoise_strength=int(params.get("denoise", 0)),
                    sharpen_amount=int(params.get("sharpen", 0)),
                    to_grayscale=str(params.get("grayscale", "false")).lower() == "true",
                    invert_pixels=str(params.get("invert", "false")).lower() == "true",
                ),
                "mask_data_url": "",
                "confidence_data_url": "",
                "avg_confidence": 0.0,
                "min_confidence": 0.0,
                "max_confidence": 0.0,
                "mask_shape": [],
            }
        else:
            mask_result = _predict_mask(
                models.model_manager,
                image,
                threshold=float(params.get("threshold", 0.5)),
                denoise_strength=int(params.get("denoise", 0)),
                sharpen_amount=int(params.get("sharpen", 0)),
                to_grayscale=str(params.get("grayscale", "false")).lower() == "true",
                invert_pixels=str(params.get("invert", "false")).lower() == "true",
                invert_mask=str(params.get("invertMask", "false")).lower() == "true",
                morph_kernel=int(params.get("morphology", 0)),
            )

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
    }


def _append_data_output(additional_outputs: list[dict], label: str, data_url: str):
    if data_url:
        additional_outputs.append({"label": label, "url": data_url})


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
    if edited_mask_data_url and final_mask_path and predicted_class != "irregular":
        edited_final_out = item_dir / "edited_mask.png"
        final_mask_path = save_edited_mask_from_base64(edited_mask_data_url, mask_path, edited_final_out)

    extra1_url = extra2_url = extra3_url = extra4_url = ""
    extra1_note = extra2_note = extra3_note = extra4_note = ""
    summary_parts: list[str] = []
    detail_lines = [f"CNN predicted class: {predicted_class}"]
    metrics: list[dict] = []
    additional_outputs: list[dict] = []
    domain_spacing = None
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
        full_mask_spacing_nm = None
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
                min_area=int(item_payload.get("min_area", 15)),
                max_area=int(item_payload.get("max_area", 1200)),
            )
            voronoi_input = dot_result["dots_mask"]
            dot_stats = {
                "total_components": dot_result["total_components"],
                "kept_dots": dot_result["kept_dots"],
                "rejected": dot_result["rejected"],
            }
            dots_filename = "dots_only_mask.png" if predicted_class == "dots" else "mixed_dots_only.png"
            dots_path = item_dir / dots_filename
            Image.fromarray(voronoi_input).save(dots_path)
            dots_mask_url = image_path_to_data_url(str(dots_path))
            dot_extraction = {
                **dot_stats,
                "dots_mask_url": dots_mask_url,
            }
            _append_data_output(additional_outputs, "Dots Only Mask", dots_mask_url)

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
            num_clusters=min(int(item_payload.get("num_clusters", 5)), 5),
            invert=bool(item_payload.get("invert_colorwheel", True)),
            image_size_um=image_size_um,
            compute_domain_spacing=True,
            domain_spacing_debug=bool(item_payload.get("domain_spacing_debug", True)),
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
            if cw_spacing and (cw_spacing.get("debug") or {}).get("fft_magnitude_base64"):
                _append_data_output(additional_outputs, "FFT Magnitude", cw_spacing["debug"]["fft_magnitude_base64"])
            for idx, grain_mask in enumerate((colorwheel.get("grain_masks_base64") or [])[:5], start=1):
                _append_data_output(additional_outputs, f"Phase Cluster {idx}", grain_mask)
            if cw_spacing and (cw_spacing.get("debug") or {}).get("radial_profile_plot_base64"):
                _append_data_output(additional_outputs, "Radial FFT Profile", cw_spacing["debug"]["radial_profile_plot_base64"])
            summary_parts.append("ColorWheel")
            detail_lines.append("Color wheel analysis complete")

    if predicted_class == "irregular" and (saved_path or item_payload.get("preprocessed_image_url")):
        if item_payload.get("preprocessed_image_url"):
            gray_array = np.array(decode_base64_image(item_payload["preprocessed_image_url"]).convert("L"))
        else:
            gray_array = np.array(Image.open(saved_path).convert("L"))
        dan_binarized = dan_binarize(
            gray_array,
            method=str(item_payload.get("dan_method", "adaptive")),
            adaptive_method=str(item_payload.get("dan_adaptive_method", "gaussian")),
            block_size=int(item_payload.get("dan_block_size", 11)),
            C=int(item_payload.get("dan_c", 2)),
            niblack_window=int(item_payload.get("dan_niblack_window", 25)),
            k=float(item_payload.get("dan_k", 0.1)),
            blur=str(item_payload.get("dan_blur", "none")),
            blur_ksize=int(item_payload.get("dan_blur_ksize", 5)),
            equalize=bool(item_payload.get("dan_equalize", False)),
            clahe=bool(item_payload.get("dan_clahe", False)),
            combine_mode=str(item_payload.get("dan_combine_mode", "OR")),
            alpha=float(item_payload.get("dan_alpha", 0.5)),
        )
        if dan_binarized.get("success"):
            extra1_url = dan_binarized.get("binary_base64") or ""
            extra1_note = "Binarized Image"
            _append_data_output(additional_outputs, "Binarized Image", dan_binarized.get("binary_base64") or "")
            metrics.extend(
                parse_numeric_metrics(
                    {
                        "black_pixel_percent": dan_binarized.get("black_pixel_percent"),
                    }
                )
            )

            spacing = dan_analyze_spacing(
                dan_binarized["binary_array"],
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
                summary_parts.append("Dan Spacing")
                detail_lines.append("Dan binarization and spacing analysis complete")
            else:
                detail_lines.append(f"Dan spacing error: {spacing.get('error', 'Unknown error')}")

    seen = set()
    unique_metrics = []
    for metric in metrics:
        key = metric.get("key")
        if key and key not in seen and metric.get("value") not in {"None", None}:
            seen.add(key)
            unique_metrics.append(metric)

    summary = f"{predicted_class.upper()} class"
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
