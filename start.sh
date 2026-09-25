#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/afm-backend"
FRONTEND_DIR="$ROOT_DIR/afm-frontend"
# Resolve the Python interpreter used by the backend.
#
# Resolution order, first match wins:
#   1. $AFM_PYTHON            - explicit interpreter path, overrides everything
#   2. ./.venv/bin/python     - the local virtualenv created by setup.sh
#   3. Conda env $AFM_CONDA_ENV, if that env actually exists
#
# Keeping the venv first makes a fresh clone work with no Conda installed.
PYTHON=""
ENV_LABEL=""

if [ -n "${AFM_PYTHON:-}" ]; then
    if [ ! -x "$AFM_PYTHON" ]; then
        echo "Error: AFM_PYTHON is set to '$AFM_PYTHON' but that is not an executable."
        exit 1
    fi
    PYTHON="$AFM_PYTHON"
    ENV_LABEL="AFM_PYTHON override"
elif [ -x "$ROOT_DIR/.venv/bin/python" ]; then
    PYTHON="$ROOT_DIR/.venv/bin/python"
    ENV_LABEL="local virtualenv (.venv)"
else
    CONDA_ENV_NAME="${AFM_CONDA_ENV:-afm}"
    CONDA_EXE="$(command -v conda || true)"
    if [ -n "$CONDA_EXE" ]; then
        CONDA_ROOT="$(cd "$(dirname "$CONDA_EXE")/.." && pwd)"
        if [ -f "$CONDA_ROOT/etc/profile.d/conda.sh" ]; then
            # shellcheck disable=SC1091
            source "$CONDA_ROOT/etc/profile.d/conda.sh"
            if conda activate "$CONDA_ENV_NAME" 2>/dev/null; then
                PYTHON="$(command -v python)"
                ENV_LABEL="conda env '$CONDA_ENV_NAME'"
            fi
        fi
    fi
fi

if [ -z "$PYTHON" ]; then
    echo "Error: no Python environment for the backend was found."
    echo ""
    echo "Run the one-time setup first:"
    echo "    ./setup.sh"
    echo ""
    echo "Or point the launcher at an existing interpreter:"
    echo "    AFM_PYTHON=/path/to/python ./start.sh"
    exit 1
fi

# Fail early with a clear message rather than deep inside the backend import.
if ! "$PYTHON" -c "import torch, flask, cv2" >/dev/null 2>&1; then
    echo "Error: the Python environment at:"
    echo "    $PYTHON"
    echo "is missing backend dependencies (torch, flask, opencv)."
    echo ""
    echo "Run ./setup.sh to install them."
    exit 1
fi

# Report whether this machine can actually use a GPU, so the startup banner is
# honest instead of optimistically claiming "gpu".
if "$PYTHON" -c "import torch, sys; sys.exit(0 if torch.cuda.is_available() else 1)" >/dev/null 2>&1; then
    CUDA_AVAILABLE=true
else
    CUDA_AVAILABLE=false
fi

BACKEND_PORT="${AFM_BACKEND_PORT:-8050}"
FRONTEND_PORT="${AFM_FRONTEND_PORT:-3000}"
BACKEND_URL="http://127.0.0.1:$BACKEND_PORT"
NGROK_FRONTEND_TUNNEL="${AFM_NGROK_FRONTEND_TUNNEL:-afm-frontend}"
NGROK_BACKEND_TUNNEL="${AFM_NGROK_BACKEND_TUNNEL:-afm-backend}"
NGROK_CONFIG_SOURCE="${AFM_NGROK_CONFIG:-}"
NGROK_AUTHTOKEN="${AFM_NGROK_AUTHTOKEN:-}"
NGROK_RUNTIME_CONFIG="$ROOT_DIR/.ngrok.runtime.yml"
# Empty by default so ngrok assigns a URL, or picks up a reserved domain from
# the user's own ngrok.yml. Set AFM_NGROK_FRONTEND_DOMAIN to force a domain.
NGROK_FRONTEND_DOMAIN="${AFM_NGROK_FRONTEND_DOMAIN:-}"
NGROK_BACKEND_DOMAIN=""

BACKEND_PID=""
FRONTEND_PID=""
NGROK_PID=""
BACKEND_MODE="gpu"

# Snap stores its user configuration separately from a regular ngrok install.
# Prefer an explicit config path, then discover either supported location.
if [ -z "$NGROK_CONFIG_SOURCE" ]; then
    for candidate in \
        "$HOME/.config/ngrok/ngrok.yml" \
        "$HOME/snap/ngrok/current/.config/ngrok/ngrok.yml"; do
        if [ -f "$candidate" ]; then
            NGROK_CONFIG_SOURCE="$candidate"
            break
        fi
    done
fi

echo "========================================"
echo "AFM Analysis - Full Stack Launcher"
echo "========================================"
echo "Environment: $ENV_LABEL"
echo "Python: $PYTHON ($("$PYTHON" --version 2>&1))"
if [ "$CUDA_AVAILABLE" = true ]; then
    echo "CUDA: available"
else
    echo "CUDA: not available - running on CPU"
fi
echo ""

if [ ! -d "$BACKEND_DIR" ] || [ ! -d "$FRONTEND_DIR" ]; then
    echo "Error: expected afm-backend and afm-frontend under:"
    echo "  $ROOT_DIR"
    exit 1
fi

cleanup() {
    echo ""
    echo "Shutting down services..."
    if [ -n "$BACKEND_PID" ]; then
        kill "$BACKEND_PID" 2>/dev/null || true
    fi
    if [ -n "$FRONTEND_PID" ]; then
        kill "$FRONTEND_PID" 2>/dev/null || true
    fi
    if [ -n "$NGROK_PID" ]; then
        kill "$NGROK_PID" 2>/dev/null || true
    fi
}

trap cleanup INT TERM EXIT

start_backend_process() {
    local mode="$1"
    echo ""
    if [ "$mode" = "cpu" ]; then
        echo "Starting backend on port $BACKEND_PORT (CPU)..."
    else
        echo "Starting backend on port $BACKEND_PORT (GPU)..."
    fi

    (
        cd "$BACKEND_DIR"
        if [ "$mode" = "cpu" ]; then
            AFM_FORCE_CPU=1 "$PYTHON" app.py > "$ROOT_DIR/backend.log" 2>&1
        else
            "$PYTHON" app.py > "$ROOT_DIR/backend.log" 2>&1
        fi
    ) &
    BACKEND_PID=$!
    BACKEND_MODE="$mode"
    echo "  Backend PID: $BACKEND_PID"
}

wait_for_backend_health() {
    echo "Waiting for backend health check..."
    for i in {1..45}; do
        STATUS="$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/api/health" 2>/dev/null || true)"
        if [ "$STATUS" = "200" ]; then
            echo "  Backend is ready"
            return 0
        fi

        if [ -n "$BACKEND_PID" ] && ! kill -0 "$BACKEND_PID" 2>/dev/null; then
            return 1
        fi

        sleep 1
    done

    return 1
}

stop_port_listener() {
    local port="$1"
    local pids attempt
    pids="$(lsof -ti tcp:"$port" 2>/dev/null || true)"
    if [ -n "$pids" ]; then
        echo "  Releasing port $port..."
    fi

    for attempt in {1..8}; do
        pids="$(lsof -ti tcp:"$port" 2>/dev/null || true)"
        if [ -z "$pids" ]; then
            break
        fi
        echo "$pids" | xargs kill 2>/dev/null || true
        sleep 1
    done

    pids="$(lsof -ti tcp:"$port" 2>/dev/null || true)"
    if [ -n "$pids" ]; then
        echo "$pids" | xargs kill -9 2>/dev/null || true
        sleep 1
    fi
}

stop_next_dev_processes() {
    local pids
    pids="$(pgrep -f "next dev --port ${FRONTEND_PORT}" || true)"
    if [ -n "$pids" ]; then
        echo "  Stopping lingering Next.js dev processes..."
        echo "$pids" | xargs kill 2>/dev/null || true
        sleep 1
        pids="$(pgrep -f "next dev --port ${FRONTEND_PORT}" || true)"
        if [ -n "$pids" ]; then
            echo "$pids" | xargs kill -9 2>/dev/null || true
            sleep 1
        fi
    fi
}

stop_named_ngrok() {
    if ! command -v ngrok >/dev/null 2>&1; then
        return
    fi

    local ngrok_pids
    ngrok_pids="$(pgrep -f "ngrok.*${NGROK_FRONTEND_TUNNEL}" || true)"
    ngrok_pids="${ngrok_pids}"$'\n'"$(pgrep -f "ngrok.*${NGROK_BACKEND_TUNNEL}" || true)"
    ngrok_pids="$(echo "$ngrok_pids" | awk 'NF' | sort -u)"
    if [ -n "$ngrok_pids" ]; then
        echo "  Stopping existing ngrok tunnel process..."
        echo "$ngrok_pids" | xargs kill 2>/dev/null || true
        sleep 1
    fi
}

build_ngrok_runtime_config() {
    local authtoken="${NGROK_AUTHTOKEN}"
    local frontend_domain="${NGROK_FRONTEND_DOMAIN}"
    local backend_domain=""

    if [ -z "$authtoken" ] && [ -f "$NGROK_CONFIG_SOURCE" ]; then
        authtoken="$(awk '/authtoken:/ {print $2; exit}' "$NGROK_CONFIG_SOURCE")"
    fi
    if [ -z "$authtoken" ]; then
        return 1
    fi

    if [ -f "$NGROK_CONFIG_SOURCE" ]; then
        if [ -z "$frontend_domain" ]; then
            frontend_domain="$(awk -v tunnel="$NGROK_FRONTEND_TUNNEL" '
            $1 == tunnel ":" { in_tunnel=1; next }
            in_tunnel && $1 == "domain:" { print $2; exit }
            in_tunnel && /^[^[:space:]]/ { in_tunnel=0 }
            ' "$NGROK_CONFIG_SOURCE")"
        fi
        backend_domain="$(awk -v tunnel="$NGROK_BACKEND_TUNNEL" '
            $1 == tunnel ":" { in_tunnel=1; next }
            in_tunnel && $1 == "domain:" { print $2; exit }
            in_tunnel && /^[^[:space:]]/ { in_tunnel=0 }
        ' "$NGROK_CONFIG_SOURCE")"
    fi
    NGROK_FRONTEND_DOMAIN="$frontend_domain"
    NGROK_BACKEND_DOMAIN="$backend_domain"

    {
        echo 'version: "3"'
        if [ -n "$authtoken" ]; then
            echo "agent:"
            echo "  authtoken: $authtoken"
        fi
        echo
        echo "tunnels:"
        echo "  $NGROK_FRONTEND_TUNNEL:"
        echo "    proto: http"
        echo "    addr: $FRONTEND_PORT"
        if [ -n "$frontend_domain" ]; then
            echo "    domain: $frontend_domain"
        fi
        echo "  $NGROK_BACKEND_TUNNEL:"
        echo "    proto: http"
        echo "    addr: $BACKEND_PORT"
        if [ -n "$backend_domain" ]; then
            echo "    domain: $backend_domain"
        fi
    } > "$NGROK_RUNTIME_CONFIG"

    return 0
}

lookup_ngrok_url() {
    local tunnel_name="$1"
    "$PYTHON" - "$tunnel_name" <<'PY'
import json
import sys
import urllib.request

tunnel_name = sys.argv[1]
try:
    with urllib.request.urlopen("http://127.0.0.1:4040/api/tunnels", timeout=2) as response:
        data = json.load(response)
except Exception:
    print("")
    raise SystemExit(0)

for tunnel in data.get("tunnels", []):
    name = tunnel.get("name", "")
    public_url = tunnel.get("public_url", "")
    if name == tunnel_name and public_url.startswith("https://"):
        print(public_url)
        raise SystemExit(0)

for tunnel in data.get("tunnels", []):
    public_url = tunnel.get("public_url", "")
    if public_url.startswith("https://") and tunnel_name in tunnel.get("name", ""):
        print(public_url)
        raise SystemExit(0)

print("")
PY
}

if ! command -v ngrok >/dev/null 2>&1; then
    echo "Warning: ngrok is not installed."
    echo "Install with: sudo snap install ngrok"
    NGROK_AVAILABLE=false
else
    NGROK_AVAILABLE=true
fi

echo "Preparing frontend environment..."
stop_port_listener "$BACKEND_PORT"
stop_port_listener "$FRONTEND_PORT"
stop_next_dev_processes
stop_named_ngrok

if [ "$NGROK_AVAILABLE" = true ]; then
    build_ngrok_runtime_config >/dev/null 2>&1 || true
fi

FRONTEND_BACKEND_ENV_URL="$BACKEND_URL"
if [ -n "$NGROK_BACKEND_DOMAIN" ]; then
    FRONTEND_BACKEND_ENV_URL="https://$NGROK_BACKEND_DOMAIN"
fi

cat > "$FRONTEND_DIR/.env.local" <<EOF
NEXT_PUBLIC_BACKEND_URL=$FRONTEND_BACKEND_ENV_URL
NEXT_PUBLIC_LOCAL_BACKEND_URL=$BACKEND_URL
EOF
echo "  Backend URL -> $BACKEND_URL"
if [ "$FRONTEND_BACKEND_ENV_URL" != "$BACKEND_URL" ]; then
    echo "  Public backend URL -> $FRONTEND_BACKEND_ENV_URL"
fi

if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    echo ""
    echo "Installing frontend dependencies..."
    (
        cd "$FRONTEND_DIR"
        npm install
    )
fi

if [ "$CUDA_AVAILABLE" = true ]; then
    start_backend_process "gpu"
else
    start_backend_process "cpu"
fi
if ! wait_for_backend_health; then
    echo "  Backend failed to start in $BACKEND_MODE mode."
    if [ "$BACKEND_MODE" = "cpu" ]; then
        echo "Backend failed to become ready. See backend.log"
        tail -n 20 "$ROOT_DIR/backend.log" 2>/dev/null || true
        exit 1
    fi
    if grep -qiE "cuda error|out of memory|cuda out of memory" "$ROOT_DIR/backend.log" 2>/dev/null; then
        echo "  GPU startup failed; retrying on CPU..."
    else
        echo "  Retrying on CPU for a safer local startup..."
    fi

    if [ -n "$BACKEND_PID" ]; then
        kill "$BACKEND_PID" 2>/dev/null || true
        wait "$BACKEND_PID" 2>/dev/null || true
    fi

    start_backend_process "cpu"
    if ! wait_for_backend_health; then
        echo "Backend failed to become ready even after CPU fallback. See backend.log"
        exit 1
    fi
fi

PUBLIC_BACKEND_URL=""
PUBLIC_FRONTEND_URL=""

echo ""
echo "Starting frontend on port $FRONTEND_PORT..."
(
    cd "$FRONTEND_DIR"
    npm run dev -- --webpack --port "$FRONTEND_PORT" > "$ROOT_DIR/frontend.log" 2>&1
) &
FRONTEND_PID=$!
echo "  Frontend PID: $FRONTEND_PID"

echo "Waiting for frontend readiness..."
for i in {1..45}; do
    STATUS="$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$FRONTEND_PORT" 2>/dev/null || true)"
    if [ "$STATUS" = "200" ]; then
        echo "  Frontend is ready"
        break
    fi
    sleep 1
    if [ "$i" -eq 45 ]; then
        echo "Frontend failed to become ready. See frontend.log"
        exit 1
    fi
done

if [ "$NGROK_AVAILABLE" = true ]; then
    echo ""
    echo "Starting ngrok tunnels..."
    if [ -f "$NGROK_RUNTIME_CONFIG" ] && ngrok config check --config "$NGROK_RUNTIME_CONFIG" >/dev/null 2>&1; then
        ngrok start "$NGROK_FRONTEND_TUNNEL" "$NGROK_BACKEND_TUNNEL" --config "$NGROK_RUNTIME_CONFIG" --log=stdout > "$ROOT_DIR/ngrok.log" 2>&1 &
        NGROK_PID=$!
        echo "  Ngrok PID: $NGROK_PID"

        echo "  Waiting for ngrok tunnels..."
        for i in {1..20}; do
            sleep 2
            PUBLIC_FRONTEND_URL="$(lookup_ngrok_url "$NGROK_FRONTEND_TUNNEL")"
            PUBLIC_BACKEND_URL="$(lookup_ngrok_url "$NGROK_BACKEND_TUNNEL")"
            if [ -n "$PUBLIC_FRONTEND_URL" ] && [ -n "$PUBLIC_BACKEND_URL" ]; then
                echo "  Frontend ngrok URL detected: $PUBLIC_FRONTEND_URL"
                echo "  Backend ngrok URL detected: $PUBLIC_BACKEND_URL"
                break
            fi
        done
    else
        echo "  Ngrok needs an authtoken; skipping public tunnel startup."
        echo "  Run: ngrok config add-authtoken <token>"
        echo "  Or launch with: AFM_NGROK_AUTHTOKEN=<token> ./start.sh"
    fi
fi

echo ""
echo "========================================"
echo "Services running"
echo "========================================"
echo "Frontend: http://127.0.0.1:$FRONTEND_PORT"
echo "Backend:  $BACKEND_URL"
echo "Backend mode: $BACKEND_MODE"
if [ -n "$PUBLIC_FRONTEND_URL" ]; then
    echo "Frontend (ngrok): $PUBLIC_FRONTEND_URL"
fi
if [ -n "$PUBLIC_BACKEND_URL" ]; then
    echo "Backend (ngrok): $PUBLIC_BACKEND_URL"
fi
echo ""
echo "Logs:"
echo "  tail -f backend.log"
echo "  tail -f frontend.log"
if [ -n "$NGROK_PID" ]; then
    echo "  tail -f ngrok.log"
fi
echo ""
echo "Press Ctrl+C to stop"
echo "========================================"

wait "$BACKEND_PID" "$FRONTEND_PID"
