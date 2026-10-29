"""
Voronoi analysis wrapper for the AFM backend runtime.
Wraps voronoi_v8_2.analyze_image() for use via API endpoints.
"""
import matplotlib
matplotlib.use('Agg')

import os
import io
import base64
import tempfile
import json
import shutil
import uuid
import re
from datetime import datetime
import numpy as np
from PIL import Image
from pathlib import Path

# v8.2 adds configurable packing-edge classification: 6 for hexagonal and
# 4 for square/cubic-style packing.
from .voronoi_v8_2 import analyze_image as _voronoi_analyze


_AVG_AREA_RE = re.compile(r"Average\s+area:\s*([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)")


def _parse_average_area_pixels(group_pixel_counts_text: str):
    """Extract the numeric value from: 'Average area: <value> total area'."""
    if not group_pixel_counts_text:
        return None
    m = _AVG_AREA_RE.search(group_pixel_counts_text)
    if not m:
        return None
    try:
        return float(m.group(1))
    except Exception:
        return None


_GROUP_AREA_RE = re.compile(r"^Group\s+\d+:.*?([-+]?\d*\.?\d+)\s+total area", re.MULTILINE)


def _parse_group_areas_pixels(group_pixel_counts_text: str):
    """Per-group areas from lines like: 'Group 3: 12 elements, 225.99 total area'."""
    if not group_pixel_counts_text:
        return []
    areas = []
    for match in _GROUP_AREA_RE.finditer(group_pixel_counts_text):
        try:
            areas.append(float(match.group(1)))
        except ValueError:
            continue
    return areas


def _img_to_base64(img_path):
    """Convert an image file to a data-URI base64 string."""
    if not os.path.exists(img_path):
        return None
    with open(img_path, 'rb') as f:
        data = f.read()
    ext = Path(img_path).suffix.lower()
    mime = 'image/png' if ext == '.png' else 'image/jpeg'
    return f"data:{mime};base64,{base64.b64encode(data).decode()}"


def run_voronoi(mask_array, image_size_um=1.0, threshold_edge=0.25, max_size=1024, packing_edges=6, domain_spacing_nm=None):
    """
    Run Voronoi analysis on a mask image.

    Args:
        mask_array: numpy array (H, W) uint8, 0-255 mask image
        image_size_um: physical image size in micrometers
        threshold_edge: edge detection threshold for Voronoi
        max_size: max dimension for downsampling
        packing_edges: 6 for hexagonal packing or 4 for square/cubic-style packing
        domain_spacing_nm: optional domain spacing measured on the full mask; used
            in place of the engine's own FFT periodicity when given

    Returns:
        dict with analysis results and base64-encoded overlay images
    """
    from skimage.transform import resize as sk_resize

    try:
        image_size_um = float(image_size_um)
    except Exception:
        return {
            'success': False,
            'error': 'image_size_um must be a number',
        }
    if image_size_um <= 0:
        return {
            'success': False,
            'error': 'image_size_um must be > 0',
        }

    try:
        packing_edges = int(packing_edges)
    except (TypeError, ValueError):
        return {
            'success': False,
            'error': 'packing_edges must be 4 (square/cubic) or 6 (hexagonal)',
        }
    if packing_edges not in {4, 6}:
        return {
            'success': False,
            'error': 'packing_edges must be 4 (square/cubic) or 6 (hexagonal)',
        }

    try:
        domain_spacing_nm = float(domain_spacing_nm) if domain_spacing_nm is not None else None
    except (TypeError, ValueError):
        domain_spacing_nm = None
    if domain_spacing_nm is not None and not (np.isfinite(domain_spacing_nm) and domain_spacing_nm > 0):
        domain_spacing_nm = None

    # Normalise to float 0-1
    data = mask_array.astype(np.float64) / 255.0

    # Auto-detect feature phase (minority phase should be dark/0)
    black_px = np.sum(data < 0.5)
    white_px = np.sum(data >= 0.5)
    inverted = False
    if white_px < black_px:
        data = 1.0 - data
        inverted = True

    # Downsample if needed
    downsampled = False
    original_shape = tuple(data.shape)
    if max(data.shape) > max_size:
        scale = max_size / max(data.shape)
        new_shape = (int(data.shape[0] * scale), int(data.shape[1] * scale))
        data = sk_resize(data, new_shape, anti_aliasing=True, preserve_range=True)
        downsampled = True
    final_shape = tuple(data.shape)

    # Create temp output directory
    with tempfile.TemporaryDirectory() as tmpdir:
        image_name = "voronoi_input"

        results = _voronoi_analyze(
            image_data=data,
            image_name=image_name,
            image_size=image_size_um,
            save_image=True,
            show_image=False,
            save_location=tmpdir,
            packing_edges=packing_edges,
            threshold_edge=threshold_edge,
            domain_spacing_nm=domain_spacing_nm,
        )

        # Read output images and convert to base64
        results_folder = os.path.join(tmpdir, image_name)
        overlay_path = os.path.join(results_folder, f"{image_name}_voronoi_overlay.png")
        morphology_path = os.path.join(results_folder, f"{image_name}_morphology_map.png")
        original_path = os.path.join(results_folder, f"{image_name}_original.png")
        snapshot_path = os.path.join(results_folder, f"{image_name}_snapshot.png")
        group_pixel_counts_path = os.path.join(results_folder, f"{image_name}_group_pixel_counts.txt")

        output = {
            'success': True,
            'inverted': inverted,
            'warnings': [],
            'results': {},
            'packing_edges': packing_edges,
            'domain_spacing_nm': domain_spacing_nm,
            'overlay_base64': _img_to_base64(overlay_path),
            'morphology_map_base64': _img_to_base64(morphology_path),
            'original_base64': _img_to_base64(original_path),
            'snapshot_base64': _img_to_base64(snapshot_path),
        }

        # Convert numpy types to native Python for JSON serialisation
        # NaN / Inf are not valid JSON – replace with None so jsonify
        # produces null instead of the literal "NaN" / "Infinity".
        import math
        for k, v in results.items():
            if isinstance(v, (np.integer, np.int64)):
                output['results'][k] = int(v)
            elif isinstance(v, (np.floating, np.float64)):
                fv = float(v)
                output['results'][k] = None if (math.isnan(fv) or math.isinf(fv)) else fv
            elif isinstance(v, float):
                output['results'][k] = None if (math.isnan(v) or math.isinf(v)) else v
            else:
                output['results'][k] = v

        # Guardrails: the engine can emit negative/zero values when the
        # FFT peak fit fails. We treat these as invalid rather than
        # surfacing misleading units to the UI.
        for key in ('grain_size', 'periodicity'):
            value = output['results'].get(key)
            if isinstance(value, (int, float)) and value is not None and value <= 0:
                output['warnings'].append(
                    f"Invalid {key} from voronoi engine (<= 0). Set to null; this often occurs when FFT peak fitting fails."
                )
                output['results'][key] = None

        # Prefer grain size derived from the group pixel counts average area.
        # The voronoi engine produces a file like:
        #   Average area: 225.99 total area
        # where the area is in pixels (on the analyzed image resolution).
        # Convert to µm² using pixel size:
        #   pixel_w_um = image_size_um / W
        #   pixel_h_um = image_size_um / H
        #   area_um2 = area_pixels * pixel_w_um * pixel_h_um
        # This matches the user's example for a 256×256 image with image_size_um=1:
        #   225.99 * (1/256) * (1/256) == 225.99 / 256 / 256
        group_pixel_counts_text = None
        try:
            if os.path.exists(group_pixel_counts_path):
                group_pixel_counts_text = Path(group_pixel_counts_path).read_text(
                    encoding='utf-8', errors='replace'
                )
        except Exception:
            group_pixel_counts_text = None

        if group_pixel_counts_text is not None:
            output['group_pixel_counts_text'] = group_pixel_counts_text[:200_000]

        avg_area_pixels = _parse_average_area_pixels(group_pixel_counts_text)
        if avg_area_pixels is not None:
            try:
                h, w = int(final_shape[0]), int(final_shape[1])
                if h > 0 and w > 0:
                    pixel_w_um = image_size_um / float(w)
                    pixel_h_um = image_size_um / float(h)
                    avg_area_um2 = float(avg_area_pixels) * pixel_w_um * pixel_h_um

                    # Reject NaN/Inf/<=0 values (happens when engine finds no groups -> average([])=nan).
                    if not (math.isfinite(float(avg_area_pixels)) and math.isfinite(float(avg_area_um2))):
                        output['warnings'].append(
                            'Average area from group pixel counts is not finite (likely no valid Voronoi groups). Using FFT-derived grain_size.'
                        )
                        avg_area_pixels = None
                    elif float(avg_area_pixels) <= 0 or float(avg_area_um2) <= 0:
                        output['warnings'].append(
                            'Average area from group pixel counts is <= 0 (unexpected). Using FFT-derived grain_size.'
                        )
                        avg_area_pixels = None

                if avg_area_pixels is not None:

                    # Keep the original FFT-derived number for reference.
                    if 'grain_size' in output['results']:
                        output['results']['grain_size_fft'] = output['results'].get('grain_size')
                        output['results']['grain_size_fft_unit'] = 'nm'

                    output['results']['average_group_area_pixels'] = float(avg_area_pixels)
                    output['results']['average_group_area_um2'] = avg_area_um2
                    group_areas = [a for a in _parse_group_areas_pixels(group_pixel_counts_text) if math.isfinite(a)]
                    if group_areas:
                        output['results']['std_group_area_um2'] = float(np.std(group_areas)) * pixel_w_um * pixel_h_um
                        output['results']['group_areas_um2'] = [a * pixel_w_um * pixel_h_um for a in group_areas]
                    output['results']['grain_size'] = avg_area_um2
                    output['results']['grain_size_unit'] = 'um^2'
                    output['results']['grain_size_source'] = 'group_average_area'
            except Exception as e:
                output['warnings'].append(f'Failed to compute grain_size from group average area: {e}')
        else:
            if group_pixel_counts_text is None:
                output['warnings'].append(
                    'Voronoi group pixel counts file was not generated or could not be read; using FFT-derived grain_size. '
                    'This commonly happens when <4 dots are detected and Voronoi is skipped.'
                )
            else:
                output['warnings'].append('Could not parse Average area from group pixel counts; using FFT-derived grain_size.')

        if output['results'].get('grain_size_source') is None and 'grain_size' in output['results']:
            output['results']['grain_size_source'] = 'fft'

        # Persist the full output folder (including group area/cluster file) so it isn't
        # lost when the TemporaryDirectory is cleaned up.
        try:
            outputs_root = Path(__file__).resolve().parents[1] / 'voronoi_outputs'
            outputs_root.mkdir(parents=True, exist_ok=True)

            run_id = datetime.utcnow().strftime('%Y%m%dT%H%M%SZ') + '_' + uuid.uuid4().hex[:8]
            persist_dir = outputs_root / run_id
            persist_dir.mkdir(parents=True, exist_ok=True)

            persisted_results_dir = persist_dir / image_name
            if os.path.exists(results_folder):
                shutil.copytree(results_folder, persisted_results_dir)

            group_file = persisted_results_dir / f'{image_name}_group_pixel_counts.txt'
            group_text = None
            try:
                if group_file.exists():
                    group_text = group_file.read_text(encoding='utf-8', errors='replace')
            except Exception:
                group_text = None

            # Expose the raw text (optional) for UI/debugging.
            # Keep response size modest: if it's huge, the UI can read it from disk.
            if group_text is not None and 'group_pixel_counts_text' not in output:
                output['group_pixel_counts_text'] = group_text[:200_000]

            summary = {
                'run_id': run_id,
                'image_name': image_name,
                'image_size_um': image_size_um,
                'threshold_edge': threshold_edge,
                'max_size': max_size,
                'packing_edges': packing_edges,
                'domain_spacing_nm': domain_spacing_nm,
                'auto_inverted': inverted,
                'downsampled': downsampled,
                'original_shape': list(original_shape),
                'final_shape': list(final_shape),
                'warnings': output.get('warnings', []),
                'results': output.get('results', {}),
                'persisted_paths': {
                    'output_dir': str(persist_dir),
                    'results_dir': str(persisted_results_dir),
                    'group_area_cluster_file': str(persisted_results_dir / f'{image_name}_group_pixel_counts.txt'),
                    'overlay_png': str(persisted_results_dir / f'{image_name}_voronoi_overlay.png'),
                    'morphology_map_png': str(persisted_results_dir / f'{image_name}_morphology_map.png'),
                    'original_png': str(persisted_results_dir / f'{image_name}_original.png'),
                    'snapshot_png': str(persisted_results_dir / f'{image_name}_snapshot.png'),
                },
                'group_area_cluster_text': group_text,
            }

            with open(persist_dir / 'result_summary.json', 'w', encoding='utf-8') as f:
                json.dump(summary, f, indent=2)

            # Convenience copies for quick access
            try:
                with open(outputs_root / 'latest_result_summary.json', 'w', encoding='utf-8') as f:
                    json.dump(summary, f, indent=2)
                if group_text is not None:
                    (outputs_root / 'latest_group_pixel_counts.txt').write_text(
                        group_text, encoding='utf-8', errors='replace'
                    )
            except Exception:
                pass

            output['output_dir'] = str(persist_dir)
        except Exception as e:
            output['warnings'].append(f'Failed to persist voronoi outputs: {e}')

        return output
