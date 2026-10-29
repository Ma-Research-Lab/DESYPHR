"""API routes for AFM segmentation."""

import base64
import io
import time
import traceback
from pathlib import Path

import numpy as np
from PIL import Image
from flask import jsonify, request

from ..config import ALLOWED_EXTENSIONS, MODELS_DIR
from ..utils.image_processing import (
    confidence_to_base64,
    mask_to_base64,
    postprocess_mask,
    preprocess_image,
)
from ..utils.inference import predict_segmentation


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def _decode_base64_image(b64_string):
    """Decode a base64 string (with or without data-URI prefix) to a PIL Image."""
    if ',' in b64_string:
        b64_string = b64_string.split(',', 1)[1]
    data = base64.b64decode(b64_string)
    return Image.open(io.BytesIO(data))


def create_routes(app, model_manager, cnn_classifier=None):
    """Create all API routes"""
    
    @app.route('/')
    def index():
        return jsonify({
            'status': 'ok',
            'message': 'AFM backend runtime ready',
        })
    
    
    @app.route('/health', methods=['GET'])
    def health():
        mm = model_manager
        model_loaded = mm.model is not None
        return jsonify({
            'status': 'healthy' if model_loaded else 'error',
            'mode': 'production',
            'model_loaded': model_loaded,
            'device': str(mm.device) if model_loaded else 'none',
            'active_model': Path(mm.active_checkpoint).name if mm.active_checkpoint else None,
            'timestamp': time.strftime('%Y-%m-%dT%H:%M:%S')
        })
    
    
    @app.route('/model-info', methods=['GET'])
    def model_info():
        mm = model_manager
        return jsonify({
            'mode': 'production',
            'device': str(mm.device),
            'img_size': mm.img_size,
            'class_names': mm.class_names,
            'num_classes': mm.model_info.get('num_classes', len(mm.class_names)),
            'is_binary': mm.is_binary,
            'epochs_trained': mm.model_info.get('epochs_trained', 'N/A'),
            'val_loss': float(mm.model_info.get('val_loss', 0)) if mm.model_info.get('val_loss') != 'N/A' else None,
            'training_date': mm.model_info.get('training_date', 'N/A'),
            'model_type': mm.model_info.get('model_type', 'Unknown'),
            'in_channels': mm.in_channels,
            'active_model': Path(mm.active_checkpoint).name if mm.active_checkpoint else None,
            'note': 'Production model with real PyTorch inference'
        })


    @app.route('/models', methods=['GET'])
    def list_models():
        """List all available .pt checkpoints with their metadata."""
        import torch
        models_dir = Path(MODELS_DIR)
        result = []
        active = Path(model_manager.active_checkpoint).name if model_manager.active_checkpoint else None

        for pt_file in sorted(models_dir.glob('*.pt')):
            try:
                ckpt = torch.load(str(pt_file), map_location='cpu', weights_only=False)
                cfg = ckpt.get('model_config', {})
                entry = {
                    'filename': pt_file.name,
                    'is_active': pt_file.name == active,
                    'model_type': cfg.get('model_type', 'BalancedUNet'),
                    'base_channels': cfg.get('base_channels'),
                    'in_channels': cfg.get('in_channels', 1),
                    'self_attn_locations': cfg.get('self_attn_locations', []),
                    'use_attention_gates': cfg.get('use_attention_gates', False),
                    'use_cbam': cfg.get('use_cbam', False),
                    'epoch': ckpt.get('epoch'),
                    'val_loss': round(float(ckpt['val_loss']), 4) if isinstance(ckpt.get('val_loss'), float) else None,
                    'size_mb': round(pt_file.stat().st_size / 1024 / 1024, 1),
                }
            except Exception as e:
                entry = {'filename': pt_file.name, 'is_active': pt_file.name == active, 'error': str(e)}
            result.append(entry)

        return jsonify({'models': result, 'active_model': active})


    @app.route('/models/switch', methods=['POST'])
    def switch_model():
        """Switch the active model. Body: {"filename": "model_name.pt"}"""
        data = request.get_json()
        if not data or 'filename' not in data:
            return jsonify({'success': False, 'error': 'Missing "filename" in request body'}), 400

        filename = Path(data['filename']).name  # strip any path traversal
        target = Path(MODELS_DIR) / filename

        if not target.exists():
            return jsonify({'success': False, 'error': f'Model not found: {filename}'}), 404
        if not filename.endswith('.pt'):
            return jsonify({'success': False, 'error': 'Only .pt files are allowed'}), 400

        try:
            t0 = time.time()
            model_manager.switch(str(target))
            elapsed = round((time.time() - t0) * 1000)
            return jsonify({
                'success': True,
                'active_model': filename,
                'model_type': model_manager.model_info.get('model_type', 'Unknown'),
                'in_channels': model_manager.in_channels,
                'img_size': model_manager.img_size,
                'val_loss': model_manager.model_info.get('val_loss'),
                'load_time_ms': elapsed,
            })
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500
    
    
    @app.route('/predict-json', methods=['POST'])
    def predict_json():
        mm = model_manager
        
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'No file provided'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'No file selected'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({
                'success': False, 
                'error': f'Invalid file type. Allowed: {", ".join(ALLOWED_EXTENSIONS)}'
            }), 400
        
        try:
            start_time = time.time()
            
            # Get parameters
            threshold = float(request.form.get('threshold', 0.5))
            denoise_strength = int(request.form.get('denoise', 0))
            sharpen_amount = int(request.form.get('sharpen', 0))
            morph_kernel = int(request.form.get('morphology', 0))
            to_grayscale = request.form.get('grayscale', 'false').lower() == 'true'
            invert = request.form.get('invert', 'false').lower() == 'true'
            invert_mask = request.form.get('invertMask', 'false').lower() == 'true'
            
            # Load image
            image = Image.open(file.stream)
            original_size = list(image.size)
            
            # Preprocess with optional denoising, sharpening, grayscale, and invert
            img_tensor, preprocessed_display = preprocess_image(
                image, 
                img_size=mm.img_size,
                denoise_strength=denoise_strength,
                sharpen_amount=sharpen_amount,
                to_grayscale=to_grayscale,
                invert=invert,
                in_channels=mm.in_channels
            )
            
            # Convert preprocessed image to base64 for display
            from ..utils.image_processing import image_to_base64
            preprocessed_b64 = image_to_base64(preprocessed_display)
            
            # Run prediction
            prediction = predict_segmentation(
                mm.model, img_tensor, mm.device, 
                threshold=threshold, is_binary=mm.is_binary
            )
            
            # Get raw mask and confidence
            mask = prediction['mask']
            conf = prediction['confidence']
            
            # Keep mask as class indices (0, 1, 2, ...)
            mask_classes = mask.astype(np.uint8)
            
            # For binary segmentation with morphology, we need special handling
            if morph_kernel > 0:
                # Convert to 0-255 for morphology operations
                mask_255 = (mask_classes * 255).astype(np.uint8) if mask_classes.max() <= 1 else (mask_classes * 127).astype(np.uint8)
                mask_255 = postprocess_mask(mask_255, morph_kernel)
                # Convert back to class indices
                mask_classes = (mask_255 > 127).astype(np.uint8)
            
            # Calculate statistics
            unique_classes = np.unique(mask_classes).tolist()
            
            class_distribution = {}
            for cls in unique_classes:
                percentage = 100 * (mask_classes == cls).sum() / mask_classes.size
                class_name = mm.class_names[cls] if cls < len(mm.class_names) else f"class_{cls}"
                class_distribution[class_name] = float(percentage)
            
            # Convert to base64 - pass class indices and invert flag
            mask_b64 = mask_to_base64(mask_classes, invert=invert_mask)
            conf_b64 = confidence_to_base64(conf)
            
            processing_time = int((time.time() - start_time) * 1000)
            
            return jsonify({
                'success': True,
                'mode': 'production',
                'filename': file.filename,
                'original_size': original_size,
                'processed_size': [mm.img_size, mm.img_size],
                'avg_confidence': float(conf.mean()),
                'min_confidence': float(conf.min()),
                'max_confidence': float(conf.max()),
                'unique_classes': unique_classes,
                'class_distribution': class_distribution,
                'mask_base64': mask_b64,
                'confidence_base64': conf_b64,
                'preprocessed_base64': preprocessed_b64,
                'mask_shape': mask_classes.shape,
                'threshold_used': threshold,
                'processing_time_ms': processing_time,
                'preprocessing': {
                    'denoise': denoise_strength,
                    'sharpen': sharpen_amount,
                    'grayscale': to_grayscale,
                    'invert': invert
                },
                'postprocessing': {
                    'morphology': morph_kernel
                }
            })
        
        except Exception as e:
            error_details = traceback.format_exc()
            print(f"Error in prediction: {error_details}")
            return jsonify({
                'success': False, 
                'error': str(e),
                'details': error_details if app.debug else None
            }), 500
    
    
    @app.errorhandler(413)
    def too_large(e):
        return jsonify({
            'success': False, 
            'error': 'File too large. Maximum size is 16MB'
        }), 413
    
    
    # ====================================================================
    # NEW PIPELINE ENDPOINTS
    # ====================================================================
    
    @app.route('/classify', methods=['POST'])
    def classify_image():
        """CNN classification: dots / lines / mixed / irregular."""
        if cnn_classifier is None or cnn_classifier.model is None:
            return jsonify({'success': False, 'error': 'CNN classifier not loaded'}), 503

        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'No file provided'}), 400

        file = request.files['file']
        if file.filename == '' or not allowed_file(file.filename):
            return jsonify({'success': False, 'error': 'Invalid file'}), 400

        try:
            image = Image.open(file.stream)
            original_size = image.size  # (w, h)
            result = cnn_classifier.classify(image)
            result['success'] = True
            result['original_size'] = list(original_size)
            result['cnn_input_size'] = 217
            result['resize_note'] = (
                'Image was padded to square (preserving aspect ratio) '
                'then resized to 217×217 for classification.'
            )
            return jsonify(result)
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500


    @app.route('/analyze/voronoi', methods=['POST'])
    def analyze_voronoi():
        """Run Voronoi tessellation analysis on a dot mask.
        
        If extract_dots=true is passed, the mask is first filtered through
        the dot extraction pipeline (connected-component analysis) to
        isolate only round dot features before Voronoi analysis.
        """
        data = request.get_json()
        if not data or 'mask_base64' not in data:
            return jsonify({'success': False, 'error': 'Missing mask_base64'}), 400

        try:
            from ..utils.voronoi_wrapper import run_voronoi

            mask_img = _decode_base64_image(data['mask_base64']).convert('L')
            mask_array = np.array(mask_img)
            image_size = float(data.get('image_size_um', 1.0))

            # Measure domain spacing on the mask with all features, before dot
            # extraction strips the line features out of mixed images.
            full_mask_spacing_nm = None
            try:
                from ..utils.domain_spacing import compute_domain_spacing_from_array
                full_mask_spacing_nm = compute_domain_spacing_from_array(
                    mask_array, image_size, input_is_mask=True
                ).get('spacing_nm')
            except Exception:
                traceback.print_exc()

            # ── Optional dot extraction (for mixed / dots morphology) ──
            extract_dots_flag = str(data.get('extract_dots', 'false')).lower() == 'true'
            dot_stats = None
            if extract_dots_flag:
                from ..utils.dot_extraction import extract_dots
                dot_result = extract_dots(
                    mask_array,
                    min_circularity=float(data.get('min_circularity', 0.6)),
                    max_aspect_ratio=float(data.get('max_aspect_ratio', 1.8)),
                    min_area=int(data.get('min_area', 0)),
                    max_area=int(data.get('max_area', 400)),
                )
                mask_array = dot_result['dots_mask']
                dot_stats = {
                    'total_components': dot_result['total_components'],
                    'kept_dots': dot_result['kept_dots'],
                    'rejected': dot_result['rejected'],
                }
                # Also encode the dots-only mask so the frontend can show it
                from PIL import Image as PILImage
                dots_pil = PILImage.fromarray(mask_array)
                buf = io.BytesIO()
                dots_pil.save(buf, format='PNG')
                dot_stats['dots_mask_base64'] = 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()

            threshold_edge = float(data.get('threshold_edge', 0.25))
            max_size = int(data.get('max_size', 1024))
            packing_edges = int(data.get('packing_edges', 6))

            result = run_voronoi(mask_array, image_size, threshold_edge, max_size, packing_edges, full_mask_spacing_nm)
            if dot_stats:
                result['dot_extraction'] = dot_stats
            return jsonify(result)
        except Exception as e:
            traceback.print_exc()
            return jsonify({'success': False, 'error': str(e)}), 500


    @app.route('/analyze/colorwheel', methods=['POST'])
    def analyze_colorwheel():
        """Run color wheel orientation analysis on a line mask."""
        data = request.get_json()
        if not data or 'mask_base64' not in data:
            return jsonify({'success': False, 'error': 'Missing mask_base64'}), 400

        try:
            from ..utils.colorwheel_analysis import run_colorwheel

            mask_img = _decode_base64_image(data['mask_base64']).convert('L')
            mask_array = np.array(mask_img)

            num_clusters = int(data.get('num_clusters', 8))
            invert = bool(data.get('invert', True))

            image_size_um = data.get('image_size_um', None)
            compute_domain_spacing = bool(data.get('compute_domain_spacing', False))
            domain_spacing_debug = bool(data.get('domain_spacing_debug', False))

            result = run_colorwheel(
                mask_array,
                num_clusters=num_clusters,
                invert=invert,
                image_size_um=image_size_um,
                compute_domain_spacing=compute_domain_spacing,
                domain_spacing_debug=domain_spacing_debug,
            )
            return jsonify(result)
        except Exception as e:
            traceback.print_exc()
            return jsonify({'success': False, 'error': str(e)}), 500


    @app.route('/analyze/dan-binarize', methods=['POST'])
    def analyze_dan_binarize():
        """Run Dan's adaptive/niblack binarization."""
        # Accept either file upload or base64
        try:
            from ..utils.dan_binarization import binarize

            if 'file' in request.files:
                img = Image.open(request.files['file'].stream).convert('L')
                gray = np.array(img)
                params = {k: request.form.get(k) for k in request.form}
            else:
                data = request.get_json()
                if not data or 'image_base64' not in data:
                    return jsonify({'success': False, 'error': 'No image provided'}), 400
                img = _decode_base64_image(data['image_base64']).convert('L')
                gray = np.array(img)
                params = data

            result = binarize(
                gray,
                method=params.get('method', 'adaptive'),
                adaptive_method=params.get('adaptive_method', 'gaussian'),
                block_size=int(params.get('block_size', 11)),
                C=int(params.get('C', 2)),
                niblack_window=int(params.get('niblack_window', 25)),
                k=float(params.get('k', 0.1)),
                blur=params.get('blur', 'none'),
                blur_ksize=int(params.get('blur_ksize', 5)),
                equalize=str(params.get('equalize', 'false')).lower() == 'true',
                clahe=str(params.get('clahe', 'false')).lower() == 'true',
                combine_mode=params.get('combine_mode', 'OR'),
                alpha=float(params.get('alpha', 0.5)),
            )
            # Don't send the raw array back over the wire
            result.pop('binary_array', None)
            return jsonify(result)
        except Exception as e:
            traceback.print_exc()
            return jsonify({'success': False, 'error': str(e)}), 500


    @app.route('/analyze/dan-spacing', methods=['POST'])
    def analyze_dan_spacing():
        """Run Voronoi-based spacing analysis on a binary mask."""
        data = request.get_json()
        if not data or 'binary_base64' not in data:
            return jsonify({'success': False, 'error': 'Missing binary_base64'}), 400

        try:
            from ..utils.dan_binarization import analyze_spacing

            bin_img = _decode_base64_image(data['binary_base64']).convert('L')
            bin_array = np.array(bin_img)

            image_size_um = float(data.get('image_size_um', 2.0))
            invert = bool(data.get('invert', False))

            result = analyze_spacing(bin_array, image_size_um, invert)
            return jsonify(result)
        except Exception as e:
            traceback.print_exc()
            return jsonify({'success': False, 'error': str(e)}), 500


    # ====================================================================
    
    
    @app.errorhandler(500)
    def internal_error(e):
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': str(e) if app.debug else 'An unexpected error occurred'
        }), 500
