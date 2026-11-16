# Classifier training

Greyscale morphology CNN (`dots`, `irregular`, `lines`, `mixed`) used by the app as
`afm-backend/models/cnn_grey_gap.pth`.

```bash
# conda env with CUDA PyTorch, scikit-learn, OpenCV (here: basic_models)
python training/prepare_data.py --src ~/Desktop/cnn_train   # -> training/data/
python training/train.py cv --name cv1                       # 5-fold grouped CV (~40 min on an RTX A1000)
python training/train.py final --name final1                 # final model (~7 min)
python training/evaluate.py --cv cv1 --final final1          # -> runs/cv1/report.md
cp training/runs/final1/cnn_grey_gap.pth afm-backend/models/
```

## Data (`prepare_data.py`)
- Converted to greyscale. Irregular images were greyscale and the rest orange colour maps, so colour alone gave the class away.
- Trimmed the 1 px black frame found on 150 of the 202 dots/lines/mixed TIFFs (no irregular image has one). This was another giveaway.
- Grouped by source scan. The pre-made `_rotated_*` / `_flipped_*` copies collapse to one image per scan:
  **7 dots, 126 irregular, 171 lines, 24 mixed** (328 scans; the raw folder had 452 files).
- The source folder is never modified.

## Model (`GreyGapCNN` in `afm_runtime/utils/cnn_classifier.py`)
Same three 5×5 conv blocks (32/64/128), plus a 3×3 block (256) and global average pooling
in place of the `Linear(128·27·27 → 512)` head: 1.7M parameters instead of 48.6M (6.9 MB vs 195 MB).

## Training (`train.py`, `augment.py`)
- 5-fold `StratifiedGroupKFold` by source scan. Inside each training portion, 1/6 of the groups are held out for best-epoch selection and calibration.
- Augmentation: random zoom 0.5–2.8×, any rotation, flips, **inverted contrast (50%)**, tilt planes, scan-line jumps, gamma/contrast/brightness, blur, noise.
- Class-weighted cross-entropy (inverse frequency, split between sampler and loss), label smoothing 0.1.
- AdamW (weight decay 0.02 on weights only; replaces the L1/L2 penalties), 5-epoch warm-up, cosine decay 1e-3 → 1e-5, 100 epochs, mixed precision.
- Best epoch by class-weighted validation NLL over 3 zooms × 2 contrasts. Temperature scaling is fitted on the same validation set and stored in the checkpoint.
- The app and the evaluation use the same preprocessing (`afm_runtime/utils/cnn_preprocess.py`).

## Results
See `runs/cv1/report.md`. Summary: 93.6% held-out accuracy (5 folds: 91–97%), balanced accuracy 93.1%,
ECE 0.139 → 0.032 after calibration. Accuracy stays at 87–95% from 0.5× to 3× zoom in both contrasts,
where the old model fell to 38% (inverted, 2–3×).

## Known limits
- **Only 7 dots scans.** Dots scored 7/7 in CV, but that is a small sample. More dots scans are the most valuable addition.
- Most remaining errors are lines → mixed on low-numbered series scans (`C_100`, `D_100`, `F_75`, …), which overlap the mixed series range (`A_25`–`B_100`). These may be borderline labels.
- Calibration fixes confidence on average, but individual wrong answers still average ~80–85% confidence.
