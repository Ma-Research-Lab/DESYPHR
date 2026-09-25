# AFM Analysis Platform - self-contained image.
#
# Runs both halves of the app in one container:
#   - Flask backend  on 127.0.0.1:8050  (internal only, never published)
#   - Next.js server on 0.0.0.0:3000    (the port you open in a browser)
#
# No URL rewiring is needed because the frontend proxies /api/backend/* to the
# Flask port server-side, and the backend returns images as inline data URIs
# rather than absolute links.
#
# Build:  docker compose build
# Run:    docker compose up

# ---------------------------------------------------------------------------
# Stage 1 - build the Next.js frontend
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS frontend-builder

ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /build

# Copy manifests first so this layer caches independently of source edits.
COPY afm-frontend/package.json afm-frontend/package-lock.json ./
RUN npm ci

COPY afm-frontend/ ./
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2 - runtime
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS runtime

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

# python3 (3.11 on bookworm) plus the shared libraries OpenCV and torch need.
# libgl1/libglib2.0-0 are required by opencv-python; libgomp1 by torch.
#
# Note: this is Python 3.11, while ./setup.sh uses 3.12 on the host. Both are
# supported by every dependency here and all have cp311 wheels, so no package
# gets built from source. requirements.txt is left unpinned deliberately, so the
# build resolves wheels that exist for whichever interpreter Debian ships.
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 \
        python3-venv \
        libgl1 \
        libglib2.0-0 \
        libgomp1 \
        curl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Run as a normal user rather than root. The official node images already ship a
# `node` user at uid 1000, so reuse it instead of creating another uid-1000 user
# (useradd would fail with "UID 1000 is not unique"). uid 1000 also matches the
# typical Linux desktop user, so bind-mounted uploads/ and results/ stay
# writable from the host side.

WORKDIR /app

# ---- Python dependencies -------------------------------------------------
# CPU-only torch is installed FIRST, from the PyTorch CPU index, so the
# requirements.txt install below cannot pull the default CUDA build and its
# ~19 unused nvidia-* packages (several GB that no CPU machine can use).
COPY afm-backend/requirements.txt afm-backend/requirements.txt
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --upgrade pip \
    && /opt/venv/bin/pip install \
         --index-url https://download.pytorch.org/whl/cpu \
         torch torchvision \
    && /opt/venv/bin/pip install -r afm-backend/requirements.txt

# ---- Frontend runtime ----------------------------------------------------
# Only production dependencies; eslint/typescript/tailwind were build-time only.
COPY afm-frontend/package.json afm-frontend/package-lock.json afm-frontend/
RUN cd afm-frontend && npm ci --omit=dev

# Prebuilt output and the files `next start` serves at runtime.
COPY --from=frontend-builder /build/.next          afm-frontend/.next
COPY --from=frontend-builder /build/public         afm-frontend/public
COPY --from=frontend-builder /build/next.config.mjs afm-frontend/next.config.mjs

# ---- Backend source and model weights -----------------------------------
COPY afm-backend afm-backend
COPY docker/entrypoint.sh entrypoint.sh
RUN chmod +x entrypoint.sh

# The app writes masks, figures and reports next to the code, so these must
# exist and be owned by the runtime user.
#
# KNOWN COST: `chown -R` rewrites every file it touches into a new layer, which
# adds ~1.2 GB to this image. The leaner fix is to put `--chown=node:node` on
# each COPY above and drop the recursive chown here. That is left as a follow-up
# because this exact layout is the one that has been build- and run-tested; swap
# it when you next have the disk headroom to rebuild and re-verify.
RUN mkdir -p uploads results afm-backend/uploads afm-backend/afm_runtime/voronoi_outputs \
    && chown -R node:node /app

USER node

ENV AFM_FRONTEND_PORT=3000 \
    AFM_BACKEND_PORT=8050

EXPOSE 3000

# Reports unhealthy until the models have finished loading.
HEALTHCHECK --interval=30s --timeout=5s --start-period=180s --retries=3 \
    CMD curl -sf http://127.0.0.1:3000/api/backend/api/health || exit 1

CMD ["./entrypoint.sh"]
