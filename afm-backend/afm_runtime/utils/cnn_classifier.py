"""
CNN Image Classifier for AFM morphology classification.
Based on 1.cnn_inference_rgb.py - uses the RGB DeeperCNN model.
Classes: dots, irregular, lines, mixed
"""
import torch
import torch.nn as nn
from torchvision import transforms
from PIL import Image
import os

import cv2
import numpy as np
from pathlib import Path


class DeeperCNN(nn.Module):
    """Bradley's DeeperCNN architecture for AFM morphology classification."""

    def __init__(self, num_classes=4, in_channels=3,
                 num_filters1=32, num_filters2=64, num_filters3=128,
                 kernel_size=5, dropout_rate=0.5):
        super(DeeperCNN, self).__init__()

        self.block1 = nn.Sequential(
            nn.Conv2d(in_channels, num_filters1, kernel_size=kernel_size, padding=2),
            nn.BatchNorm2d(num_filters1),
            nn.ReLU(),
            nn.Conv2d(num_filters1, num_filters1, kernel_size=kernel_size, padding=2),
            nn.BatchNorm2d(num_filters1),
            nn.ReLU(),
            nn.MaxPool2d(kernel_size=2, stride=2)
        )

        self.block2 = nn.Sequential(
            nn.Conv2d(num_filters1, num_filters2, kernel_size=kernel_size, padding=2),
            nn.BatchNorm2d(num_filters2),
            nn.ReLU(),
            nn.Conv2d(num_filters2, num_filters2, kernel_size=kernel_size, padding=2),
            nn.BatchNorm2d(num_filters2),
            nn.ReLU(),
            nn.MaxPool2d(kernel_size=2, stride=2)
        )

        self.block3 = nn.Sequential(
            nn.Conv2d(num_filters2, num_filters3, kernel_size=kernel_size, padding=2),
            nn.BatchNorm2d(num_filters3),
            nn.ReLU(),
            nn.Conv2d(num_filters3, num_filters3, kernel_size=kernel_size, padding=2),
            nn.BatchNorm2d(num_filters3),
            nn.ReLU(),
            nn.MaxPool2d(kernel_size=2, stride=2)
        )

        self.flatten = nn.Flatten()
        self.fc_layers = nn.Sequential(
            nn.Linear(128 * 27 * 27, 512),
            nn.ReLU(),
            nn.Dropout(p=dropout_rate),
            nn.Linear(512, 128),
            nn.ReLU(),
            nn.Dropout(p=dropout_rate),
            nn.Linear(128, num_classes)
        )

    def forward(self, x):
        x = self.block1(x)
        x = self.block2(x)
        x = self.block3(x)
        x = self.flatten(x)
        x = self.fc_layers(x)
        return x


def _conv_block(cin, cout, k):
    pad = k // 2
    return nn.Sequential(
        nn.Conv2d(cin, cout, kernel_size=k, padding=pad),
        nn.BatchNorm2d(cout),
        nn.ReLU(),
        nn.Conv2d(cout, cout, kernel_size=k, padding=pad),
        nn.BatchNorm2d(cout),
        nn.ReLU(),
        nn.MaxPool2d(kernel_size=2, stride=2),
    )


class GreyGapCNN(nn.Module):
    """
    Greyscale successor to DeeperCNN (2026-11).

    Keeps the three 5x5 conv blocks (32/64/128 filters), adds a fourth 3x3
    block (256) for a wider receptive field, and replaces the
    Linear(128*27*27 -> 512) head with global average pooling. That head was
    47.8M of the old model's ~48M parameters. Pooling suits texture
    classification (what is present, not where), and the network no longer
    depends on an exact input size.
    """

    def __init__(self, num_classes=4, in_channels=1, filters=(32, 64, 128, 256),
                 kernel_sizes=(5, 5, 5, 3), dropout_rate=0.3):
        super().__init__()
        f1, f2, f3, f4 = filters
        k1, k2, k3, k4 = kernel_sizes
        self.block1 = _conv_block(in_channels, f1, k1)
        self.block2 = _conv_block(f1, f2, k2)
        self.block3 = _conv_block(f2, f3, k3)
        self.block4 = _conv_block(f3, f4, k4)
        self.pool = nn.AdaptiveAvgPool2d(1)
        self.flatten = nn.Flatten()
        self.fc_layers = nn.Sequential(
            nn.Dropout(p=dropout_rate),
            nn.Linear(f4, 128),
            nn.ReLU(),
            nn.Dropout(p=dropout_rate),
            nn.Linear(128, num_classes),
        )

    def forward(self, x):
        x = self.block1(x)
        x = self.block2(x)
        x = self.block3(x)
        x = self.block4(x)
        x = self.flatten(self.pool(x))
        return self.fc_layers(x)


CLASS_LABELS = ['dots', 'irregular', 'lines', 'mixed']
IMAGE_SIZE = 217
IN_CHANNELS = 3


# ---------------------------------------------------------------------------
# Scale normalisation
#
# The CNN only recognises patterns at the feature size it was trained on: the
# training-style examples repeat every ~7 px at the 217 px input. A dots image
# zoomed in 2.5x is classified as "lines" with ~100% confidence, because
# with no texture at a familiar scale the network falls back to "lines".
# So before classifying, the feature period is measured with an FFT and the
# image is re-framed so features repeat every TARGET_PERIOD_PX at the input:
#   * features too big   -> a larger field of view, filled by mirror-tiling
#   * features too small -> a centre crop
# Images already inside PERIOD_BAND are left exactly as before.
# ---------------------------------------------------------------------------
TARGET_PERIOD_PX = 7.2
PERIOD_BAND = (5.5, 9.5)
MAX_RESCALE = 4.0
# At least this many feature periods must fit across the image for the
# period estimate to count. Irregular images have no clear period and are left alone.
MIN_PERIODS_ACROSS = 6
# Full width at half maximum of the spectral peak, relative to its position.
# Real dot/line patterns measure 0.08-0.28. Smoothed random texture with no
# true period measures 0.5 or more.
MAX_PEAK_REL_WIDTH = 0.4


def scale_normalization_enabled(input_mode="rgb"):
    """
    AFM_CNN_SCALE_NORMALIZE: "1" on, "0" off, unset = automatic. Automatic
    means on for the legacy RGB model, which only knows one feature size, and
    off for the greyscale model, which was trained with random zoom (0.5-2.8x).
    In tests, rescaling changed none of the greyscale model's answers.
    """
    value = os.environ.get("AFM_CNN_SCALE_NORMALIZE", "").strip().lower()
    if value in {"0", "false", "no"}:
        return False
    if value in {"1", "true", "yes"}:
        return True
    return input_mode == "rgb"


def estimate_feature_period(pil_image):
    """
    Dominant feature period of the image in native pixels, via the peak of
    the radially averaged power spectrum.

    Returns (period_px or None, peak_rel_width). The relative width is the
    peak's half-maximum width divided by its frequency: small means a sharp,
    genuinely periodic pattern.
    """
    g = np.asarray(pil_image.convert('L'), dtype=np.float32)
    h, w = g.shape
    n = min(h, w)
    y0, x0 = (h - n) // 2, (w - n) // 2
    g = g[y0:y0 + n, x0:x0 + n]
    shrink = 1.0
    if n > 1024:
        shrink = 1024 / n
        g = cv2.resize(g, (1024, 1024), interpolation=cv2.INTER_AREA)
        n = 1024
    if n < 32:
        return None, float("inf")

    # High-pass first. Otherwise slow brightness gradients (common in
    # screenshots and tilted AFM scans) dominate the spectrum.
    hp = g - cv2.GaussianBlur(g, (0, 0), n / 24)
    window = np.outer(np.hanning(n), np.hanning(n))
    power = np.abs(np.fft.fftshift(np.fft.fft2((hp - hp.mean()) * window))) ** 2
    yy, xx = np.indices(power.shape)
    radius = np.rint(np.hypot(xx - n // 2, yy - n // 2)).astype(int)
    profile = np.bincount(radius.ravel(), power.ravel()) / np.maximum(np.bincount(radius.ravel()), 1)

    kmin, kmax = 4, int(n / 3)  # periods from n/4 down to 3 px
    if kmax <= kmin + 2:
        return None, 0.0
    segment = profile[kmin:kmax + 1]
    k = int(np.argmax(segment)) + kmin
    half = profile[k] / 2
    lo = hi = k
    while lo > kmin and profile[lo - 1] > half:
        lo -= 1
    while hi < kmax and profile[hi + 1] > half:
        hi += 1
    rel_width = (hi - lo + 1) / k
    if k < MIN_PERIODS_ACROSS or k >= kmax:
        return None, rel_width

    # Sub-bin refinement: parabola through the log-power around the peak.
    a, b, c = np.log(profile[k - 1:k + 2] + 1e-12)
    denom = a - 2 * b + c
    k_refined = k + (0.5 * (a - c) / denom if denom != 0 else 0.0)
    return (n / k_refined) / shrink, rel_width


def plan_scale_normalization(pil_image, input_mode="rgb"):
    """Decide how to re-frame the image. Returns an info dict (JSON-safe)."""
    w, h = pil_image.size
    max_dim = max(w, h)
    info = {
        "applied": False,
        "period_px": None,
        "input_period_px": None,
        "target_period_px": TARGET_PERIOD_PX,
        "zoom": 1.0,
        "mode": "none",
        "reason": "",
    }
    if not scale_normalization_enabled(input_mode):
        info["reason"] = "disabled"
        return info

    period, rel_width = estimate_feature_period(pil_image)
    info["peak_rel_width"] = round(rel_width, 3) if np.isfinite(rel_width) else None
    if period is None or rel_width > MAX_PEAK_REL_WIDTH:
        info["reason"] = "no clear repeating feature size"
        return info

    input_period = period * IMAGE_SIZE / max_dim
    info["period_px"] = round(period, 2)
    info["input_period_px"] = round(input_period, 2)
    if PERIOD_BAND[0] <= input_period <= PERIOD_BAND[1]:
        info["reason"] = "feature size already matches training scale"
        return info

    # Side of the square field of view (native px) that puts features at the target period.
    view = period * IMAGE_SIZE / TARGET_PERIOD_PX
    view = float(np.clip(view, max_dim / MAX_RESCALE, max_dim * MAX_RESCALE))
    info.update({
        "applied": True,
        "view_px": round(view, 1),
        # >1: features made bigger (crop); <1: features made smaller (mirror-tile).
        "zoom": round(max_dim / view, 3),
        "mode": "crop" if view <= min(w, h) else "mirror-tile",
        "reason": "feature size differs from training scale",
    })
    return info


def _reframe(pil_image, view):
    """Centre square of side ``view`` px, mirror-tiling past the image edges."""
    arr = np.asarray(pil_image.convert('RGB'))
    h, w = arr.shape[:2]
    side = int(round(view))
    pad_y = max(0, (side - h + 1) // 2 + 1)
    pad_x = max(0, (side - w + 1) // 2 + 1)
    if pad_y or pad_x:
        arr = np.pad(arr, ((pad_y, pad_y), (pad_x, pad_x), (0, 0)), mode='symmetric')
    H, W = arr.shape[:2]
    y0, x0 = (H - side) // 2, (W - side) // 2
    return Image.fromarray(np.ascontiguousarray(arr[y0:y0 + side, x0:x0 + side]))


def prepare_tensor(pil_image):
    """
    Turn a PIL image into the (1, 3, 217, 217) tensor the CNN expects.

    Pads to square FIRST to preserve aspect ratio (centred, black padding),
    then resizes to the training size. This is the original preprocessing,
    without scale normalisation.
    """
    image = pil_image.convert('RGB')
    w, h = image.size
    max_dim = max(w, h)
    padded = Image.new('RGB', (max_dim, max_dim), (0, 0, 0))
    padded.paste(image, ((max_dim - w) // 2, (max_dim - h) // 2))
    transform = transforms.Compose([
        transforms.Resize((IMAGE_SIZE, IMAGE_SIZE)),
        transforms.ToTensor(),
    ])
    return transform(padded).unsqueeze(0)


def prepare_input(pil_image, input_mode="rgb"):
    """
    Preprocessing used for classification.

    input_mode "grey": greyscale GreyGapCNN (cnn_preprocess.model_input).
    input_mode "rgb":  legacy DeeperCNN (black padding, colour).
    Returns (tensor, scale_info).
    """
    info = plan_scale_normalization(pil_image, input_mode)
    if input_mode == "grey":
        from .cnn_preprocess import model_input
        arr = model_input(pil_image, view=info["view_px"] if info["applied"] else None, size=IMAGE_SIZE)
        return torch.from_numpy(arr)[None, None], info
    if info["applied"]:
        reframed = _reframe(pil_image, info["view_px"])
        tensor = transforms.Compose([
            transforms.Resize((IMAGE_SIZE, IMAGE_SIZE), antialias=True),
            transforms.ToTensor(),
        ])(reframed).unsqueeze(0)
        return tensor, info
    return prepare_tensor(pil_image), info


class TemperatureScaled(nn.Module):
    """Divides logits by a fitted temperature, so probabilities are calibrated."""

    def __init__(self, model, temperature=1.0):
        super().__init__()
        self.model = model
        self.temperature = float(temperature)

    def forward(self, x):
        return self.model(x) / self.temperature


class CnnClassifier:
    """
    Manages the CNN classification model.

    Accepts either checkpoint format:
      * new: dict with "arch": "GreyGapCNN", "state_dict", "temperature", ...
        (written by training/train.py)
      * legacy: a bare DeeperCNN RGB state_dict (cnn_rgb_classifier.pth)
    """

    def __init__(self):
        self.model = None
        self.device = None
        self.model_path = None
        self.input_mode = "rgb"
        self.temperature = 1.0
        self.meta = {}

    def load(self, model_path, device=None):
        """Load the CNN model from a .pth file."""
        if device is None:
            device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.device = device

        model_path = Path(model_path)
        if not model_path.exists():
            raise FileNotFoundError(f"CNN model not found: {model_path}")
        self.model_path = str(model_path.resolve())

        ckpt = torch.load(str(model_path), map_location=device, weights_only=False)
        if isinstance(ckpt, dict) and ckpt.get("arch") == "GreyGapCNN":
            if list(ckpt.get("class_labels", CLASS_LABELS)) != CLASS_LABELS:
                raise ValueError(f"Unexpected class labels in {model_path.name}: {ckpt.get('class_labels')}")
            net = GreyGapCNN(**ckpt.get("arch_kwargs", {}))
            net.load_state_dict(ckpt["state_dict"])
            self.input_mode = "grey"
            self.temperature = float(ckpt.get("temperature", 1.0))
            self.meta = {k: ckpt[k] for k in ("trained", "best_epoch") if k in ckpt}
        else:
            net = DeeperCNN(in_channels=IN_CHANNELS)
            net.load_state_dict(ckpt)
            self.input_mode = "rgb"
            self.temperature = 1.0

        self.model = TemperatureScaled(net, self.temperature).to(device)
        self.model.eval()
        print(f"CNN classifier loaded: {model_path.name} ({self.input_mode}, T={self.temperature:.2f}) on {device}")

    def prepare(self, pil_image):
        """(tensor, scale_info) exactly as classify() would build them."""
        return prepare_input(pil_image, self.input_mode)

    def classify(self, pil_image):
        """
        Classify a PIL Image.

        Returns dict with predicted_class, confidence, probabilities and
        scale_normalization.
        """
        if self.model is None:
            raise RuntimeError("CNN model not loaded. Call load() first.")

        tensor, scale_info = self.prepare(pil_image)
        image_tensor = tensor.to(self.device)

        with torch.no_grad():
            output = self.model(image_tensor)
            probabilities = torch.softmax(output, dim=1).squeeze()
            predicted_idx = torch.argmax(probabilities).item()
            confidence = probabilities[predicted_idx].item()

        return {
            'predicted_class': CLASS_LABELS[predicted_idx],
            'confidence': float(confidence),
            'probabilities': {
                CLASS_LABELS[i]: float(probabilities[i].item())
                for i in range(len(CLASS_LABELS))
            },
            'scale_normalization': scale_info,
            'input_mode': self.input_mode,
        }
