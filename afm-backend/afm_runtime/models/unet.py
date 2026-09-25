"""
U-Net model architecture for AFM segmentation
"""
import torch
import torch.nn as nn


class BalancedUNet(nn.Module):
    
    def __init__(self, in_channels: int, num_classes: int, num_convs_per_block: int = 2, 
                 base_channels: int = 48, kernel_size: int = 3):
        super(BalancedUNet, self).__init__()
        
        if num_convs_per_block < 1:
            raise ValueError("num_convs_per_block must be at least 1")
        if kernel_size % 2 == 0:
            raise ValueError("kernel_size must be an odd number")

        padding = (kernel_size - 1) // 2
        
        def conv_block(in_c, out_c, num_convs, use_dropout=False, dropout_rate=0.3):
            layers = []
            layers += [
                nn.Conv2d(in_c, out_c, kernel_size=kernel_size, padding=padding),
                nn.BatchNorm2d(out_c),
                nn.ReLU(inplace=True),
            ]
            for _ in range(num_convs - 1):
                layers += [
                    nn.Conv2d(out_c, out_c, kernel_size=kernel_size, padding=padding),
                    nn.BatchNorm2d(out_c),
                    nn.ReLU(inplace=True),
                ]
            if use_dropout:
                layers.append(nn.Dropout2d(dropout_rate))
            return nn.Sequential(*layers)
        
        def downsample_conv(in_c, out_c):
            return nn.Sequential(
                nn.Conv2d(in_c, out_c, kernel_size=3, padding=1, stride=2),
                nn.BatchNorm2d(out_c),
                nn.ReLU(inplace=True)
            )

        # Encoder
        self.enc1 = conv_block(in_channels, base_channels, num_convs_per_block)
        self.pool1 = downsample_conv(base_channels, base_channels)
        
        self.enc2 = conv_block(base_channels, base_channels * 2, num_convs_per_block)
        self.pool2 = downsample_conv(base_channels * 2, base_channels * 2)
        
        self.enc3 = conv_block(base_channels * 2, base_channels * 4, num_convs_per_block)
        self.pool3 = downsample_conv(base_channels * 4, base_channels * 4)

        # Bottleneck
        self.bottleneck = conv_block(base_channels * 4, base_channels * 8, num_convs_per_block, 
                                     use_dropout=True, dropout_rate=0.2)

        # Decoder
        self.upconv3 = nn.ConvTranspose2d(base_channels * 8, base_channels * 4, 2, 2)
        self.dec3 = conv_block(base_channels * 8, base_channels * 4, num_convs_per_block, 
                               use_dropout=True, dropout_rate=0.1)

        self.upconv2 = nn.ConvTranspose2d(base_channels * 4, base_channels * 2, 2, 2)
        self.dec2 = conv_block(base_channels * 4, base_channels * 2, num_convs_per_block)
        
        self.upconv1 = nn.ConvTranspose2d(base_channels * 2, base_channels, 2, 2)
        self.dec1 = conv_block(base_channels * 2, base_channels, num_convs_per_block)

        self.final_conv = nn.Sequential(
            nn.Conv2d(base_channels, base_channels // 2, kernel_size=kernel_size, padding=padding),
            nn.BatchNorm2d(base_channels // 2),
            nn.ReLU(inplace=True),
            nn.Conv2d(base_channels // 2, num_classes, 1)
        )
        
        self._init_weights()
    
    def _init_weights(self):
        for m in self.modules():
            if isinstance(m, nn.Conv2d):
                nn.init.kaiming_normal_(m.weight, mode='fan_out', nonlinearity='relu')
            elif isinstance(m, nn.BatchNorm2d):
                nn.init.constant_(m.weight, 1)
                nn.init.constant_(m.bias, 0)

    def forward(self, x):
        # Encoder
        e1 = self.enc1(x)
        p1 = self.pool1(e1)
        
        e2 = self.enc2(p1)
        p2 = self.pool2(e2)
        
        e3 = self.enc3(p2)
        p3 = self.pool3(e3)

        # Bottleneck
        bottleneck = self.bottleneck(p3)

        # Decoder
        d3 = self.upconv3(bottleneck)
        d3 = torch.cat((d3, e3), dim=1)
        d3 = self.dec3(d3)
        
        d2 = self.upconv2(d3)
        d2 = torch.cat((d2, e2), dim=1)
        d2 = self.dec2(d2)
        
        d1 = self.upconv1(d2)
        d1 = torch.cat((d1, e1), dim=1)
        d1 = self.dec1(d1)
        
        output = self.final_conv(d1)
        return output


def load_model(checkpoint_path, device="cuda"):
    """Load pretrained model from checkpoint. Supports BalancedUNet and ConfigurableUNet."""
    if not torch.cuda.is_available() and device == "cuda":
        device = "cpu"
    
    device = torch.device(device)
    
    try:
        checkpoint = torch.load(checkpoint_path, map_location=device, weights_only=True)
    except:
        checkpoint = torch.load(checkpoint_path, map_location=device, weights_only=False)
    
    config = checkpoint['model_config']
    model_type = config.get('model_type', 'BalancedUNet')
    
    # Detect ConfigurableUNet by model_type or presence of attention config keys
    is_configurable = (
        'ConfigurableUNet' in str(model_type)
        or 'self_attn_locations' in config
        or 'use_attention_gates' in config
    )
    
    if is_configurable:
        from ..utils.configurable_unet import ConfigurableUNet
        model = ConfigurableUNet(
            in_channels=config.get('in_channels', 3),
            num_classes=config.get('num_classes', 1),
            base_channels=config.get('base_channels', 32),
            num_convs_per_block=config.get('num_convs_per_block', 2),
            kernel_size=config.get('kernel_size', 3),
            self_attn_locations=config.get('self_attn_locations', []),
            use_attention_gates=config.get('use_attention_gates', False),
            use_cbam=config.get('use_cbam', False),
            use_aspp=config.get('use_aspp', False),
            aspp_rates=tuple(config.get('aspp_rates', [2, 4, 6])),
            aspp_dropout=config.get('aspp_dropout', 0.1),
            attn_dim_head=config.get('attn_dim_head', 64),
            attn_res_mp_add_t=config.get('attn_res_mp_add_t', 0.3),
            dropout_rate=config.get('dropout_rate', 0.2),
            gradient_checkpointing=False,  # Disable for inference
        ).to(device)
        print(
            "  Model type: ConfigurableUNet "
            f"(attn: {config.get('self_attn_locations', [])}, aspp: {config.get('use_aspp', False)})"
        )
    else:
        model = BalancedUNet(
            in_channels=config['in_channels'],
            num_classes=config['num_classes'],
            base_channels=config.get('base_channels', 48),
            num_convs_per_block=config.get('num_convs_per_block', 2),
            kernel_size=config.get('kernel_size', 3)
        ).to(device)
        print(f"  Model type: BalancedUNet")
    
    model.load_state_dict(checkpoint['model_state_dict'])
    model.eval()

    # Derive the actual model type from what we loaded, not from the (possibly absent) config key
    resolved_model_type = (
        config.get('model_type', 'ConfigurableUNet')
        if is_configurable
        else 'BalancedUNet'
    )

    model_info = {
        'epochs_trained': checkpoint.get('epoch', 'N/A'),
        'val_loss': checkpoint.get('val_loss', 'N/A'),
        'img_size': config.get('img_size', 256),
        'training_date': checkpoint.get('metadata', {}).get('timestamp', 'N/A'),
        'num_classes': config['num_classes'],
        'in_channels': config.get('in_channels', 1),
        'model_type': resolved_model_type,
        'use_aspp': config.get('use_aspp', False),
        'aspp_rates': config.get('aspp_rates', None),
    }
    
    return model, model_info
