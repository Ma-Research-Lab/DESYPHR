# CNN retrain: evaluation of `cv1`

## 5-fold grouped cross-validation (held-out source scans, as uploaded)

- Images: 328 source scans, each tested once, by a model that never saw it
- Accuracy: **93.6%** (per fold: 91%, 92%, 92%, 97%, 95%; mean 93.6% ± 2.2%)
- Balanced accuracy: **93.1%** · Macro F1: **0.835**
- Calibration: NLL 0.312 → 0.212, ECE 0.139 → 0.032 after temperature scaling
- Best epochs / temperatures: fold0 e66 T=0.49, fold1 e80 T=0.47, fold2 e100 T=0.51, fold3 e91 T=0.25, fold4 e91 T=0.39

| true \ pred | dots | irregular | lines | mixed | recall |
|---|---|---|---|---|---|
| **dots** | 7 | 0 | 0 | 0 | 100% |
| **irregular** | 1 | 121 | 1 | 3 | 96% |
| **lines** | 2 | 0 | 159 | 10 | 93% |
| **mixed** | 3 | 0 | 1 | 20 | 83% |

Misclassified held-out scans:

- `irregular/R_O_10_S_18_0060.png` → mixed (90% calibrated)
- `irregular/R_O_16_S_12_0002.png` → mixed (99% calibrated)
- `irregular/R_O_17_S_12_0002.png` → mixed (93% calibrated)
- `lines/A_300.png` → mixed (71% calibrated)
- `lines/E_75.png` → mixed (80% calibrated)
- `lines/Z11.png` → mixed (95% calibrated)
- `lines/C_100.png` → mixed (98% calibrated)
- `lines/D_100.png` → mixed (89% calibrated)
- `mixed/C_25.png` → dots (92% calibrated)
- `mixed/X25.png` → dots (99% calibrated)
- `mixed/X41.png` → lines (97% calibrated)
- `irregular/R_O_18_S_16_0004.png` → lines (43% calibrated)
- `irregular/R_O_19_S_17_0003.png` → dots (72% calibrated)
- `lines/A_375.png` → dots (68% calibrated)
- `lines/F_100.png` → mixed (99% calibrated)
- `lines/X17.png` → dots (98% calibrated)
- `lines/Z3.png` → mixed (64% calibrated)
- `mixed/X2.png` → dots (97% calibrated)
- `lines/F_75.png` → mixed (99% calibrated)
- `lines/X28.png` → mixed (96% calibrated)
- `lines/Z1.png` → mixed (59% calibrated)

## Robustness: accuracy vs zoom and contrast (held-out scans)

Zoom > 1 = features bigger (crop); < 1 = smaller (mirror-tiled). The old model was trained on these scans, so its numbers are optimistic; the new model's are held-out.

**Normal contrast**

| model | 0.4× | 0.5× | 0.7× | 1× | 1.4× | 2× | 2.5× | 3× |
|---|---|---|---|---|---|---|---|---|
| old RGB | 82% | 87% | 88% | 99% | 91% | 86% | 87% | 86% |
| new grey | 77% | 91% | 93% | 94% | 95% | 92% | 90% | 87% |

**Inverted contrast**

| model | 0.4× | 0.5× | 0.7× | 1× | 1.4× | 2× | 2.5× | 3× |
|---|---|---|---|---|---|---|---|---|
| old RGB | 70% | 63% | 74% | 82% | 61% | 39% | 38% | 38% |
| new grey | 78% | 90% | 94% | 94% | 95% | 95% | 94% | 87% |

**Average confidence when wrong** (lower is better: wrong answers should be unsure)

| model | 0.4× | 0.5× | 0.7× | 1× | 1.4× | 2× | 2.5× | 3× |
|---|---|---|---|---|---|---|---|---|
| old, normal | 82% | 90% | 62% | 81% | 84% | 92% | 95% | 96% |
| new, normal | 81% | 84% | 80% | 86% | 91% | 80% | 72% | 73% |
| old, inverted | 92% | 88% | 88% | 91% | 90% | 99% | 100% | 100% |
| new, inverted | 83% | 83% | 84% | 84% | 85% | 81% | 77% | 76% |

## Real-world images

| image | expected | old | old + rescale | new | new + rescale |
|---|---|---|---|---|---|
| Screenshot_2026-11-13_at_1.58.11_PM.png | ? | lines 100% | lines 100% | lines 100% | lines 100% |
| Screenshot_2026-11-13_at_2.00.19_PM.png | ? | mixed 63% | mixed 98% | dots 100% | dots 100% |
| Screenshot_2026-11-13_at_2.06.10_PM.png | ? | lines 100% | lines 100% | lines 100% | lines 100% |
| Screenshot_2026-11-13_at_2.06.19_PM.png | ? | lines 75% | lines 75% | dots 100% | dots 100% |
| Screenshot_2026-11-13_at_2.15.54_PM.png | dots | ✗ lines 100% | ✓ dots 95% | ✓ dots 100% | ✓ dots 100% |
| Screenshot_2026-11-13_at_2.15.54_PM_tiled3x3.png | dots | ✓ dots 96% | ✓ dots 96% | ✓ dots 100% | ✓ dots 100% |
| dot.tiff | dots | ✓ dots 99% | ✓ dots 99% | ✓ dots 100% | ✓ dots 100% |
| irregular.png | irregular | ✓ irregular 100% | ✓ irregular 100% | ✓ irregular 100% | ✓ irregular 100% |
| line.tiff | lines | ✓ lines 100% | ✓ lines 100% | ✓ lines 100% | ✓ lines 100% |
| mixed.tiff | mixed | ✓ mixed 85% | ✓ mixed 85% | ✓ mixed 100% | ✓ mixed 100% |
