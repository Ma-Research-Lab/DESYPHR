"""
Inference utilities
"""
import torch
import numpy as np


def predict_segmentation(model, image_tensor, device, threshold=0.5, is_binary=False):
    """
    Run model prediction
    
    Args:
        model: PyTorch model
        image_tensor: Preprocessed image tensor
        device: torch device
        threshold: Confidence threshold for binary segmentation
        is_binary: Whether model is binary segmentation
    
    Returns:
        Dictionary with mask and confidence
    """
    model.eval()
    image_tensor = image_tensor.to(device)
    
    with torch.no_grad():
        output = model(image_tensor)
        
        if is_binary or output.shape[1] == 1:
            # Binary segmentation
            probs = torch.sigmoid(output)
            pred_mask = (probs > threshold).long()
            
            pred_mask = pred_mask.squeeze().cpu().numpy()
            confidence = probs.squeeze().cpu().numpy()
            
        else:
            # Multi-class segmentation
            probs = torch.softmax(output, dim=1)
            pred_mask = torch.argmax(probs, dim=1)
            confidence, _ = torch.max(probs, dim=1)
            
            pred_mask = pred_mask.squeeze(0).cpu().numpy()
            confidence = confidence.squeeze(0).cpu().numpy()
    
    return {
        'mask': pred_mask,
        'confidence': confidence
    }
