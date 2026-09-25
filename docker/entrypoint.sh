#!/bin/bash
# Starts the Flask backend, waits until its models are loaded and serving, then
# hands the container over to the Next.js server in the foreground.
set -euo pipefail

BACKEND_PORT="${AFM_BACKEND_PORT:-8050}"
FRONTEND_PORT="${AFM_FRONTEND_PORT:-3000}"

echo "==> Starting AFM backend on 127.0.0.1:${BACKEND_PORT} (CPU)"
cd /app/afm-backend
AFM_FORCE_CPU="${AFM_FORCE_CPU:-1}" \
AFM_BACKEND_HOST=127.0.0.1 \
AFM_BACKEND_PORT="${BACKEND_PORT}" \
    /opt/venv/bin/python app.py &
BACKEND_PID=$!

# Stop the whole container if either process dies, instead of leaving a
# half-running app that answers some requests and not others.
cleanup() {
    kill "${BACKEND_PID}" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

echo "==> Waiting for models to load (first start takes a minute)"
READY=0
for i in $(seq 1 300); do
    if curl -sf "http://127.0.0.1:${BACKEND_PORT}/api/health" >/dev/null 2>&1; then
        echo "==> Backend ready after ${i}s"
        READY=1
        break
    fi
    if ! kill -0 "${BACKEND_PID}" 2>/dev/null; then
        echo "!! Backend exited during startup. Output above should say why." >&2
        exit 1
    fi
    sleep 1
done

if [ "${READY}" -ne 1 ]; then
    echo "!! Backend did not become healthy within 300s." >&2
    exit 1
fi

echo "==> Starting frontend on 0.0.0.0:${FRONTEND_PORT}"
echo "==> Open http://localhost:${FRONTEND_PORT} in your browser"
cd /app/afm-frontend
exec npx next start -p "${FRONTEND_PORT}" -H 0.0.0.0
