"""
CNN Image Classifier for AFM morphology classification.
Based on 1.cnn_inference_rgb.py - uses the RGB DeeperCNN model.
Classes: dots, irregular, lines, mixed
"""
import torch
import torch.nn as nn
from torchvision import transforms
from PIL import Image
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


CLASS_LABELS = ['dots', 'irregular', 'lines', 'mixed']
IMAGE_SIZE = 217
IN_CHANNELS = 3


class CnnClassifier:
    """Manages the CNN classification model."""

    def __init__(self):
        self.model = None
        self.device = None
        self.model_path = None

    def load(self, model_path, device=None):
        """Load the CNN model from a .pth file."""
        if device is None:
            device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.device = device

        model_path = Path(model_path)
        if not model_path.exists():
            raise FileNotFoundError(f"CNN model not found: {model_path}")
        self.model_path = str(model_path.resolve())

        self.model = DeeperCNN(in_channels=IN_CHANNELS)
        self.model.load_state_dict(torch.load(str(model_path), map_location=device))
        self.model.to(device)
        self.model.eval()
        print(f"CNN classifier loaded: {model_path.name} on {device}")

    def classify(self, pil_image):
        """
        Classify a PIL Image.

        Args:
            pil_image: PIL Image (any mode - will be converted to RGB)

        Returns:
            dict with predicted_class, confidence, probabilities
        """
        if self.model is None:
            raise RuntimeError("CNN model not loaded. Call load() first.")

        # Prepare image – pad to square FIRST to preserve aspect ratio,
        # then resize to the training size (217×217).
        image = pil_image.convert('RGB')
        w, h = image.size
        max_dim = max(w, h)
        # Centre-pad with black
        padded = Image.new('RGB', (max_dim, max_dim), (0, 0, 0))
        padded.paste(image, ((max_dim - w) // 2, (max_dim - h) // 2))

        transform = transforms.Compose([
            transforms.Resize((IMAGE_SIZE, IMAGE_SIZE)),
            transforms.ToTensor(),
        ])
        image_tensor = transform(padded).unsqueeze(0).to(self.device)

        # Run inference
        self.model.eval()
        with torch.no_grad():
            output = self.model(image_tensor)
            probabilities = torch.softmax(output, dim=1).squeeze()
            predicted_idx = torch.argmax(probabilities).item()
            confidence = probabilities[predicted_idx].item()

        result = {
            'predicted_class': CLASS_LABELS[predicted_idx],
            'confidence': float(confidence),
            'probabilities': {
                CLASS_LABELS[i]: float(probabilities[i].item())
                for i in range(len(CLASS_LABELS))
            }
        }
        return result
