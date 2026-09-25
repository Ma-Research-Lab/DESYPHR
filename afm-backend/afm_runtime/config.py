"""Configuration for the copied source-backed AFM runtime."""

from __future__ import annotations

import os
from pathlib import Path

HOST = os.environ.get("AFM_BACKEND_HOST", "0.0.0.0")
PORT = int(os.environ.get("AFM_BACKEND_PORT", "8050"))
DEBUG = os.environ.get("AFM_BACKEND_DEBUG", "").lower() in {"1", "true", "yes"}

BASE_DIR = Path(__file__).resolve().parents[1]
MODELS_DIR = Path(os.environ.get("AFM_MODELS_DIR", str(BASE_DIR / "models")))

UPLOAD_FOLDER = str(BASE_DIR / "uploads")
MAX_CONTENT_LENGTH = 16 * 1024 * 1024
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "tif", "tiff", "bmp"}

DEFAULT_UNET_MODEL = os.environ.get("AFM_UNET_MODEL", "model_Exp6_Full_SelfAttn_and_Gates.pt")
DEFAULT_CNN_MODEL = os.environ.get("AFM_CNN_MODEL", "cnn_rgb_classifier.pth")

DEFAULT_CHECKPOINT_PATH = str(MODELS_DIR / DEFAULT_UNET_MODEL)
CNN_MODEL_PATH = str(MODELS_DIR / DEFAULT_CNN_MODEL)

IMG_SIZE = 256

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
