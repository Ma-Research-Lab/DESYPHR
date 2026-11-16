import base64
import io
import os
import uuid
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image
from werkzeug.utils import secure_filename

import settings as config


def validate_extension(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext == ".jpeg":
        ext = ".jpg"
    if ext not in config.ALLOWED_EXTS:
        raise ValueError(f"Unsupported file type {ext}. Allowed: {sorted(config.ALLOWED_EXTS)}")
    return ext


def center_crop_square(image: Image.Image, position: float = 0.5) -> tuple[Image.Image, dict | None]:
    """Crop a rectangular image to a square of side min(width, height).

    ``position`` places the square along the long axis: 0 = left/top edge,
    0.5 = centre (default), 1 = right/bottom edge. The CNN, U-Net and the
    spacing/grain analysis all assume a square scan (one ``image_size_um`` for
    both axes), so rectangular uploads are cropped rather than stretched or
    padded. Returns the image and a description of the crop, or ``None`` when
    the image was already square.
    """
    w, h = image.size
    if w == h:
        return image, None
    side = min(w, h)
    position = min(1.0, max(0.0, float(position)))
    shift = int(round(position * (max(w, h) - side)))
    left, top = (shift, 0) if w > h else (0, shift)
    cropped = image.crop((left, top, left + side, top + side))
    return cropped, {
        "original_size": [w, h],
        "cropped_size": [side, side],
        "offset": [left, top],
        "position": round(position, 4),
        "kept_fraction": round(side / max(w, h), 4),
        "axis": "width" if w > h else "height",
    }


def crop_preview_data_url(image: Image.Image, max_side: int = 360) -> str:
    """Small JPEG of the whole uncropped image, for the crop picker."""
    preview = image.copy()
    if preview.mode not in ("L", "RGB", "RGBA"):
        arr = np.asarray(preview, dtype=np.float32)
        lo, hi = np.percentile(arr, [1, 99])
        arr = np.clip((arr - lo) / max(hi - lo, 1e-9) * 255, 0, 255).astype(np.uint8)
        preview = Image.fromarray(arr)
    preview = preview.convert("RGB")
    preview.thumbnail((max_side, max_side))
    buf = io.BytesIO()
    preview.save(buf, format="JPEG", quality=85)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("utf-8")


def save_square_crop(source_path: str, out_path: str, position: float = 0.5) -> dict | None:
    """Crop ``source_path`` at ``position`` and write it to ``out_path``."""
    with Image.open(source_path) as im:
        im.load()
        cropped, crop = center_crop_square(im, position)
        cropped.save(out_path)
        if crop is not None:
            crop["source_path"] = str(source_path)
            crop["preview_url"] = crop_preview_data_url(im)
    return crop


def save_uploaded_image_from_bytes(raw: bytes, filename: str, item_dir: Path, index: int) -> tuple[str, dict | None]:
    """Save an upload; rectangular images are centre-cropped to a square.

    The untouched upload is kept in UPLOAD_DIR and, for cropped images, also
    in the item folder so the crop can be moved later (see save_square_crop).
    The per-item copy that the pipeline reads is the (possibly cropped)
    square. Returns the item path and the crop description (``None`` if no
    crop was needed).
    """
    ext = validate_extension(filename)
    safe_name = secure_filename(Path(filename).stem) or f"image_{index:03d}"

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    uid = uuid.uuid4().hex[:8]

    global_copy = config.UPLOAD_DIR / f"upload_{stamp}_{uid}_{safe_name}{ext}"
    global_copy.write_bytes(raw)

    try:
        with Image.open(io.BytesIO(raw)) as im:
            w, h = im.size
    except OSError as exc:  # unreadable or truncated image
        raise ValueError(f"Could not read image {filename}: {exc}") from exc

    if w != h:
        source = item_dir / f"source_{index:03d}_{safe_name}{ext}"
        source.write_bytes(raw)
        # Re-encoding a JPEG would add compression artefacts; store PNG.
        out_ext = ".png" if ext == ".jpg" else ext
        item_copy = item_dir / f"input_{index:03d}_{safe_name}{out_ext}"
        return str(item_copy), save_square_crop(str(source), str(item_copy))

    item_copy = item_dir / f"input_{index:03d}_{safe_name}{ext}"
    item_copy.write_bytes(raw)
    return str(item_copy), None


def image_path_to_data_url(image_path: str) -> str:
    if not image_path or not os.path.exists(image_path):
        return ""
    with Image.open(image_path) as im:
        im = im.convert("RGBA")
        buf = io.BytesIO()
        im.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{b64}"


def decode_base64_image(data_url: str) -> Image.Image:
    if not data_url or "," not in data_url:
        raise ValueError("Invalid base64 image format.")
    _, b64data = data_url.split(",", 1)
    raw = base64.b64decode(b64data)
    return Image.open(io.BytesIO(raw))


def save_edited_mask_from_base64(data_url: str, original_mask_path: str, out_path: Path) -> str:
    edited_img = decode_base64_image(data_url).convert("L")

    with Image.open(original_mask_path) as orig:
        edited_img = edited_img.resize(orig.size, Image.NEAREST)

    out_path.parent.mkdir(exist_ok=True)
    edited_img.save(str(out_path))
    return str(out_path)


def parse_numeric_metrics(result_dict: dict) -> list[dict]:
    metrics = []

    if not isinstance(result_dict, dict):
        return metrics

    for key, value in result_dict.items():
        if isinstance(value, (int, float)):
            label = key.replace("_", " ").strip()
            display = f"{value:.4f}" if isinstance(value, float) else str(value)
            metrics.append({"key": key, "label": label, "value": display})

    return metrics


def extract_class_probabilities(probabilities: dict) -> dict:
    ordered_keys = ["dots", "mixed", "lines", "irregular"]
    cleaned = {}
    for key in ordered_keys:
        cleaned[key] = float(probabilities.get(key, 0.0))
    for key, value in probabilities.items():
        if key not in cleaned:
            cleaned[key] = float(value)
    return cleaned


def decode_data_url_to_pil(data_url: str):
    if not data_url or "," not in data_url:
        return None

    try:
        if data_url.startswith("data:"):
            _, b64data = data_url.split(",", 1)
            raw = base64.b64decode(b64data)
            return Image.open(io.BytesIO(raw)).convert("RGB")
        return None
    except Exception:
        return None


def fit_image_size(img_w, img_h, max_w, max_h):
    if img_w <= 0 or img_h <= 0:
        return max_w, max_h
    scale = min(max_w / img_w, max_h / img_h)
    return img_w * scale, img_h * scale


def wrap_text(text: str, max_chars: int = 110):
    if not text:
        return []
    lines = []
    for paragraph in str(text).split("\n"):
        words = paragraph.split()
        if not words:
            lines.append("")
            continue

        current = words[0]
        for word in words[1:]:
            candidate = current + " " + word
            if len(candidate) <= max_chars:
                current = candidate
            else:
                lines.append(current)
                current = word
        lines.append(current)
    return lines


def sanitize_filename(name: str, fallback: str = "export") -> str:
    safe = secure_filename(name or "")
    return safe or fallback
