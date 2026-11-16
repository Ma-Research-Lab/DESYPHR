"""
Evaluate a cross-validation run and compare it with the old RGB model.

    python training/evaluate.py --cv cv1 [--final final1]

Writes training/runs/<cv>/report.md and report.json.

* Cross-validation: out-of-fold predictions on held-out source scans
  (accuracy, balanced accuracy, macro F1, confusion matrix, NLL and ECE
  before and after temperature scaling).
* Robustness: accuracy on the held-out scans at zoom 0.4-3x, normal and
  inverted contrast. The old model is run on the same scans and views for
  comparison. It was trained on these images, so its numbers are
  optimistic. The new model's are honest (held out).
* Real world: screenshots in --real-dir, with the old and the new (final)
  model, with and without the app's scale normalisation.
"""
from __future__ import annotations

import argparse
import csv
import glob
import json
import sys
from pathlib import Path

import numpy as np
import torch
from PIL import Image

HERE = Path(__file__).resolve().parent
BACKEND = HERE.parent / "afm-backend"
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(HERE))
from afm_runtime.utils.cnn_preprocess import reframe  # noqa: E402

CLASSES = ["dots", "irregular", "lines", "mixed"]


def softmax(z):
    z = z - z.max(1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(1, keepdims=True)


def ece(probs, labels, bins=10):
    conf = probs.max(1)
    pred = probs.argmax(1)
    edges = np.linspace(0, 1, bins + 1)
    total = 0.0
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (conf > lo) & (conf <= hi)
        if m.any():
            total += m.mean() * abs((pred[m] == labels[m]).mean() - conf[m].mean())
    return float(total)


def nll(probs, labels):
    return float(-np.log(np.clip(probs[np.arange(len(labels)), labels], 1e-12, 1)).mean())


def macro_f1(cm):
    f1 = []
    for c in range(len(cm)):
        tp = cm[c, c]
        p = tp / max(cm[:, c].sum(), 1)
        r = tp / max(cm[c].sum(), 1)
        f1.append(0 if p + r == 0 else 2 * p * r / (p + r))
    return float(np.mean(f1))


def confusion(labels, preds):
    cm = np.zeros((4, 4), dtype=int)
    for t, p in zip(labels, preds):
        cm[t, p] += 1
    return cm


def fmt_cm(cm):
    lines = ["| true \\ pred | " + " | ".join(CLASSES) + " | recall |", "|---" * 6 + "|"]
    for i, c in enumerate(CLASSES):
        r = cm[i, i] / max(cm[i].sum(), 1)
        lines.append(f"| **{c}** | " + " | ".join(str(v) for v in cm[i]) + f" | {r:.0%} |")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Old RGB model on the same views
# ---------------------------------------------------------------------------

def old_model():
    from afm_runtime.utils.cnn_classifier import DeeperCNN
    m = DeeperCNN(in_channels=3)
    m.load_state_dict(torch.load(BACKEND / "models" / "cnn_rgb_classifier.pth", map_location="cpu"))
    return m.eval()


def old_view(rgb: np.ndarray, zoom: float, flip: bool) -> np.ndarray:
    """Old preprocessing (black pad to square, resize 217) on a zoomed colour view."""
    if zoom != 1.0:
        n = min(rgb.shape[:2])
        rgb = np.stack([reframe(rgb[..., c], n / zoom) for c in range(3)], -1)
    im = Image.fromarray(rgb)
    w, h = im.size
    m = max(w, h)
    pad = Image.new("RGB", (m, m))
    pad.paste(im, ((m - w) // 2, (m - h) // 2))
    x = np.asarray(pad.resize((217, 217), Image.BILINEAR), dtype=np.float32) / 255
    if flip:
        x = 1.0 - x
    return x.transpose(2, 0, 1)


# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cv", required=True)
    ap.add_argument("--final", default=None)
    ap.add_argument("--src", type=Path, default=Path.home() / "Desktop" / "cnn_train")
    ap.add_argument("--real-dir", type=Path, default=HERE / "real_world")
    ap.add_argument("--labels", type=Path, default=HERE / "real_world_labels.csv")
    args = ap.parse_args()

    run = HERE / "runs" / args.cv
    folds = sorted(run.glob("fold*/test.npz"))
    manifest = list(csv.DictReader(open(HERE / "data" / "manifest.csv")))
    report, out = [], {"folds": []}

    # ---- cross-validation -------------------------------------------------
    allz = {k: [] for k in ("logits", "label", "zoom", "flip", "index", "T")}
    for f in folds:
        d = np.load(f)
        hist = json.load(open(f.parent / "history.json"))
        out["folds"].append({"fold": f.parent.name, "best_epoch": hist["best"]["epoch"],
                             "temperature": float(d["temperature"])})
        for k in ("logits", "label", "zoom", "flip", "index"):
            allz[k].append(d[k])
        allz["T"].append(np.full(len(d["label"]), float(d["temperature"])))
    z = {k: np.concatenate(v) for k, v in allz.items()}

    base = (z["zoom"] == 1.0) & (~z["flip"])
    logits, labels = z["logits"][base], z["label"][base]
    p_raw = softmax(logits)
    p_cal = softmax(logits / z["T"][base][:, None])
    preds = p_raw.argmax(1)
    cm = confusion(labels, preds)
    recalls = np.diag(cm) / np.maximum(cm.sum(1), 1)
    cv = {
        "n_images": int(len(labels)),
        "accuracy": float((preds == labels).mean()),
        "balanced_accuracy": float(recalls.mean()),
        "macro_f1": macro_f1(cm),
        "nll_raw": nll(p_raw, labels), "nll_calibrated": nll(p_cal, labels),
        "ece_raw": ece(p_raw, labels), "ece_calibrated": ece(p_cal, labels),
        "confusion": cm.tolist(),
    }
    per_fold_acc = []
    for f in folds:
        d = np.load(f)
        m = (d["zoom"] == 1.0) & (~d["flip"])
        per_fold_acc.append(float((d["logits"][m].argmax(1) == d["label"][m]).mean()))
    cv["per_fold_accuracy"] = per_fold_acc
    out["cv"] = cv

    report += [f"# CNN retrain: evaluation of `{args.cv}`", "",
               "## 5-fold grouped cross-validation (held-out source scans, as uploaded)", "",
               f"- Images: {cv['n_images']} source scans, each tested once, by a model that never saw it",
               f"- Accuracy: **{cv['accuracy']:.1%}** (per fold: " + ", ".join(f"{a:.0%}" for a in per_fold_acc)
               + f"; mean {np.mean(per_fold_acc):.1%} ± {np.std(per_fold_acc):.1%})",
               f"- Balanced accuracy: **{cv['balanced_accuracy']:.1%}** · Macro F1: **{cv['macro_f1']:.3f}**",
               f"- Calibration: NLL {cv['nll_raw']:.3f} → {cv['nll_calibrated']:.3f}, "
               f"ECE {cv['ece_raw']:.3f} → {cv['ece_calibrated']:.3f} after temperature scaling",
               "- Best epochs / temperatures: " + ", ".join(f"{x['fold']} e{x['best_epoch']} T={x['temperature']:.2f}"
                                                            for x in out["folds"]),
               "", fmt_cm(cm), ""]

    wrong = np.where(preds != labels)[0]
    if len(wrong):
        idx = z["index"][base]
        report += ["Misclassified held-out scans:", ""]
        for w in wrong:
            report.append(f"- `{manifest[idx[w]]['path']}` → {CLASSES[preds[w]]} "
                          f"({p_cal[w].max():.0%} calibrated)")
        report.append("")

    # ---- robustness grid --------------------------------------------------
    zooms = sorted(set(z["zoom"].tolist()))
    om = old_model()
    old_cache = {}
    idx_all = z["index"]
    rob = {"zooms": zooms, "new": {}, "old": {}, "new_conf_when_wrong": {}, "old_conf_when_wrong": {}}
    for flip in (False, True):
        for zoom in zooms:
            m = (z["zoom"] == zoom) & (z["flip"] == flip)
            p = softmax(z["logits"][m] / z["T"][m][:, None])
            ok = p.argmax(1) == z["label"][m]
            key = f"{zoom}|{int(flip)}"
            rob["new"][key] = float(ok.mean())
            rob["new_conf_when_wrong"][key] = float(p.max(1)[~ok].mean()) if (~ok).any() else None
            # Old model on the same scans and views (original colour files).
            xs, ys = [], []
            for j, y in zip(idx_all[m], z["label"][m]):
                r = manifest[j]
                if j not in old_cache:
                    old_cache[j] = np.asarray(Image.open(args.src / r["class"] / r["source_file"]).convert("RGB"))
                xs.append(old_view(old_cache[j], zoom, flip))
                ys.append(y)
            with torch.no_grad():
                po = torch.softmax(om(torch.from_numpy(np.stack(xs))), 1).numpy()
            oko = po.argmax(1) == np.array(ys)
            rob["old"][key] = float(oko.mean())
            rob["old_conf_when_wrong"][key] = float(po.max(1)[~oko].mean()) if (~oko).any() else None
    out["robustness"] = rob

    def row(name, d, flip):
        return f"| {name} | " + " | ".join(f"{d[f'{zz}|{flip}']:.0%}" for zz in zooms) + " |"

    def crow(name, d, flip):
        return f"| {name} | " + " | ".join("–" if d[f"{zz}|{flip}"] is None else f"{d[f'{zz}|{flip}']:.0%}"
                                          for zz in zooms) + " |"

    head = "| model | " + " | ".join(f"{zz:g}×" for zz in zooms) + " |\n|---" * 1 + "|---" * len(zooms) + "|"
    report += ["## Robustness: accuracy vs zoom and contrast (held-out scans)", "",
               "Zoom > 1 = features bigger (crop); < 1 = smaller (mirror-tiled). The old model was trained on "
               "these scans, so its numbers are optimistic; the new model's are held-out.", "",
               "**Normal contrast**", "", head, row("old RGB", rob["old"], 0), row("new grey", rob["new"], 0), "",
               "**Inverted contrast**", "", head, row("old RGB", rob["old"], 1), row("new grey", rob["new"], 1), "",
               "**Average confidence when wrong** (lower is better: wrong answers should be unsure)", "",
               head, crow("old, normal", rob["old_conf_when_wrong"], 0), crow("new, normal", rob["new_conf_when_wrong"], 0),
               crow("old, inverted", rob["old_conf_when_wrong"], 1), crow("new, inverted", rob["new_conf_when_wrong"], 1), ""]

    # ---- real world -------------------------------------------------------
    if args.final:
        from afm_runtime.utils.cnn_classifier import CnnClassifier
        import os
        truth = {}
        if args.labels.exists():
            truth = {r["file"]: r["label"] for r in csv.DictReader(open(args.labels))}
        files = sorted(glob.glob(str(args.real_dir / "*")))
        files = [f for f in files if Path(f).suffix.lower() in {".png", ".tif", ".tiff", ".jpg"}]
        old_c, new_c = CnnClassifier(), CnnClassifier()
        old_c.load(BACKEND / "models" / "cnn_rgb_classifier.pth", device=torch.device("cpu"))
        new_c.load(HERE / "runs" / args.final / "cnn_grey_gap.pth", device=torch.device("cpu"))
        report += ["## Real-world images", "",
                   "| image | expected | old | old + rescale | new | new + rescale |", "|---|---|---|---|---|---|"]
        real = []
        for f in files:
            short = Path(f).name.split("_", 4)[-1] if Path(f).name.startswith("upload_") else Path(f).name
            res = {}
            for tag, clf in (("old", old_c), ("new", new_c)):
                for sn in ("0", "1"):
                    os.environ["AFM_CNN_SCALE_NORMALIZE"] = sn
                    with Image.open(f) as im:
                        r = clf.classify(im)
                    res[f"{tag}{sn}"] = (r["predicted_class"], r["confidence"])
            exp = truth.get(short, "?")
            cell = lambda k: (("✓ " if res[k][0] == exp else "✗ " if exp != "?" else "")
                              + f"{res[k][0]} {res[k][1]:.0%}")
            report.append(f"| {short} | {exp} | {cell('old0')} | {cell('old1')} | {cell('new0')} | {cell('new1')} |")
            real.append({"file": short, "expected": exp, **{k: list(v) for k, v in res.items()}})
        out["real_world"] = real
        report.append("")

    (run / "report.md").write_text("\n".join(report))
    json.dump(out, open(run / "report.json", "w"), indent=1, default=float)
    print("\n".join(report))


if __name__ == "__main__":
    main()
