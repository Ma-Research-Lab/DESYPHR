"""
Build the greyscale training set from the raw class folders.

    python training/prepare_data.py --src ~/Desktop/cnn_train

* Converts every image to 8-bit greyscale (luminance). The irregular class
  was already greyscale and the other classes were orange colour maps, so
  colour alone gave the class away.
* Groups files by source scan: the pre-made rotated/flipped copies
  (``X_rotated_90_flipped_vert``...) share a group with their original. Only
  one file per source is kept, because training applies random rotations and
  flips itself. CV folds are split by group, so copies of a scan never sit
  on both sides of a split.
* Trims the 1 px black frame most dots/lines/mixed TIFFs have (irregular
  images have none, so the frame was a class giveaway).
* Flags near-duplicate images across different groups (possible leakage or
  label conflicts).

Writes training/data/<class>/<group>.png and training/data/manifest.csv.
The source folder is never modified.
"""
from __future__ import annotations

import argparse
import csv
import re
import sys
from collections import defaultdict
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "afm-backend"))
from afm_runtime.utils.cnn_preprocess import to_grey, trim_dark_frame  # noqa: E402

CLASSES = ["dots", "irregular", "lines", "mixed"]
AUG_SUFFIX = re.compile(r"(_(rotated_\d+|flipped_(horiz|vert)))+$")
EXTS = {".png", ".tif", ".tiff", ".jpg", ".jpeg"}


def group_of(path: Path) -> str:
    return AUG_SUFFIX.sub("", path.stem)


def thumb(arr: np.ndarray) -> np.ndarray:
    t = cv2.resize(arr, (32, 32), interpolation=cv2.INTER_AREA).ravel()
    t = t - t.mean()
    return t / (np.linalg.norm(t) + 1e-9)


def d4(arr):
    for k in range(4):
        r = np.rot90(arr, k)
        yield r
        yield r[:, ::-1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", type=Path, default=Path.home() / "Desktop" / "cnn_train")
    ap.add_argument("--out", type=Path, default=HERE / "data")
    args = ap.parse_args()

    rows = []
    thumbs = []
    for cls in CLASSES:
        files = sorted(p for p in (args.src / cls).iterdir() if p.suffix.lower() in EXTS)
        groups = defaultdict(list)
        for p in files:
            groups[group_of(p)].append(p)
        (args.out / cls).mkdir(parents=True, exist_ok=True)
        for g, members in sorted(groups.items()):
            # Prefer the untransformed original; otherwise the first copy.
            original = next((m for m in members if m.stem == g), sorted(members)[0])
            with Image.open(original) as im:
                grey = trim_dark_frame(to_grey(im))
            out = args.out / cls / f"{g}.png"
            Image.fromarray(np.clip(grey * 255 + 0.5, 0, 255).astype(np.uint8), "L").save(out)
            rows.append({
                "path": str(out.relative_to(args.out)),
                "class": cls,
                "group": f"{cls}/{g}",
                "source_file": original.name,
                "copies_in_source": len(members),
                "width": grey.shape[1],
                "height": grey.shape[0],
            })
            thumbs.append((f"{cls}/{g}", [thumb(v) for v in d4(grey)]))

    with open(args.out / "manifest.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)

    counts = defaultdict(int)
    for r in rows:
        counts[r["class"]] += 1
    print("Source scans per class:", dict(counts), "total", len(rows))

    # Near-duplicates under any rotation/flip.
    base = np.stack([t[0] for _, t in thumbs])
    dupes = []
    for i, (gi, ti) in enumerate(thumbs):
        sims = np.max(np.stack([base @ v for v in ti]), axis=0)
        for j in np.where(sims > 0.97)[0]:
            if j > i:
                dupes.append((gi, thumbs[j][0], float(sims[j])))
    if dupes:
        print(f"Near-duplicate pairs across groups ({len(dupes)}):")
        for a, b, s in dupes:
            print(f"  {a}  <->  {b}   similarity {s:.3f}")
    else:
        print("No near-duplicates across groups.")


if __name__ == "__main__":
    main()
