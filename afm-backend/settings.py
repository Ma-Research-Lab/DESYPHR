from __future__ import annotations

import os
from pathlib import Path

from afm_runtime.config import CNN_MODEL_PATH, DEFAULT_CHECKPOINT_PATH

BASE_DIR = Path(__file__).resolve().parents[1]

UPLOAD_DIR = BASE_DIR / "uploads"
RESULTS_DIR = BASE_DIR / "results"

UPLOAD_DIR.mkdir(exist_ok=True)
RESULTS_DIR.mkdir(exist_ok=True)

ALLOWED_EXTS = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp"}
BACKEND_BASE_URL = os.environ.get("AFM_BACKEND_BASE_URL", "http://127.0.0.1:8050").rstrip("/")

# Backend server configuration.  Environment variables keep these configurable
# for local development and deployment while providing safe local defaults.
HOST = os.environ.get("AFM_BACKEND_HOST", "0.0.0.0")
PORT = int(os.environ.get("AFM_BACKEND_PORT", "8050"))
DEBUG = os.environ.get("AFM_BACKEND_DEBUG", "").lower() in {"1", "true", "yes"}

# Legacy compatibility names still used by the collaborator frontend adapter.
CNN_WEIGHTS = Path(CNN_MODEL_PATH)
UNET_WEIGHTS = Path(DEFAULT_CHECKPOINT_PATH)
