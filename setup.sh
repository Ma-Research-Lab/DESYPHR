#!/bin/bash
#
# One-time setup for the AFM Analysis Platform.
#
# Creates a local Python virtualenv in ./.venv, installs the backend
# dependencies, and installs the frontend dependencies. Safe to re-run.
#
# By default PyTorch is installed as the CPU-only build, which is correct for
# any machine without an NVIDIA GPU and is much smaller than the CUDA build.
# On a machine with an NVIDIA GPU, run:  AFM_GPU=1 ./setup.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$ROOT_DIR/.venv"
WANT_GPU="${AFM_GPU:-0}"

echo "========================================"
echo "AFM Analysis Platform - Setup"
echo "========================================"

# --- 1. Find a suitable Python -------------------------------------------
# The backend needs 3.10-3.12. Newer versions often have no PyTorch wheels yet.
PYTHON_BIN=""
if [ -n "${AFM_SETUP_PYTHON:-}" ]; then
    PYTHON_BIN="$AFM_SETUP_PYTHON"
else
    for candidate in python3.12 python3.11 python3.10; do
        if command -v "$candidate" >/dev/null 2>&1; then
            PYTHON_BIN="$(command -v "$candidate")"
            break
        fi
    done
fi

if [ -z "$PYTHON_BIN" ]; then
    echo "Error: no suitable Python found. Need Python 3.10, 3.11, or 3.12."
    echo ""
    echo "On Ubuntu/Debian:"
    echo "    sudo apt install python3.12 python3.12-venv"
    echo ""
    echo "Or point setup at a specific interpreter:"
    echo "    AFM_SETUP_PYTHON=/path/to/python3.12 ./setup.sh"
    exit 1
fi

echo "Using Python: $PYTHON_BIN ($("$PYTHON_BIN" --version 2>&1))"

# --- 2. Create the virtualenv -------------------------------------------
if [ ! -x "$VENV_DIR/bin/python" ]; then
    echo ""
    echo "Creating virtualenv at .venv ..."
    if ! "$PYTHON_BIN" -m venv "$VENV_DIR" 2>/dev/null; then
        echo "Error: could not create the virtualenv."
        echo "You may need the venv package, e.g.:"
        echo "    sudo apt install python3.12-venv"
        exit 1
    fi
else
    echo ""
    echo "Reusing existing virtualenv at .venv"
fi

VENV_PY="$VENV_DIR/bin/python"
"$VENV_PY" -m pip install --quiet --upgrade pip

# --- 3. Install PyTorch ---------------------------------------------------
# Installed before requirements.txt so the CPU build wins. Installing it
# afterwards would let pip pull the default CUDA build and ~19 unused
# nvidia-* packages.
echo ""
if [ "$WANT_GPU" = "1" ]; then
    echo "Installing PyTorch (CUDA build, AFM_GPU=1) ..."
    "$VENV_PY" -m pip install torch torchvision
else
    echo "Installing PyTorch (CPU-only build) ..."
    "$VENV_PY" -m pip install --index-url https://download.pytorch.org/whl/cpu torch torchvision
fi

# --- 4. Install the rest of the backend ---------------------------------
echo ""
echo "Installing backend dependencies ..."
"$VENV_PY" -m pip install -r "$ROOT_DIR/afm-backend/requirements.txt"

# --- 5. Verify the models are present -----------------------------------
echo ""
echo "Checking model files ..."
MISSING=0
for model in cnn_rgb_classifier.pth model_Exp6_Full_SelfAttn_and_Gates.pt; do
    path="$ROOT_DIR/afm-backend/models/$model"
    if [ ! -f "$path" ]; then
        echo "  MISSING: afm-backend/models/$model"
        MISSING=1
    elif [ "$(stat -c%s "$path")" -lt 1000000 ]; then
        # A Git LFS pointer file is a few hundred bytes, not tens of megabytes.
        echo "  LOOKS LIKE A GIT LFS POINTER, not the real file: afm-backend/models/$model"
        echo "  Run: git lfs install && git lfs pull"
        MISSING=1
    else
        echo "  OK: $model ($(du -h "$path" | cut -f1))"
    fi
done
if [ "$MISSING" = "1" ]; then
    echo ""
    echo "Error: required model weights are missing or unresolved."
    exit 1
fi

# --- 6. Frontend ---------------------------------------------------------
echo ""
if ! command -v npm >/dev/null 2>&1; then
    echo "Error: npm was not found. Install Node.js 20 or newer."
    echo "See https://nodejs.org/ or use nvm."
    exit 1
fi
echo "Node: $(node --version), npm: $(npm --version)"

if [ -d "$ROOT_DIR/afm-frontend/node_modules" ]; then
    echo "Frontend dependencies already present, skipping npm install."
else
    echo "Installing frontend dependencies ..."
    (cd "$ROOT_DIR/afm-frontend" && npm install)
fi

# --- 7. Summary ----------------------------------------------------------
echo ""
echo "========================================"
echo "Setup complete"
echo "========================================"
"$VENV_PY" - <<'PY'
import torch
print(f"  PyTorch {torch.__version__}")
print(f"  CUDA available: {torch.cuda.is_available()}")
PY
echo ""
echo "Start the app with:"
echo "    ./start.sh"
echo ""
