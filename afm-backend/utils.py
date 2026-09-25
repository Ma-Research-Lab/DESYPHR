import base64
import io
import os
import uuid
from datetime import datetime
from pathlib import Path

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


def save_uploaded_image_from_bytes(raw: bytes, filename: str, item_dir: Path, index: int) -> str:
    ext = validate_extension(filename)
    safe_name = secure_filename(Path(filename).stem) or f"image_{index:03d}"

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    uid = uuid.uuid4().hex[:8]

    global_copy = config.UPLOAD_DIR / f"upload_{stamp}_{uid}_{safe_name}{ext}"
    global_copy.write_bytes(raw)

    item_copy = item_dir / f"input_{index:03d}_{safe_name}{ext}"
    item_copy.write_bytes(raw)
    return str(item_copy)


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
