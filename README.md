# DESYPHR — AFM Analysis Platform

Classifies AFM (Atomic Force Microscopy) images by surface pattern, segments the
features, measures them, and exports a PDF report. Runs locally; no data leaves
the machine.

## Requirements

| Software | Notes |
|---|---|
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | Must be running before you start. On Windows, accept the WSL2 prompt. |
| [Git](https://git-scm.com/downloads) | Only for Option A below. |

## Step 1 — Get the code

Use **Option A** if you have Git. Use **Option B** otherwise.

### Option A — Git clone (recommended)

Install Git LFS first. The model weights are stored in Git LFS and will not
download without it.

| Platform | Command |
|---|---|
| Windows | Included in Git for Windows, then run `git lfs install` |
| macOS | `brew install git-lfs && git lfs install` |
| Ubuntu / Debian | `sudo apt install git-lfs && git lfs install` |

Confirm it is installed, then clone:

```bash
git lfs version
git clone https://github.com/Ma-Research-Lab/DESYPHR.git
cd DESYPHR
git lfs pull
```

Verify the model files are real and not placeholders. The first must be about
186 MB, not a few hundred bytes:

```bash
ls -lh afm-backend/models/
```

### Option B — Download ZIP

1. On the repository page, click **Code**, then **Download ZIP**.
2. Extract it, and open a terminal in the extracted folder.

GitHub ZIP archives do not include Git LFS files, so the models are not in the
ZIP. Download them separately:

1. Go to the repository's **Releases** page.
2. From the latest release, download `cnn_rgb_classifier.pth` and
   `model_Exp6_Full_SelfAttn_and_Gates.pt`.
3. Place both files in `afm-backend/models/`.

The application will not start without these two files.

## Step 2 — Start it

```bash
docker compose up
```

The first build takes roughly 6 minutes and requires about 9 GB of free disk.

Startup is complete when the terminal prints:

```
==> Open http://localhost:3000 in your browser
```

Open <http://localhost:3000>.

## Running it again

```bash
docker compose up
```

Subsequent starts take about 10 seconds. Stop with `Ctrl+C`.

Reclaim build cache after the first build:

```bash
docker builder prune -af
```

## Usage

1. **Upload.** Drag images onto the drop zone, or click to browse. Accepts
   `.png`, `.jpg`, `.tif`, `.tiff`. Multiple files are processed as a batch.
2. **Detect.** Click **Upload & Detect**. The image is classified as `dots`,
   `lines`, `mixed`, or `irregular`, and a segmentation mask is generated.
3. **Review the mask.** Click **Use mask as-is** to accept it, or open the
   **Mask Editor** to paint corrections and save. Measurement accuracy depends on
   mask accuracy.
4. **Analyse.** Click **Run Analysis** to produce measurements (domain spacing in
   nm, orientation angle, spacing statistics) and diagrams.
5. **Export.** Click **Export Results** to download a PDF. A loaded batch exports
   as a single combined PDF.

Images and reports are written to `uploads/` and `results/` in the project
directory.

## Troubleshooting

| Symptom | Resolution |
|---|---|
| `docker: command not found` | Docker is not installed, or Docker Desktop is not running. |
| `port is already allocated` | Port 3000 is in use. In `docker-compose.yml`, change `"3000:3000"` to `"3001:3000"` and use port 3001. |
| Build fails on model files | Model files are missing or are LFS placeholders. Run `git lfs pull`, or download them from Releases as in Option B. |
| Build fails, disk full | Run `docker builder prune -af`, then retry. |
| Slow analysis | Expected. Inference runs on CPU. `dots` and `mixed` images take longest. |
| Page does not load | Confirm the container is still running and the URL is `http://localhost:3000`, not `https`. |

Collect logs for a bug report:

```bash
docker compose logs --tail 30
```

## Resource usage

| Resource | Amount |
|---|---|
| Memory | ~1.1 GB while running |
| Disk, built image | ~2.5 GB |
| Disk, during first build | ~9 GB free required |
| GPU | Not required, not used |

## Running without Docker

Requires Python 3.10–3.12 and Node.js 20 or newer.

```bash
./setup.sh     # once
./start.sh     # each run
```

`setup.sh` creates `.venv`, installs CPU-only PyTorch and all dependencies, and
verifies the model files. Safe to re-run. On a machine with an NVIDIA GPU, run
`AFM_GPU=1 ./setup.sh` instead.

## Configuration

Optional environment variables.

| Variable | Default | Purpose |
|---|---|---|
| `AFM_BACKEND_PORT` | `8050` | Backend port |
| `AFM_FRONTEND_PORT` | `3000` | Web interface port |
| `AFM_FORCE_CPU` | unset | Set to `1` to force CPU even if a GPU exists |
| `AFM_PYTHON` | unset | Use a specific Python interpreter |
| `AFM_MODELS_DIR` | `afm-backend/models` | Where to look for checkpoints |
| `AFM_UNET_MODEL` | `model_Exp6_Full_SelfAttn_and_Gates.pt` | Segmentation checkpoint |
| `AFM_CNN_MODEL` | `cnn_rgb_classifier.pth` | Classifier checkpoint |

## Architecture

The browser talks only to Next.js, which proxies API calls to Flask via its
`/api/backend/[...path]` route. Flask is never exposed directly.

| Component | Port | Exposed |
|---|---|---|
| Next.js web interface | 3000 | yes |
| Flask API + PyTorch models | 8050 | no, internal only |

## Notes for developers

- `next dev` does not run TypeScript. Only `npm run build` does. Run a production
  build before shipping.
- `next start` requires the `typescript` package to read a `next.config.ts`. The
  config is `next.config.mjs` so the production container needs no TypeScript
  compiler. Do not rename it to `.ts`.
- `matplotlib.cm.get_cmap` was removed in matplotlib 3.9. The Voronoi code uses
  `plt.get_cmap(name, N)`, valid on both old and new versions.
- Two checkpoints load at startup; others in `afm-backend/models/` support runtime
  hot-swapping and consume no memory until selected.
- The bundled Flask server is a development server and the application has no
  authentication. Place a WSGI server in front of it and restrict access before
  exposing it.
- `requirements.txt` is unpinned. For exact verified versions use
  `afm-backend/requirements.lock.txt`, installing CPU PyTorch first.
