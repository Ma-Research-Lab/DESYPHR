"""
Model manager for handling model loading and state
"""
from pathlib import Path

import torch

from .unet import load_model


class ModelManager:
    def __init__(self):
        self.model = None
        self.device = None
        self.img_size = 256
        self.in_channels = 1
        self.class_names = []
        self.model_info = {}
        self.is_binary = False
        self.active_checkpoint = None   # absolute path of loaded checkpoint
    
    def load(self, checkpoint_path, use_gpu=True):
        """Load model from checkpoint"""
        device_type = "cuda" if use_gpu and torch.cuda.is_available() else "cpu"
        self.device = torch.device(device_type)
        
        print(f"Loading model on {device_type.upper()}...")
        self.model, self.model_info = load_model(checkpoint_path, device_type)
        self.img_size = self.model_info['img_size']
        self.in_channels = self.model_info.get('in_channels', 1)
        self.active_checkpoint = str(Path(checkpoint_path).resolve())

        # Determine segmentation mode
        num_classes = self.model_info['num_classes']
        self.is_binary = (num_classes == 1)
        
        if self.is_binary:
            self.class_names = ['Background', 'Feature']
            print("Binary segmentation model detected")
        else:
            self.class_names = [f'Class_{i}' for i in range(num_classes)]
            self.class_names[0] = 'Background'
            print(f"Multi-class segmentation model detected ({num_classes} classes)")
        
        print(f"Model loaded successfully on {device_type.upper()}")
        print(f"  Input size: {self.img_size}x{self.img_size}")
        print(f"  Classes: {', '.join(self.class_names)}")
        
        # Warmup
        self._warmup()

    def switch(self, checkpoint_path):
        """Hot-swap to a different checkpoint (keeps same device)."""
        use_gpu = (str(self.device) != 'cpu')
        print(f"Switching model → {Path(checkpoint_path).name}")
        self.load(checkpoint_path, use_gpu=use_gpu)

    def _warmup(self):
        """Run dummy inference to warm up model"""
        print("Warming up model...")
        dummy_input = torch.randn(1, self.in_channels, self.img_size, self.img_size).to(self.device)
        with torch.no_grad():
            _ = self.model(dummy_input)
        print("Model warmed up and ready")
