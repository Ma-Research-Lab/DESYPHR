"""
Train the greyscale GAP CNN for AFM morphology classification.

    # 5-fold grouped cross-validation (writes runs/<name>/fold*/):
    python training/train.py cv --name cv1
    # Final model on all data, for the app:
    python training/train.py final --name final1

Method
------
* Data: training/data (from prepare_data.py), one image per source scan.
* Splits: StratifiedGroupKFold by source scan, 5 outer folds. Inside each
  training portion, one sixth of the groups (stratified) is held out as a
  validation set, used to pick the best epoch and to fit the calibration
  temperature. The outer test fold is touched only once, at the end.
* Augmentation: see augment.py (random zoom 0.5-2.8x, any rotation, flips,
  contrast inversion, tilt planes, scan-line jumps, gamma, contrast,
  brightness, blur, noise).
* Imbalance: class-weighted cross-entropy. The weight is split between the
  sampler (draws ~ n_c^-0.5) and the loss (weights ~ n_c^-0.5). Together
  each class counts as if equally frequent, while keeping 7-image classes
  from producing wildly noisy batches.
* Optimiser: AdamW (decoupled weight decay on conv/linear weights only,
  instead of the old explicit L1/L2 penalties). Linear warm-up, then cosine
  learning-rate decay. Mixed precision.
* Label smoothing 0.1 in training. The best epoch is chosen on unsmoothed
  class-weighted validation NLL, across several zooms and both contrasts.
* Calibration: temperature scaling fitted on the validation logits.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import sys
import time
from collections import Counter
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image
from sklearn.model_selection import StratifiedGroupKFold
from torch.utils.data import DataLoader, Dataset, WeightedRandomSampler

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "afm-backend"))
sys.path.insert(0, str(HERE))
from afm_runtime.utils.cnn_classifier import GreyGapCNN  # noqa: E402
from augment import augment, eval_view  # noqa: E402

CLASSES = ["dots", "irregular", "lines", "mixed"]
VAL_VIEWS = [(z, f) for z in (0.6, 1.0, 1.7) for f in (False, True)]
TEST_ZOOMS = (0.4, 0.5, 0.7, 1.0, 1.4, 2.0, 2.5, 3.0)

CFG = dict(
    epochs=100,
    warmup_epochs=5,
    samples_per_epoch=640,
    batch_size=32,
    lr=1e-3,
    min_lr=1e-5,
    weight_decay=0.02,
    label_smoothing=0.1,
    dropout=0.3,
    seed=42,
    n_folds=5,
    inner_val_splits=6,
)


# ---------------------------------------------------------------------------
# Data
# ---------------------------------------------------------------------------

def load_data(data_dir: Path):
    rows = list(csv.DictReader(open(data_dir / "manifest.csv")))
    images = [np.asarray(Image.open(data_dir / r["path"]), dtype=np.float32) / 255.0 for r in rows]
    labels = np.array([CLASSES.index(r["class"]) for r in rows])
    groups = np.array([r["group"] for r in rows])
    names = [r["path"] for r in rows]
    return images, labels, groups, names


class AugSet(Dataset):
    def __init__(self, images, labels, idx):
        self.images, self.labels, self.idx = images, labels, idx

    def __len__(self):
        return len(self.idx)

    def __getitem__(self, i):
        j = self.idx[i]
        rng = np.random.default_rng(torch.randint(0, 2**31 - 1, (1,)).item())
        x = augment(self.images[j], rng)
        return torch.from_numpy(x)[None], int(self.labels[j])


def view_batch(images, idx, views):
    xs, meta = [], []
    for j in idx:
        for z, f in views:
            xs.append(eval_view(images[j], zoom=z, contrast_flip=f))
            meta.append((j, z, f))
    return torch.from_numpy(np.stack(xs))[:, None], meta


@torch.no_grad()
def predict_logits(model, x, device, bs=64):
    model.eval()
    out = []
    for i in range(0, len(x), bs):
        out.append(model(x[i:i + bs].to(device)).float().cpu())
    return torch.cat(out)


# ---------------------------------------------------------------------------
# Calibration
# ---------------------------------------------------------------------------

def fit_temperature(logits: torch.Tensor, labels: torch.Tensor) -> float:
    log_t = torch.zeros(1, requires_grad=True)
    opt = torch.optim.LBFGS([log_t], lr=0.1, max_iter=200)

    def closure():
        opt.zero_grad()
        loss = F.cross_entropy(logits / log_t.exp(), labels)
        loss.backward()
        return loss

    opt.step(closure)
    return float(np.clip(log_t.exp().item(), 0.25, 10.0))


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def inner_split(labels, groups, train_idx, seed):
    sgkf = StratifiedGroupKFold(n_splits=CFG["inner_val_splits"], shuffle=True, random_state=seed)
    tr, va = next(sgkf.split(train_idx, labels[train_idx], groups[train_idx]))
    return train_idx[tr], train_idx[va]


def train_one(images, labels, groups, train_idx, val_idx, out_dir: Path, device, seed):
    out_dir.mkdir(parents=True, exist_ok=True)
    torch.manual_seed(seed)
    np.random.seed(seed)

    counts = np.bincount(labels[train_idx], minlength=len(CLASSES)).astype(float)
    # Inverse frequency overall, split as n^-0.5 (sampler) * n^-0.5 (loss).
    sqrt_inv = 1.0 / np.sqrt(np.maximum(counts, 1))
    loss_w = torch.tensor(sqrt_inv / sqrt_inv.mean(), dtype=torch.float32, device=device)
    full_inv = 1.0 / np.maximum(counts, 1)
    val_w = torch.tensor(full_inv / full_inv.mean(), dtype=torch.float32)
    sample_w = sqrt_inv[labels[train_idx]]

    sampler = WeightedRandomSampler(sample_w, num_samples=CFG["samples_per_epoch"], replacement=True)
    loader = DataLoader(AugSet(images, labels, train_idx), batch_size=CFG["batch_size"], sampler=sampler,
                        num_workers=8, persistent_workers=True, drop_last=True,
                        worker_init_fn=lambda w: torch.manual_seed(seed * 1000 + w + int(time.time())))

    x_val, meta_val = view_batch(images, val_idx, VAL_VIEWS)
    y_val = torch.tensor([labels[j] for j, _, _ in meta_val])

    model = GreyGapCNN(dropout_rate=CFG["dropout"]).to(device)
    decay = [p for n, p in model.named_parameters() if p.ndim > 1]
    no_decay = [p for n, p in model.named_parameters() if p.ndim <= 1]
    opt = torch.optim.AdamW([{"params": decay, "weight_decay": CFG["weight_decay"]},
                             {"params": no_decay, "weight_decay": 0.0}], lr=CFG["lr"])
    steps_per_epoch = len(loader)
    total = CFG["epochs"] * steps_per_epoch
    warm = CFG["warmup_epochs"] * steps_per_epoch

    def lr_at(step):
        if step < warm:
            return CFG["lr"] * (step + 1) / warm
        t = (step - warm) / max(1, total - warm)
        return CFG["min_lr"] + 0.5 * (CFG["lr"] - CFG["min_lr"]) * (1 + math.cos(math.pi * t))

    criterion = nn.CrossEntropyLoss(weight=loss_w, label_smoothing=CFG["label_smoothing"])
    scaler = torch.cuda.amp.GradScaler(enabled=device.type == "cuda")
    history, best = [], {"val_loss": float("inf")}
    step = 0
    t0 = time.time()
    for epoch in range(CFG["epochs"]):
        model.train()
        tl, n = 0.0, 0
        for xb, yb in loader:
            for g in opt.param_groups:
                g["lr"] = lr_at(step)
            xb, yb = xb.to(device, non_blocking=True), yb.to(device, non_blocking=True)
            with torch.autocast(device_type=device.type, dtype=torch.float16, enabled=device.type == "cuda"):
                loss = criterion(model(xb), yb)
            opt.zero_grad(set_to_none=True)
            scaler.scale(loss).backward()
            scaler.step(opt)
            scaler.update()
            tl += loss.item() * len(yb)
            n += len(yb)
            step += 1

        logits = predict_logits(model, x_val, device)
        vloss = F.cross_entropy(logits, y_val, weight=val_w).item()
        vacc = (logits.argmax(1) == y_val).float().mean().item()
        history.append({"epoch": epoch + 1, "train_loss": tl / n, "val_loss": vloss, "val_acc": vacc,
                        "lr": lr_at(step - 1)})
        if vloss < best["val_loss"]:
            best = {"val_loss": vloss, "val_acc": vacc, "epoch": epoch + 1}
            torch.save(model.state_dict(), out_dir / "best_state.pth")
        if (epoch + 1) % 10 == 0 or epoch == 0:
            print(f"  epoch {epoch + 1:3d}  train {tl / n:.3f}  val_loss {vloss:.3f}  val_acc {vacc:.3f}  "
                  f"best@{best['epoch']} ({time.time() - t0:.0f}s)", flush=True)

    model.load_state_dict(torch.load(out_dir / "best_state.pth", map_location=device))
    val_logits = predict_logits(model, x_val, device)
    temperature = fit_temperature(val_logits, y_val)
    json.dump({"history": history, "best": best, "temperature": temperature, "config": CFG,
               "train_counts": counts.tolist()}, open(out_dir / "history.json", "w"), indent=1)
    print(f"  best epoch {best['epoch']}  val_loss {best['val_loss']:.3f}  val_acc {best['val_acc']:.3f}  "
          f"T={temperature:.2f}", flush=True)
    return model, temperature, best


def test_fold(model, images, labels, test_idx, device):
    views = [(z, f) for z in TEST_ZOOMS for f in (False, True)]
    x, meta = view_batch(images, test_idx, views)
    logits = predict_logits(model, x, device).numpy()
    return {
        "logits": logits,
        "index": np.array([m[0] for m in meta]),
        "zoom": np.array([m[1] for m in meta]),
        "flip": np.array([m[2] for m in meta]),
        "label": np.array([labels[m[0]] for m in meta]),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["cv", "final"])
    ap.add_argument("--name", required=True)
    ap.add_argument("--data", type=Path, default=HERE / "data")
    ap.add_argument("--folds", default="all", help="'all' or comma list, e.g. 0,1")
    ap.add_argument("--epochs", type=int, default=CFG["epochs"])
    args = ap.parse_args()
    CFG["epochs"] = args.epochs

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    images, labels, groups, names = load_data(args.data)
    run_dir = HERE / "runs" / args.name
    run_dir.mkdir(parents=True, exist_ok=True)
    print(f"device {device}; {len(images)} source images {dict(Counter(CLASSES[l] for l in labels))}")

    if args.mode == "cv":
        sgkf = StratifiedGroupKFold(n_splits=CFG["n_folds"], shuffle=True, random_state=CFG["seed"])
        splits = list(sgkf.split(np.zeros(len(labels)), labels, groups))
        wanted = range(len(splits)) if args.folds == "all" else [int(f) for f in args.folds.split(",")]
        for k in wanted:
            train_idx, test_idx = splits[k]
            tr, va = inner_split(labels, groups, train_idx, CFG["seed"] + k)
            print(f"fold {k}: train {len(tr)}  val {len(va)}  test {len(test_idx)}  "
                  f"test classes {dict(Counter(CLASSES[l] for l in labels[test_idx]))}", flush=True)
            fold_dir = run_dir / f"fold{k}"
            model, temperature, best = train_one(images, labels, groups, tr, va, fold_dir, device, CFG["seed"] + k)
            res = test_fold(model, images, labels, test_idx, device)
            np.savez(fold_dir / "test.npz", temperature=temperature, names=np.array(names), **res)
    else:
        all_idx = np.arange(len(labels))
        tr, va = inner_split(labels, groups, all_idx, CFG["seed"])
        print(f"final: train {len(tr)}  val {len(va)}", flush=True)
        model, temperature, best = train_one(images, labels, groups, tr, va, run_dir, device, CFG["seed"])
        ckpt = {
            "arch": "GreyGapCNN",
            "arch_kwargs": {"dropout_rate": CFG["dropout"]},
            "state_dict": {k: v.cpu() for k, v in model.state_dict().items()},
            "temperature": temperature,
            "class_labels": CLASSES,
            "input_size": 217,
            "in_channels": 1,
            "preprocess": "afm_runtime.utils.cnn_preprocess.model_input",
            "trained": time.strftime("%Y-%m-%d"),
            "best_epoch": best["epoch"],
            "config": CFG,
        }
        torch.save(ckpt, run_dir / "cnn_grey_gap.pth")
        print("saved", run_dir / "cnn_grey_gap.pth")


if __name__ == "__main__":
    main()
