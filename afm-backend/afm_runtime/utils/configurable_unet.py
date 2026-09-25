"""
Configurable FlashAttentionUNet for ablation experiments.
Accepts explicit flags to enable/disable attention at each location.
Based on: unet_flash_attention.py (original)
"""

from math import sqrt, ceil
from functools import partial
from typing import List, Tuple, Optional, Dict

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.checkpoint import checkpoint
from einops import rearrange, repeat


# ============================================================================
# MAGNITUDE-PRESERVING HELPERS (Karras et al. arxiv:2312.02696)
# ============================================================================

def l2norm(t, dim=-1, eps=1e-12):
    return F.normalize(t, dim=dim, eps=eps)


class PixelNorm(nn.Module):
    def __init__(self, dim, eps=1e-4):
        super().__init__()
        self.dim = dim
        self.eps = eps

    def forward(self, x):
        dim = self.dim
        return l2norm(x, dim=dim, eps=self.eps) * sqrt(x.shape[dim])


class MPAdd(nn.Module):
    def __init__(self, t=0.3):
        super().__init__()
        self.t = t

    def forward(self, x, res):
        a, b, t = x, res, self.t
        num = a * (1.0 - t) + b * t
        den = sqrt((1 - t) ** 2 + t ** 2)
        return num / den


# ============================================================================
# ATTENTION MODULES
# ============================================================================

class MultiHeadSelfAttention(nn.Module):
    """
    Proper multi-head self-attention with:
      - Q/K/V projections via 1x1 conv
      - Pixel normalization (Karras-style)
      - Learnable memory key-value pairs
      - Magnitude-preserving residual (MPAdd)
      - Flash Attention via scaled_dot_product_attention
    """
    def __init__(self, dim: int, heads: int = 4, dim_head: int = 64,
                 num_mem_kv: int = 4, mp_add_t: float = 0.3):
        super().__init__()
        self.heads = heads
        self.dim_head = dim_head
        hidden_dim = dim_head * heads

        self.pixel_norm = PixelNorm(dim=-1)
        self.mem_kv = nn.Parameter(torch.randn(2, heads, num_mem_kv, dim_head))
        self.to_qkv = nn.Conv2d(dim, hidden_dim * 3, kernel_size=1, bias=False)
        self.to_out = nn.Conv2d(hidden_dim, dim, kernel_size=1, bias=False)
        self.mp_add = MPAdd(t=mp_add_t)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        res = x
        b, c, h, w = x.shape

        qkv = self.to_qkv(x).chunk(3, dim=1)
        q, k, v = map(
            lambda t: rearrange(t, 'b (heads d) x y -> b heads (x y) d', heads=self.heads),
            qkv
        )

        mk, mv = map(lambda t: repeat(t, 'h n d -> b h n d', b=b), self.mem_kv)
        k = torch.cat((mk, k), dim=-2)
        v = torch.cat((mv, v), dim=-2)

        q, k, v = map(self.pixel_norm, (q, k, v))
        q, k, v = q.contiguous(), k.contiguous(), v.contiguous()

        attn_out = F.scaled_dot_product_attention(q, k, v, is_causal=False)

        attn_out = rearrange(attn_out, 'b heads (x y) d -> b (heads d) x y', x=h, y=w)
        out = self.to_out(attn_out)

        return self.mp_add(out, res)


class AttentionGate(nn.Module):
    """Attention Gate for skip connections in UNet decoder."""
    def __init__(self, F_g: int, F_l: int, F_int: int):
        super().__init__()
        self.W_g = nn.Sequential(
            nn.Conv2d(F_g, F_int, kernel_size=1, stride=1, padding=0, bias=True),
            nn.BatchNorm2d(F_int)
        )
        self.W_x = nn.Sequential(
            nn.Conv2d(F_l, F_int, kernel_size=1, stride=1, padding=0, bias=True),
            nn.BatchNorm2d(F_int)
        )
        self.psi = nn.Sequential(
            nn.Conv2d(F_int, 1, kernel_size=1, stride=1, padding=0, bias=True),
            nn.BatchNorm2d(1),
            nn.Sigmoid()
        )
        self.relu = nn.ReLU(inplace=True)

    def forward(self, g: torch.Tensor, x: torch.Tensor) -> torch.Tensor:
        g1 = self.W_g(g)
        x1 = self.W_x(x)
        psi = self.relu(g1 + x1)
        psi = self.psi(psi)
        return x * psi


class ChannelAttention(nn.Module):
    def __init__(self, channels: int, reduction: int = 16):
        super().__init__()
        self.avg_pool = nn.AdaptiveAvgPool2d(1)
        self.max_pool = nn.AdaptiveMaxPool2d(1)
        self.fc = nn.Sequential(
            nn.Conv2d(channels, channels // reduction, 1, bias=False),
            nn.ReLU(inplace=True),
            nn.Conv2d(channels // reduction, channels, 1, bias=False)
        )
        self.sigmoid = nn.Sigmoid()

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        avg_out = self.fc(self.avg_pool(x))
        max_out = self.fc(self.max_pool(x))
        return x * self.sigmoid(avg_out + max_out)


class SpatialAttention(nn.Module):
    def __init__(self, kernel_size: int = 7):
        super().__init__()
        padding = kernel_size // 2
        self.conv = nn.Conv2d(2, 1, kernel_size, padding=padding, bias=False)
        self.sigmoid = nn.Sigmoid()

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        avg_out = torch.mean(x, dim=1, keepdim=True)
        max_out, _ = torch.max(x, dim=1, keepdim=True)
        concat = torch.cat([avg_out, max_out], dim=1)
        return x * self.sigmoid(self.conv(concat))


class CBAM(nn.Module):
    def __init__(self, channels: int, reduction: int = 16, kernel_size: int = 7):
        super().__init__()
        self.channel_attn = ChannelAttention(channels, reduction)
        self.spatial_attn = SpatialAttention(kernel_size)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.channel_attn(x)
        x = self.spatial_attn(x)
        return x


# ============================================================================
# ASPP MODULE
# ============================================================================

class ASPPConv(nn.Sequential):
    def __init__(self, in_channels: int, out_channels: int, dilation: int):
        modules = [
            nn.Conv2d(
                in_channels,
                out_channels,
                kernel_size=3,
                padding=dilation,
                dilation=dilation,
                bias=False,
            ),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
        ]
        super().__init__(*modules)


class ASPPPooling(nn.Module):
    def __init__(self, in_channels: int, out_channels: int):
        super().__init__()
        self.gap = nn.AdaptiveAvgPool2d(1)
        self.proj = nn.Sequential(
            nn.Conv2d(in_channels, out_channels, kernel_size=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        size = x.shape[-2:]
        x = self.gap(x)
        x = self.proj(x)
        return F.interpolate(x, size=size, mode='bilinear', align_corners=False)


class ASPP(nn.Module):
    """Atrous Spatial Pyramid Pooling at bottleneck."""
    def __init__(
        self,
        in_channels: int,
        out_channels: int,
        rates: Tuple[int, int, int] = (2, 4, 6),
        dropout: float = 0.1,
    ):
        super().__init__()
        branch_channels = out_channels // 4

        self.branch1 = nn.Sequential(
            nn.Conv2d(in_channels, branch_channels, kernel_size=1, bias=False),
            nn.BatchNorm2d(branch_channels),
            nn.ReLU(inplace=True),
        )
        self.branch2 = ASPPConv(in_channels, branch_channels, dilation=rates[0])
        self.branch3 = ASPPConv(in_channels, branch_channels, dilation=rates[1])
        self.branch4 = ASPPConv(in_channels, branch_channels, dilation=rates[2])
        self.branch5 = ASPPPooling(in_channels, branch_channels)

        concat_channels = branch_channels * 5
        self.project = nn.Sequential(
            nn.Conv2d(concat_channels, out_channels, kernel_size=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
            nn.Dropout2d(dropout),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x1 = self.branch1(x)
        x2 = self.branch2(x)
        x3 = self.branch3(x)
        x4 = self.branch4(x)
        x5 = self.branch5(x)
        x = torch.cat([x1, x2, x3, x4, x5], dim=1)
        return self.project(x)


# ============================================================================
# CONFIGURABLE UNET
# ============================================================================

class ConfigurableUNet(nn.Module):
    """
    UNet with configurable attention placement for ablation studies.
    
    Attention locations (all independently toggleable):
      Self-Attention:
        - bottleneck_attn:  at the bottleneck (16x16)
        - enc3_attn:        encoder stage 3 (64x64)
        - enc4_attn:        encoder stage 4 (32x32)
        - dec3_attn:        decoder stage 3 (64x64)
        - dec4_attn:        decoder stage 4 (32x32)
      
      Attention Gates (on skip connections):
        - att1: skip connection 1 (256x256)
        - att2: skip connection 2 (128x128)
        - att3: skip connection 3 (64x64)
        - att4: skip connection 4 (32x32)
      
      CBAM:
        - cbam: channel + spatial attention after each encoder block
    """

    # All possible self-attention locations
    ALL_SELF_ATTN_LOCATIONS = ['bottleneck', 'enc3', 'enc4', 'dec3', 'dec4']
    ALL_ATTN_GATE_LOCATIONS = ['att1', 'att2', 'att3', 'att4']

    def __init__(
        self,
        in_channels: int = 3,
        num_classes: int = 1,
        base_channels: int = 32,
        num_convs_per_block: int = 2,
        kernel_size: int = 3,
        self_attn_locations: Optional[List[str]] = None,
        use_attention_gates: bool = True,
        use_cbam: bool = True,
        use_aspp: bool = False,
        aspp_rates: Tuple[int, int, int] = (2, 4, 6),
        aspp_dropout: float = 0.1,
        attn_dim_head: int = 64,
        attn_res_mp_add_t: float = 0.3,
        dropout_rate: float = 0.2,
        gradient_checkpointing: bool = False,
    ):
        super().__init__()

        # Store config for saving / reproducing
        # Includes img_size, model_type, use_self_attention for backward compat with old inference scripts
        self.config = {
            'in_channels': in_channels,
            'num_classes': num_classes,
            'base_channels': base_channels,
            'img_size': 256,
            'num_convs_per_block': num_convs_per_block,
            'kernel_size': kernel_size,
            'self_attn_locations': self_attn_locations or [],
            'use_self_attention': bool(self_attn_locations),
            'use_attention_gates': use_attention_gates,
            'use_cbam': use_cbam,
            'use_aspp': use_aspp,
            'aspp_rates': list(aspp_rates),
            'aspp_dropout': aspp_dropout,
            'attn_dim_head': attn_dim_head,
            'attn_res_mp_add_t': attn_res_mp_add_t,
            'dropout_rate': dropout_rate,
            'gradient_checkpointing': gradient_checkpointing,
            'model_type': 'ConfigurableUNet_AttentionAblation',
        }

        self.self_attn_locations = set(self_attn_locations or [])
        self.use_attention_gates = use_attention_gates
        self.use_cbam = use_cbam
        self.use_aspp = use_aspp
        self.gradient_checkpointing = gradient_checkpointing

        if kernel_size % 2 == 0:
            raise ValueError("kernel_size must be odd")
        padding = (kernel_size - 1) // 2

        # --- Helper ---
        def conv_block(in_c, out_c, num_convs, use_dropout=False):
            layers = [
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

        def make_attn(dim, location_name):
            """Create self-attention if enabled for this location, else Identity."""
            if location_name not in self.self_attn_locations:
                return nn.Identity()
            heads = max(ceil(dim / attn_dim_head), 2)
            return MultiHeadSelfAttention(
                dim=dim, heads=heads, dim_head=attn_dim_head,
                mp_add_t=attn_res_mp_add_t
            )

        # ==================== ENCODER ====================
        self.enc1 = conv_block(in_channels, base_channels, num_convs_per_block)
        self.pool1 = nn.MaxPool2d(2, 2)

        self.enc2 = conv_block(base_channels, base_channels * 2, num_convs_per_block)
        self.pool2 = nn.MaxPool2d(2, 2)

        self.enc3 = conv_block(base_channels * 2, base_channels * 4, num_convs_per_block)
        self.enc3_attn = make_attn(base_channels * 4, 'enc3')
        self.pool3 = nn.MaxPool2d(2, 2)

        self.enc4 = conv_block(base_channels * 4, base_channels * 8, num_convs_per_block)
        self.enc4_attn = make_attn(base_channels * 8, 'enc4')
        self.pool4 = nn.MaxPool2d(2, 2)

        # ==================== BOTTLENECK ====================
        self.bottleneck = conv_block(
            base_channels * 8, base_channels * 16,
            num_convs_per_block, use_dropout=True
        )

        if use_aspp:
            self.aspp = ASPP(
                in_channels=base_channels * 16,
                out_channels=base_channels * 16,
                rates=aspp_rates,
                dropout=aspp_dropout,
            )
        else:
            self.aspp = nn.Identity()

        self.bottleneck_attn = make_attn(base_channels * 16, 'bottleneck')

        # ==================== DECODER ====================
        self.upconv4 = nn.ConvTranspose2d(base_channels * 16, base_channels * 8, 2, 2)
        if use_attention_gates:
            self.att4 = AttentionGate(F_g=base_channels * 8, F_l=base_channels * 8, F_int=base_channels * 4)
        else:
            self.att4 = nn.Identity()
        self.dec4 = conv_block(base_channels * 16, base_channels * 8, num_convs_per_block, use_dropout=True)
        self.dec4_attn = make_attn(base_channels * 8, 'dec4')

        self.upconv3 = nn.ConvTranspose2d(base_channels * 8, base_channels * 4, 2, 2)
        if use_attention_gates:
            self.att3 = AttentionGate(F_g=base_channels * 4, F_l=base_channels * 4, F_int=base_channels * 2)
        else:
            self.att3 = nn.Identity()
        self.dec3 = conv_block(base_channels * 8, base_channels * 4, num_convs_per_block)
        self.dec3_attn = make_attn(base_channels * 4, 'dec3')

        self.upconv2 = nn.ConvTranspose2d(base_channels * 4, base_channels * 2, 2, 2)
        if use_attention_gates:
            self.att2 = AttentionGate(F_g=base_channels * 2, F_l=base_channels * 2, F_int=base_channels)
        else:
            self.att2 = nn.Identity()
        self.dec2 = conv_block(base_channels * 4, base_channels * 2, num_convs_per_block)

        self.upconv1 = nn.ConvTranspose2d(base_channels * 2, base_channels, 2, 2)
        if use_attention_gates:
            self.att1 = AttentionGate(F_g=base_channels, F_l=base_channels, F_int=base_channels // 2)
        else:
            self.att1 = nn.Identity()
        self.dec1 = conv_block(base_channels * 2, base_channels, num_convs_per_block)

        # ==================== CBAM ====================
        if use_cbam:
            self.cbam1 = CBAM(base_channels)
            self.cbam2 = CBAM(base_channels * 2)
            self.cbam3 = CBAM(base_channels * 4)
            self.cbam4 = CBAM(base_channels * 8)
            # CBAM checkpoints also include attention after the two deepest
            # decoder blocks. Keep these names aligned with the trained state.
            self.cbam_dec4 = CBAM(base_channels * 8)
            self.cbam_dec3 = CBAM(base_channels * 4)

        # ==================== OUTPUT HEAD ====================
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

    def _apply_attn_gate(self, gate_module, g, x):
        """Apply attention gate — handles both AttentionGate and Identity."""
        if isinstance(gate_module, AttentionGate):
            return gate_module(g=g, x=x)
        else:
            return x  # nn.Identity — just pass through skip connection

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        if self.gradient_checkpointing and self.training:
            return self._forward_with_checkpointing(x)
        return self._forward(x)

    def _forward(self, x: torch.Tensor) -> torch.Tensor:
        # ==================== ENCODER ====================
        e1 = self.enc1(x)
        if self.use_cbam:
            e1 = self.cbam1(e1)
        p1 = self.pool1(e1)

        e2 = self.enc2(p1)
        if self.use_cbam:
            e2 = self.cbam2(e2)
        p2 = self.pool2(e2)

        e3 = self.enc3(p2)
        e3 = self.enc3_attn(e3)
        if self.use_cbam:
            e3 = self.cbam3(e3)
        p3 = self.pool3(e3)

        e4 = self.enc4(p3)
        e4 = self.enc4_attn(e4)
        if self.use_cbam:
            e4 = self.cbam4(e4)
        p4 = self.pool4(e4)

        # ==================== BOTTLENECK ====================
        bottleneck = self.bottleneck(p4)
        bottleneck = self.aspp(bottleneck)
        bottleneck = self.bottleneck_attn(bottleneck)

        # ==================== DECODER ====================
        d4 = self.upconv4(bottleneck)
        e4_att = self._apply_attn_gate(self.att4, g=d4, x=e4)
        d4 = torch.cat((d4, e4_att), dim=1)
        d4 = self.dec4(d4)
        d4 = self.dec4_attn(d4)
        if self.use_cbam:
            d4 = self.cbam_dec4(d4)

        d3 = self.upconv3(d4)
        e3_att = self._apply_attn_gate(self.att3, g=d3, x=e3)
        d3 = torch.cat((d3, e3_att), dim=1)
        d3 = self.dec3(d3)
        d3 = self.dec3_attn(d3)
        if self.use_cbam:
            d3 = self.cbam_dec3(d3)

        d2 = self.upconv2(d3)
        e2_att = self._apply_attn_gate(self.att2, g=d2, x=e2)
        d2 = torch.cat((d2, e2_att), dim=1)
        d2 = self.dec2(d2)

        d1 = self.upconv1(d2)
        e1_att = self._apply_attn_gate(self.att1, g=d1, x=e1)
        d1 = torch.cat((d1, e1_att), dim=1)
        d1 = self.dec1(d1)

        return self.final_conv(d1)

    def _forward_with_checkpointing(self, x: torch.Tensor) -> torch.Tensor:
        """Forward pass with gradient checkpointing — saves ~40% VRAM."""
        use_cbam = self.use_cbam

        def enc1_fn(x):
            e1 = self.enc1(x)
            if use_cbam:
                e1 = self.cbam1(e1)
            return e1

        def enc2_fn(p1):
            e2 = self.enc2(p1)
            if use_cbam:
                e2 = self.cbam2(e2)
            return e2

        def enc3_fn(p2):
            e3 = self.enc3(p2)
            e3 = self.enc3_attn(e3)
            if use_cbam:
                e3 = self.cbam3(e3)
            return e3

        def enc4_fn(p3):
            e4 = self.enc4(p3)
            e4 = self.enc4_attn(e4)
            if use_cbam:
                e4 = self.cbam4(e4)
            return e4

        def bottleneck_fn(p4):
            b = self.bottleneck(p4)
            b = self.aspp(b)
            b = self.bottleneck_attn(b)
            return b

        # Encoder with checkpointing
        e1 = checkpoint(enc1_fn, x, use_reentrant=False)
        p1 = self.pool1(e1)

        e2 = checkpoint(enc2_fn, p1, use_reentrant=False)
        p2 = self.pool2(e2)

        e3 = checkpoint(enc3_fn, p2, use_reentrant=False)
        p3 = self.pool3(e3)

        e4 = checkpoint(enc4_fn, p3, use_reentrant=False)
        p4 = self.pool4(e4)

        bottleneck = checkpoint(bottleneck_fn, p4, use_reentrant=False)

        # Decoder (skip checkpointing for speed; encoder+bottleneck saves most memory)
        d4 = self.upconv4(bottleneck)
        e4_att = self._apply_attn_gate(self.att4, g=d4, x=e4)
        d4 = torch.cat((d4, e4_att), dim=1)
        d4 = self.dec4(d4)
        d4 = self.dec4_attn(d4)
        if use_cbam:
            d4 = self.cbam_dec4(d4)

        d3 = self.upconv3(d4)
        e3_att = self._apply_attn_gate(self.att3, g=d3, x=e3)
        d3 = torch.cat((d3, e3_att), dim=1)
        d3 = self.dec3(d3)
        d3 = self.dec3_attn(d3)
        if use_cbam:
            d3 = self.cbam_dec3(d3)

        d2 = self.upconv2(d3)
        e2_att = self._apply_attn_gate(self.att2, g=d2, x=e2)
        d2 = torch.cat((d2, e2_att), dim=1)
        d2 = self.dec2(d2)

        d1 = self.upconv1(d2)
        e1_att = self._apply_attn_gate(self.att1, g=d1, x=e1)
        d1 = torch.cat((d1, e1_att), dim=1)
        d1 = self.dec1(d1)

        return self.final_conv(d1)
