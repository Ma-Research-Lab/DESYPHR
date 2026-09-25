"""Domain spacing (periodicity) estimation for AFM masks/images.

step-by-step: what happens
---------------------------------
Given an AFM mask (or AFM grayscale image), we want the *typical repeat distance*
between domains ("domain spacing"). The method is the same idea used in the lab
paper: take a Fourier transform, look for the main "ring/peak" in frequency
space, and convert that peak position into a real-space spacing.

1) Take an input image
    - Best input: a cleaned **binary mask** of line domains (0/255).
    - If you pass a grayscale AFM image, we binarize it using **Otsu thresholding**.

2) Convert to a binary (black/white) image
    - We create a 0/1 image where 1 = "features" and 0 = background.
    - There is an **auto-invert** heuristic: if the image is mostly white, we flip
      it so features are the minority. This prevents a common failure mode where the
      FFT input becomes almost fully white.

3) Prepare for FFT (reduce edge artifacts)
    - We subtract the mean and apply a Hann window. This makes the FFT cleaner
      (less dominated by sharp borders).

4) Compute a 2D FFT magnitude spectrum
    - Repeating structures produce a strong frequency component.
    - We use log scaling ("log1p") so the peak is easier to detect.

5) Reduce the 2D FFT into a 1D radial profile
    - We average FFT magnitude in rings around the center.
    - This produces a 1D curve: intensity vs radius ("u").

6) Locate the primary peak and **fit it (paper-style)**
    - We find a rough primary peak location.
    - We then fit the peak region (a window around the peak, like Figure 2) to:

         I(u) = A + C u^{-d} + D exp(-4 ln(2) (u-b)^2 / w^2)

      where:
         - b = fitted peak position (center)
         - w = fitted FWHM (width)
         - R² is reported to show fit quality

7) Convert peak position to domain spacing
    - For AFM, the paper uses: ds = FOV / u.
    - Here FOV is `image_size_um` (the physical scan size). We report spacing in nm:

         ds_nm = (image_size_um * 1000) / b

8) (Optional) Look for a secondary peak ratio
    - We scan for a secondary peak in a window 1.5–2.5× the primary peak position.
    - If found, we report the ratio and whether it falls in an expected range.

Debug outputs (for demos)
-------------------------
If `debug=True`, the result includes images you can display in the UI:
- Binary (Before Auto-Invert): what the app passed in (after user toggles)
- Binary (Used for FFT): what we actually fed to the FFT
- FFT Magnitude: frequency image (log-scaled)
- Radial Profile: 1D curve with peak markers + fit window + fit overlay

Integration points
------------------
- API integration: `utils.colorwheel_analysis.run_colorwheel(..., compute_domain_spacing=True)`
  calls `compute_domain_spacing_from_array` and returns results to the Next.js UI.
- Manual mode: run this file as a script to save the debug intermediates to disk.
"""

from __future__ import annotations

import argparse
import base64
import io
import math
import os
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np


def _ensure_uint8_gray(arr: np.ndarray) -> np.ndarray:
    if arr.ndim == 3:
        arr = cv2.cvtColor(arr, cv2.COLOR_BGR2GRAY)
    if arr.dtype != np.uint8:
        arr = np.clip(arr, 0, 255).astype(np.uint8)
    return arr


def _auto_invert_binary(binary01: np.ndarray) -> np.ndarray:
    """Ensure features are 1 and background is 0 (heuristic)."""
    frac_on = float(binary01.mean()) if binary01.size else 0.0
    # If more than half the pixels are ON, it's likely inverted.
    return (1 - binary01) if frac_on > 0.5 else binary01


def _radial_profile(data: np.ndarray, center: Tuple[int, int]) -> np.ndarray:
    yy, xx = np.indices(data.shape)
    rr = np.sqrt((xx - center[0]) ** 2 + (yy - center[1]) ** 2)
    rr_int = rr.astype(np.int32)
    tbin = np.bincount(rr_int.ravel(), data.ravel())
    nr = np.bincount(rr_int.ravel())
    with np.errstate(divide="ignore", invalid="ignore"):
        prof = tbin / np.maximum(nr, 1)
    return prof


def _encode_png_base64(gray_uint8: np.ndarray) -> str:
    ok, buf = cv2.imencode(".png", gray_uint8)
    if not ok:
        raise RuntimeError("Failed to encode PNG")
    return "data:image/png;base64," + base64.b64encode(buf.tobytes()).decode()


def _plot_to_base64_png(fig) -> str:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    out = io.BytesIO()
    fig.savefig(out, format="png", bbox_inches="tight", dpi=160)
    plt.close(fig)
    return "data:image/png;base64," + base64.b64encode(out.getvalue()).decode()


@dataclass
class DomainSpacingDebug:
    input_binary_before_autoinvert_base64: Optional[str] = None
    input_binary_base64: Optional[str] = None
    fft_magnitude_base64: Optional[str] = None
    radial_profile_plot_base64: Optional[str] = None


@dataclass
class DomainSpacingFlags:
    auto_inverted: bool = False
    forced_invert: bool = False
    frac_on_before: float = 0.0
    frac_on_after: float = 0.0


def _paper_peak_model(x: np.ndarray, A: float, C: float, d: float, D: float, b: float, w: float) -> np.ndarray:
    """Paper-style peak model (Eq 2) adapted to an AFM radial FFT profile.

    The GISAXS paper fits:
      I(q) = A + C q^{-d} + D exp(-4 ln(2) (q-b)^2 / w^2)

    For AFM radial FFT profiles, the independent variable is not a physical q
    (Å^-1) by default; it is a radial frequency-bin index `u`.

    We therefore fit the same functional form but with x = u.
    The fitted peak center `b` is then used with the AFM conversion:
      ds = FOV / b
    which matches the paper's AFM equation ds = FOV / u.

    `w` is the FWHM in `u` units (because the exponential is written in terms
    of FWHM directly).
    """
    x = np.asarray(x, dtype=np.float64)
    x_safe = np.maximum(x, 1e-6)  # prevent division-by-zero in x^{-d}
    gauss = np.exp(-4.0 * np.log(2.0) * ((x - b) ** 2) / np.maximum(w, 1e-6) ** 2)
    return A + (C * (x_safe ** (-d))) + (D * gauss)


def _r2(y: np.ndarray, yhat: np.ndarray) -> float:
    y = np.asarray(y, dtype=np.float64)
    yhat = np.asarray(yhat, dtype=np.float64)
    ss_res = float(np.sum((y - yhat) ** 2))
    ss_tot = float(np.sum((y - float(np.mean(y))) ** 2))
    if ss_tot <= 0:
        return 0.0
    return 1.0 - (ss_res / ss_tot)


def _fit_primary_peak_paper_style(
    x: np.ndarray,
    y: np.ndarray,
    peak_guess: int,
    *,
    fit_window: Tuple[int, int],
    maxfev: int = 50_000,
) -> Dict[str, Any]:
    """Fit the primary peak to the paper's Eq 2 (power-law + Gaussian).

    Returns a dict with fit parameters and R², or raises if fit cannot run.
    """
    try:
        from scipy.optimize import curve_fit  # type: ignore
    except Exception as e:
        raise ImportError("SciPy is required for paper-style peak fitting") from e

    lo, hi = fit_window
    lo = int(max(1, lo))
    hi = int(min(int(x.max()), hi))
    if hi <= lo:
        raise ValueError("Invalid fit window")

    sel = (x >= lo) & (x <= hi)
    xf = x[sel].astype(np.float64)
    yf = y[sel].astype(np.float64)
    if xf.size < 12:
        raise ValueError("Fit window too small")

    # Initial guesses (robust, not perfect):
    A0 = float(np.min(yf))
    peak_idx = int(np.clip(peak_guess, lo, hi))
    peak_height = float(y[peak_idx])
    D0 = max(1e-6, peak_height - A0)
    # Background: assume a modest power-law decay.
    d0 = 2.0
    C0 = max(1e-6, float(np.median(yf[: max(2, yf.size // 5)]) - A0)) * (float(xf[0]) ** d0)
    b0 = float(peak_idx)
    w0 = max(2.0, float(peak_idx) * 0.20)

    p0 = [A0, C0, d0, D0, b0, w0]

    # Bounds to keep optimization stable and physical.
    # - A >= 0
    # - C >= 0
    # - d in [0, 10]
    # - D >= 0
    # - b constrained to fit window
    # - w positive
    bounds_lo = [0.0, 0.0, 0.0, 0.0, float(lo), 1e-3]
    bounds_hi = [np.inf, np.inf, 10.0, np.inf, float(hi), float(hi - lo) * 2.0]

    popt, pcov = curve_fit(
        _paper_peak_model,
        xf,
        yf,
        p0=p0,
        bounds=(bounds_lo, bounds_hi),
        method="trf",  # robust bounded least squares
        maxfev=int(maxfev),
    )

    yhat = _paper_peak_model(xf, *popt)
    return {
        "params": {
            "A": float(popt[0]),
            "C": float(popt[1]),
            "d": float(popt[2]),
            "D": float(popt[3]),
            "b": float(popt[4]),
            "w": float(popt[5]),  # FWHM (in u units)
        },
        "r2": float(_r2(yf, yhat)),
        "fit_window": {"min_u": int(lo), "max_u": int(hi)},
    }


def compute_domain_spacing_from_array(
    input_array: np.ndarray,
    image_size_um: float,
    *,
    input_is_mask: bool = True,
    auto_invert: bool = True,
    invert: bool = False,
    truncate_radius: int = 200,
    prominence: Optional[float] = None,
    distance: int = 10,
    min_peak_radius: int = 5,
    peak_radius_range: Optional[Tuple[int, int]] = None,
    # Paper-style peak fitting on the AFM radial FFT profile
    paper_fit: bool = True,
    paper_fit_window_scale: float = 0.35,
    paper_fit_maxfev: int = 50_000,
    detect_secondary_peak: bool = True,
    secondary_ratio_window: Tuple[float, float] = (1.5, 2.5),
    secondary_ratio_expected: Tuple[float, float] = (1.6, 2.4),
    debug: bool = False,
) -> Dict[str, Any]:
    """Estimate domain spacing using FFT radial profile peak detection.

    Args:
        input_array: grayscale or binary uint8 array (H,W)
        image_size_um: physical scan size in micrometers (assumed square)
        input_is_mask: if True, treats array as a mask; else binarizes via Otsu
        auto_invert: if True, flips binary if it looks inverted (mostly ON)
        invert: force invert (applied after auto_invert)
        truncate_radius: radial profile length to consider (bins)
        prominence: forwarded to scipy.signal.find_peaks; if None uses 0.05*max
        distance: forwarded to scipy.signal.find_peaks
        min_peak_radius: ignore radii smaller than this (DC and near-DC)
        peak_radius_range: optional (min_r, max_r) constraint on peak indices
        debug: include base64 debug images

    Returns:
        dict with spacing estimate and optional debug artifacts.
    """

    gray = _ensure_uint8_gray(np.asarray(input_array))

    if input_is_mask:
        binary01 = (gray > 127).astype(np.uint8)
    else:
        # Binarize raw AFM image (best-effort)
        blur = cv2.GaussianBlur(gray, (3, 3), 0)
        _, bin_img = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        binary01 = (bin_img > 127).astype(np.uint8)

    flags = DomainSpacingFlags()
    flags.frac_on_before = float(binary01.mean()) if binary01.size else 0.0

    binary_before = binary01.copy()
    if auto_invert:
        binary01 = _auto_invert_binary(binary01)
        flags.auto_inverted = not np.array_equal(binary01, binary_before)

    if invert:
        binary01 = (1 - binary01).astype(np.uint8)
        flags.forced_invert = True

    flags.frac_on_after = float(binary01.mean()) if binary01.size else 0.0

    # Windowing to reduce FFT edge artifacts
    h, w = binary01.shape
    win_y = np.hanning(h) if h > 1 else np.ones((h,))
    win_x = np.hanning(w) if w > 1 else np.ones((w,))
    window = np.outer(win_y, win_x).astype(np.float32)

    binary_f = binary01.astype(np.float32)
    binary_f = (binary_f - float(binary_f.mean())) * window

    f = np.fft.fft2(binary_f)
    fshift = np.fft.fftshift(f)
    mag = np.log1p(np.abs(fshift)).astype(np.float32)

    center = (w // 2, h // 2)
    radial = _radial_profile(mag, center)

    max_r = int(min(truncate_radius, len(radial) - 1))
    radial_trunc = radial[: max_r + 1].copy()
    radial_trunc[: max(0, min_peak_radius)] = 0.0

    rmin = min_peak_radius
    rmax = max_r
    if peak_radius_range is not None:
        rmin = max(rmin, int(peak_radius_range[0]))
        rmax = min(rmax, int(peak_radius_range[1]))
        if rmax < rmin:
            rmax = rmin

    # Peak detection
    peaks: List[int] = []
    try:
        from scipy.signal import find_peaks  # type: ignore

        prom = prominence
        if prom is None:
            prom = float(np.max(radial_trunc[rmin : rmax + 1]) * 0.05) if rmax >= rmin else 0.0
        idxs, _props = find_peaks(radial_trunc, prominence=prom, distance=distance)
        peaks = [int(i) for i in idxs if rmin <= i <= rmax]
    except Exception:
        # Fallback: pick local maxima in the region
        region = radial_trunc[rmin : rmax + 1]
        if region.size:
            peaks = [int(rmin + int(np.argmax(region)))]

    if not peaks:
        # As a final fallback, take the global maximum in the allowed region
        region = radial_trunc[rmin : rmax + 1]
        peak_idx = int(rmin + int(np.argmax(region))) if region.size else None
        peaks = [peak_idx] if peak_idx is not None else []

    # Choose the strongest peak by radial magnitude
    peak_idx: Optional[int] = None
    if peaks:
        peak_idx = int(max(peaks, key=lambda i: float(radial_trunc[i])))

    image_size_nm = float(image_size_um) * 1000.0

    # ------------------------------------------------------------------
    # Paper-style fit (Eq 2): A + C u^{-d} + Gaussian(b, w)
    # ------------------------------------------------------------------
    # We fit on `u` (radial index) rather than GISAXS q, then convert via:
    #   ds = FOV / b
    # This matches the AFM equation cited in the paper.
    paper_fit_result: Optional[Dict[str, Any]] = None
    fitted_b: Optional[float] = None
    fitted_w: Optional[float] = None
    fitted_r2: Optional[float] = None
    fit_window: Optional[Tuple[int, int]] = None

    if paper_fit and peak_idx is not None and peak_idx > 0:
        # Choose a fit window around the primary peak.
        # The paper restricts the fitting region to isolate the primary peak.
        # Here we use a simple scalable window. You can tune `paper_fit_window_scale`
        # for different morphologies / noise levels.
        half = max(8, int(round(float(peak_idx) * float(paper_fit_window_scale))))
        fit_lo = max(rmin, int(peak_idx - half))
        fit_hi = min(rmax, int(peak_idx + half))
        fit_window = (fit_lo, fit_hi)

        try:
            x = np.arange(radial_trunc.shape[0], dtype=np.float64)
            y = radial_trunc.astype(np.float64)
            paper_fit_result = _fit_primary_peak_paper_style(
                x,
                y,
                peak_guess=int(peak_idx),
                fit_window=fit_window,
                maxfev=int(paper_fit_maxfev),
            )
            fitted_b = float(paper_fit_result["params"]["b"])
            fitted_w = float(paper_fit_result["params"]["w"])
            fitted_r2 = float(paper_fit_result["r2"])
        except Exception as e:
            paper_fit_result = {
                "success": False,
                "error": str(e),
                "fit_window": None if fit_window is None else {"min_u": int(fit_window[0]), "max_u": int(fit_window[1])},
            }

    # Domain spacing from fitted peak center if available, else from integer peak bin
    spacing_nm: Optional[float] = None
    if fitted_b is not None and fitted_b > 0:
        spacing_nm = image_size_nm / float(fitted_b)
    elif peak_idx is not None and peak_idx > 0:
        spacing_nm = image_size_nm / float(peak_idx)

    candidate_spacings: List[float] = []
    for p in peaks:
        if p and p > 0:
            candidate_spacings.append(image_size_nm / float(p))

    # Secondary peak ratio detection (paper-style window around 1.5–2.5x primary)
    secondary: Optional[Dict[str, Any]] = None
    if detect_secondary_peak and peak_idx is not None and peak_idx > 0:
        primary_u = float(fitted_b) if (fitted_b is not None and fitted_b > 0) else float(peak_idx)
        wmin, wmax = secondary_ratio_window
        s_lo = int(max(rmin, math.floor(primary_u * float(wmin))))
        s_hi = int(min(rmax, math.ceil(primary_u * float(wmax))))
        if s_hi > s_lo:
            region = radial_trunc[s_lo : s_hi + 1]
            sec_idx: Optional[int] = None
            try:
                from scipy.signal import find_peaks  # type: ignore

                prom2 = float(np.max(region) * 0.05) if region.size else 0.0
                idxs2, _ = find_peaks(region, prominence=prom2, distance=max(3, distance))
                if idxs2.size:
                    # pick strongest in the region
                    best_local = int(max(idxs2, key=lambda i: float(region[int(i)])))
                    sec_idx = int(s_lo + best_local)
            except Exception:
                if region.size:
                    sec_idx = int(s_lo + int(np.argmax(region)))

            if sec_idx is not None and sec_idx > 0:
                ratio = float(sec_idx) / float(primary_u)
                exp_lo, exp_hi = secondary_ratio_expected
                secondary = {
                    "found": True,
                    "secondary_u": int(sec_idx),
                    "ratio": float(ratio),
                    "expected_range": [float(exp_lo), float(exp_hi)],
                    "in_expected_range": bool(float(exp_lo) <= ratio <= float(exp_hi)),
                    "search_window_u": [int(s_lo), int(s_hi)],
                }
            else:
                secondary = {
                    "found": False,
                    "search_window_u": [int(s_lo), int(s_hi)],
                }

    debug_out = DomainSpacingDebug() if debug else None
    if debug:
        debug_out.input_binary_before_autoinvert_base64 = _encode_png_base64((binary_before * 255).astype(np.uint8))
        debug_out.input_binary_base64 = _encode_png_base64((binary01 * 255).astype(np.uint8))

        # Normalize magnitude image for visualization
        mag_vis = mag.copy()
        mag_vis -= float(mag_vis.min()) if mag_vis.size else 0.0
        mv = float(mag_vis.max()) if mag_vis.size else 0.0
        if mv > 0:
            mag_vis = mag_vis / mv
        mag_u8 = np.clip(mag_vis * 255.0, 0, 255).astype(np.uint8)
        debug_out.fft_magnitude_base64 = _encode_png_base64(mag_u8)

        import matplotlib.pyplot as plt

        fig = plt.figure(figsize=(5.0, 2.6))
        ax = fig.add_subplot(1, 1, 1)
        xs = np.arange(radial_trunc.shape[0])
        ax.plot(xs, radial_trunc, lw=1.2)
        for p in peaks:
            ax.axvline(p, color="tab:orange", alpha=0.5, lw=1)
        if peak_idx is not None:
            ax.axvline(peak_idx, color="tab:red", alpha=0.7, lw=1.2)
        if fit_window is not None:
            ax.axvspan(fit_window[0], fit_window[1], color="tab:green", alpha=0.08, lw=0)
        if paper_fit_result and isinstance(paper_fit_result, dict) and paper_fit_result.get("params"):
            params = paper_fit_result["params"]
            xs_fit = xs.astype(np.float64)
            y_fit = _paper_peak_model(xs_fit, params["A"], params["C"], params["d"], params["D"], params["b"], params["w"])
            ax.plot(xs_fit, y_fit, color="tab:green", lw=1.6, alpha=0.9)
            ax.axvline(float(params["b"]), color="tab:green", alpha=0.9, lw=1.2)
        ax.set_title("Radial FFT profile (peaks + paper fit)")
        ax.set_xlabel("Radius (freq-bin pixels)")
        ax.set_ylabel("Magnitude (log scale)")
        ax.set_xlim(0, max_r)
        ax.grid(True, alpha=0.2)
        debug_out.radial_profile_plot_base64 = _plot_to_base64_png(fig)

    return {
        "success": True,
        "image_size_um": float(image_size_um),
        "image_size_nm": image_size_nm,
        "peak_index": peak_idx,
        "spacing_nm": float(spacing_nm) if spacing_nm is not None else None,
        "candidate_peak_indices": peaks,
        "candidate_spacings_nm": [float(x) for x in candidate_spacings],
        "paper_fit": None
        if paper_fit_result is None
        else (
            {"success": True, **paper_fit_result}
            if (isinstance(paper_fit_result, dict) and paper_fit_result.get("params"))
            else paper_fit_result
        ),
        "secondary_peak": secondary,
        "flags": {
            "auto_inverted": bool(flags.auto_inverted),
            "forced_invert": bool(flags.forced_invert),
            "frac_on_before": float(flags.frac_on_before),
            "frac_on_after": float(flags.frac_on_after),
        },
        "debug": None
        if not debug_out
        else {
            "input_binary_before_autoinvert_base64": debug_out.input_binary_before_autoinvert_base64,
            "input_binary_base64": debug_out.input_binary_base64,
            "fft_magnitude_base64": debug_out.fft_magnitude_base64,
            "radial_profile_plot_base64": debug_out.radial_profile_plot_base64,
        },
    }


def _save_base64_png(data_url: str, path: str) -> None:
    if not data_url.startswith("data:image/png;base64,"):
        raise ValueError("Expected data URL base64 PNG")
    raw = base64.b64decode(data_url.split(",", 1)[1])
    with open(path, "wb") as f:
        f.write(raw)


def main() -> int:
    parser = argparse.ArgumentParser(description="Estimate domain spacing from a mask or AFM image.")
    parser.add_argument("--input", required=True, help="Path to input image (mask or grayscale AFM).")
    parser.add_argument("--image-size-um", type=float, required=True, help="Physical scan size in micrometers.")
    parser.add_argument("--input-is-mask", action="store_true", help="Treat input as a binary mask (default).")
    parser.add_argument("--input-is-image", action="store_true", help="Treat input as raw grayscale AFM image and binarize.")
    parser.add_argument("--invert", action="store_true", help="Force invert binary before FFT.")
    parser.add_argument("--no-auto-invert", action="store_true", help="Disable auto-invert heuristic.")
    parser.add_argument("--out-dir", default="./outputs/domain_spacing_debug", help="Directory to save debug outputs.")
    parser.add_argument("--truncate-radius", type=int, default=200)
    parser.add_argument("--min-peak-radius", type=int, default=5)
    args = parser.parse_args()

    if args.input_is_image and args.input_is_mask:
        raise SystemExit("Choose only one: --input-is-mask or --input-is-image")

    input_is_mask = True
    if args.input_is_image:
        input_is_mask = False

    img = cv2.imread(args.input, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise SystemExit(f"Failed to read: {args.input}")

    res = compute_domain_spacing_from_array(
        img,
        args.image_size_um,
        input_is_mask=input_is_mask,
        auto_invert=not args.no_auto_invert,
        invert=args.invert,
        truncate_radius=args.truncate_radius,
        min_peak_radius=args.min_peak_radius,
        debug=True,
    )

    os.makedirs(args.out_dir, exist_ok=True)

    debug = res.get("debug") or {}
    if debug.get("input_binary_base64"):
        _save_base64_png(debug["input_binary_base64"], os.path.join(args.out_dir, "01_input_binary.png"))
    if debug.get("fft_magnitude_base64"):
        _save_base64_png(debug["fft_magnitude_base64"], os.path.join(args.out_dir, "02_fft_magnitude.png"))
    if debug.get("radial_profile_plot_base64"):
        _save_base64_png(debug["radial_profile_plot_base64"], os.path.join(args.out_dir, "03_radial_profile.png"))

    print("Peak index:", res.get("peak_index"))
    print("Spacing (nm):", res.get("spacing_nm"))
    print("Candidates (nm):", res.get("candidate_spacings_nm"))
    print("Saved debug outputs to:", os.path.abspath(args.out_dir))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
