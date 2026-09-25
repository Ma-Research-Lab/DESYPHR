
import numpy as np
import cv2
from PIL import Image
import torchvision.transforms as transforms
import io
import base64


def preprocess_image(image, img_size=256, denoise_strength=0, sharpen_amount=0, 
                     to_grayscale=False, invert=False, in_channels=1):
   
    if isinstance(image, np.ndarray):
        image = Image.fromarray(image)
    
    # Keep original in color for display unless grayscale is explicitly requested
    display_image = image.copy()
    
    # Convert working copy to the format the model expects
    if in_channels == 1:
        # Model expects grayscale
        working_image = image.convert('L') if image.mode != 'L' else image.copy()
    else:
        # Model expects RGB (e.g. ConfigurableUNet with in_channels=3)
        working_image = image.convert('RGB') if image.mode != 'RGB' else image.copy()
    
    # Apply optional preprocessing
    if denoise_strength > 0 or sharpen_amount > 0 or invert or to_grayscale:
        # If grayscale is checked, convert display image too
        if to_grayscale and display_image.mode != 'L':
            display_image = display_image.convert('L')
        
        # Work on the appropriate image for display
        if to_grayscale:
            display_array = np.array(display_image)
        else:
            # Keep display in color, work on color image
            if display_image.mode != 'RGB':
                display_image = display_image.convert('RGB')
            display_array = np.array(display_image)
        
        # Work on working image for model
        working_array = np.array(working_image)
        
        # Apply denoising if requested
        if denoise_strength > 0:
            if len(working_array.shape) == 3:  # RGB working image
                working_array = cv2.fastNlMeansDenoisingColored(
                    working_array, None,
                    h=denoise_strength,
                    hColor=denoise_strength,
                    templateWindowSize=7,
                    searchWindowSize=21
                )
            else:  # Grayscale working image
                working_array = cv2.fastNlMeansDenoising(
                    working_array, None, 
                    h=denoise_strength, 
                    templateWindowSize=7, 
                    searchWindowSize=21
                )
            
            # Apply to display image too
            if len(display_array.shape) == 3:  # Color image
                display_array = cv2.fastNlMeansDenoisingColored(
                    display_array, None,
                    h=denoise_strength,
                    hColor=denoise_strength,
                    templateWindowSize=7,
                    searchWindowSize=21
                )
            else:  # Grayscale
                display_array = cv2.fastNlMeansDenoising(
                    display_array, None,
                    h=denoise_strength,
                    templateWindowSize=7,
                    searchWindowSize=21
                )
        
        # Apply sharpening if requested (Unsharp Mask)
        if sharpen_amount > 0:
            # Convert sharpen_amount (0-10) to appropriate parameters
            # Sigma for Gaussian blur (lower = more sharpening)
            sigma = 1.0
            # Amount determines strength (higher = stronger sharpening)
            amount = sharpen_amount / 10.0  # Scale to 0.0-1.0
            
            # Apply unsharp mask to working image
            blurred_working = cv2.GaussianBlur(working_array, (0, 0), sigma)
            working_array = cv2.addWeighted(working_array, 1.0 + amount, blurred_working, -amount, 0)
            
            # Apply unsharp mask to display image
            if len(display_array.shape) == 3:  # Color image
                blurred_display = cv2.GaussianBlur(display_array, (0, 0), sigma)
                display_array = cv2.addWeighted(display_array, 1.0 + amount, blurred_display, -amount, 0)
            else:  # Grayscale
                blurred_display = cv2.GaussianBlur(display_array, (0, 0), sigma)
                display_array = cv2.addWeighted(display_array, 1.0 + amount, blurred_display, -amount, 0)
        
        # Apply invert if requested
        if invert:
            working_array = 255 - working_array
            display_array = 255 - display_array
        
        working_image = Image.fromarray(working_array)
        display_image = Image.fromarray(display_array)
    
    # ------------------------------------------------------------------
    # Pad to square FIRST to preserve aspect ratio, then resize to model
    # input size.  This avoids stretching / distorting the image which
    # would shift physical feature sizes and ruin Voronoi / Color Wheel
    # analyses downstream.
    # ------------------------------------------------------------------
    w, h = working_image.size
    max_dim = max(w, h)

    if working_image.mode == 'L':
        padded_working = Image.new('L', (max_dim, max_dim), 0)
    else:
        padded_working = Image.new('RGB', (max_dim, max_dim), (0, 0, 0))
    padded_working.paste(working_image, ((max_dim - w) // 2, (max_dim - h) // 2))

    # Convert to tensor [0, 1] range for model
    transform = transforms.Compose([
        transforms.Resize((img_size, img_size)),
        transforms.ToTensor(),
    ])
    
    img_tensor = transform(padded_working).unsqueeze(0)
    
    # Ensure display image is RGB for compatibility (especially for TIFF)
    if display_image.mode not in ['RGB', 'L']:
        display_image = display_image.convert('RGB')
    elif display_image.mode == 'L' and not to_grayscale:
        # If it ended up grayscale but user didn't want it, convert back
        display_image = display_image.convert('RGB')
    
    return img_tensor, display_image


def image_to_base64(pil_image):
    
    buffered = io.BytesIO()
    
    # Convert to RGB if needed (for TIFF compatibility)
    if pil_image.mode not in ['RGB', 'L']:
        pil_image = pil_image.convert('RGB')
    
    pil_image.save(buffered, format='PNG')
    img_str = base64.b64encode(buffered.getvalue()).decode()
    return f"data:image/png;base64,{img_str}"


def postprocess_mask(mask, morph_kernel=0):
    
    if morph_kernel <= 0:
        return mask
    
    # Ensure mask is uint8
    if mask.dtype != np.uint8:
        mask = mask.astype(np.uint8)
    
    # Create morphological kernel
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (morph_kernel, morph_kernel))
    
    # Opening: removes small noise
    opened = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    
    # Closing: fills small holes
    closed = cv2.morphologyEx(opened, cv2.MORPH_CLOSE, kernel)
    
    return closed


def mask_to_base64(mask, invert=False):
    
    # Ensure mask is integer type
    mask_int = mask.astype(np.int32)
    
    # Get unique class indices
    unique_classes = np.unique(mask_int)
    num_classes = len(unique_classes)
    
    print(f"[DEBUG] Mask unique classes: {unique_classes}")
    print(f"[DEBUG] Mask shape: {mask_int.shape}, min: {mask_int.min()}, max: {mask_int.max()}")
    print(f"[DEBUG] Invert mask: {invert}")
    
    # Count pixels for each class
    for cls_idx in unique_classes:
        pixel_count = np.sum(mask_int == cls_idx)
        percentage = 100.0 * pixel_count / mask_int.size
        print(f"[DEBUG] Class {cls_idx}: {pixel_count} pixels ({percentage:.2f}%)")
    
    # Simple black and white for binary (or grayscale for multi-class)
    if num_classes == 2:
        # Binary: Black (0) and White (255)
        mask_visual = np.zeros_like(mask_int, dtype=np.uint8)
        if invert:
            # Inverted: Background = White, Features = Black
            mask_visual[mask_int == 0] = 255  # Background = White
            mask_visual[mask_int == 1] = 0    # Features = Black
            print(f"[DEBUG] Binary mask (INVERTED): Background=White(255), Features=Black(0)")
        else:
            # Normal: Background = Black, Features = White
            mask_visual[mask_int == 0] = 0    # Background = Black
            mask_visual[mask_int == 1] = 255  # Features = White
            print(f"[DEBUG] Binary mask: Background=Black(0), Features=White(255)")
    else:
        # Multi-class: Map to evenly spaced grayscale values
        mask_visual = np.zeros_like(mask_int, dtype=np.uint8)
        for i, cls_idx in enumerate(unique_classes):
            # Distribute classes evenly across 0-255 range
            gray_value = int(255 * i / max(1, num_classes - 1))
            mask_visual[mask_int == cls_idx] = gray_value
            print(f"[DEBUG] Class {cls_idx} -> Gray value {gray_value}")
    
    print(f"[DEBUG] Visual mask min: {mask_visual.min()}, max: {mask_visual.max()}")
    print(f"[DEBUG] Visual non-zero pixels: {np.count_nonzero(mask_visual)}")
    
    # Convert to PIL grayscale image
    mask_img = Image.fromarray(mask_visual, mode='L')
    buffer = io.BytesIO()
    mask_img.save(buffer, format='PNG')
    buffer.seek(0)
    
    encoded = base64.b64encode(buffer.getvalue()).decode()
    print(f"[DEBUG] Base64 encoded length: {len(encoded)} characters")
    
    return encoded


def confidence_to_base64(conf_map):
    
    # Normalize to 0-1 range
    conf_normalized = np.clip(conf_map, 0, 1).astype(np.float32)
    
    # Viridis colormap data points (5 key colors)
    # Format: [position, R, G, B] where position is 0-1
    viridis_colors = np.array([
        [0.0,   0.267004, 0.004874, 0.329415],  # Dark purple
        [0.25,  0.282623, 0.140926, 0.457517],  # Purple-blue
        [0.5,   0.127568, 0.566949, 0.550556],  # Teal/cyan
        [0.75,  0.369214, 0.788888, 0.382914],  # Green
        [1.0,   0.993248, 0.906157, 0.143936],  # Yellow
    ])
    
    # Create RGB output array
    h, w = conf_map.shape
    conf_rgb = np.zeros((h, w, 3), dtype=np.uint8)
    
    # Interpolate colors for each pixel
    for i in range(len(viridis_colors) - 1):
        pos_start = viridis_colors[i][0]
        pos_end = viridis_colors[i + 1][0]
        color_start = viridis_colors[i][1:]
        color_end = viridis_colors[i + 1][1:]
        
        # Find pixels in this range
        mask = (conf_normalized >= pos_start) & (conf_normalized < pos_end)
        
        if np.any(mask):
            # Linear interpolation
            t = (conf_normalized[mask] - pos_start) / (pos_end - pos_start)
            t = t.reshape(-1, 1)
            
            color_interp = color_start + t * (color_end - color_start)
            conf_rgb[mask] = (color_interp * 255).astype(np.uint8)
    
    # Handle exactly 1.0 values (last color)
    mask_max = conf_normalized >= viridis_colors[-1][0]
    conf_rgb[mask_max] = (viridis_colors[-1][1:] * 255).astype(np.uint8)
    
    # Convert to PIL and encode
    conf_img = Image.fromarray(conf_rgb, mode='RGB')
    buffer = io.BytesIO()
    conf_img.save(buffer, format='PNG')
    buffer.seek(0)
    return base64.b64encode(buffer.getvalue()).decode()
