import type { CSSProperties } from "react";

import type { ModelListItem, ThemeMode } from "./types";

export const BACKEND_URL = "/api/backend";
export const CANVAS_SIZE = 520;

const MODEL_LABELS: Record<string, string> = {
  "model_Exp2_Bottleneck_Only.pt": "Exp2 - Bottleneck Attn",
  "model_Exp6_Full_SelfAttn_and_Gates.pt": "Exp6 - Full Attn + Gates",
  "model_Exp10_Full_Everything.pt": "Exp10 - Full Everything",
  "best_quality_unet.pt": "BalancedUNet (best)",
  "last_quality_unet.pt": "BalancedUNet (last)",
  "best_quality_unet_old.pt": "BalancedUNet (old)",
};

export function getOrCreateClientSessionId() {
  if (typeof window === "undefined") return "";
  const key = "afm_client_session_id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;

  const created =
    "sess_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  window.localStorage.setItem(key, created);
  return created;
}

export function getInitialThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const saved = window.localStorage.getItem("afm_theme_mode");
  return saved === "dark" || saved === "retro" ? saved : "light";
}

export function modelLabel(filename: string) {
  return MODEL_LABELS[filename] ?? filename.replace(/\.pt$/i, "");
}

export function modelMeta(item?: ModelListItem | null) {
  if (!item) return "";
  const tags: string[] = [];
  if (item.in_channels === 3) tags.push("RGB input");
  if (item.in_channels === 1) tags.push("Grayscale input");
  if (item.val_loss != null) tags.push(`loss ${item.val_loss}`);
  return tags.join(" · ");
}

export function createStrokeId() {
  return `stroke_${Math.random().toString(36).slice(2, 10)}`;
}

export async function createLocalPreviewUrl(file: File): Promise<string> {
  const isTiff = file.type === "image/tiff" || /\.tiff?$/i.test(file.name);
  if (!isTiff) {
    return URL.createObjectURL(file);
  }

  try {
    const [{ decode, decodeImage, toRGBA8 }, buffer] = await Promise.all([
      import("utif"),
      file.arrayBuffer(),
    ]);
    const ifds = decode(buffer);
    if (!ifds.length) {
      throw new Error("No TIFF pages found");
    }

    const firstPage = ifds[0];
    decodeImage(buffer, firstPage);
    const rgba = toRGBA8(firstPage);
    const width = Number(firstPage.width || 0);
    const height = Number(firstPage.height || 0);
    if (!width || !height) {
      throw new Error("Invalid TIFF dimensions");
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas context unavailable");
    }

    const imageData = new ImageData(new Uint8ClampedArray(rgba), width, height);
    ctx.putImageData(imageData, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png")
    );
    if (!blob) {
      throw new Error("Failed to create TIFF preview");
    }

    return URL.createObjectURL(blob);
  } catch (error) {
    console.warn("Falling back to default preview for TIFF file", file.name, error);
    return URL.createObjectURL(file);
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export async function isBackendReachable(baseUrl: string) {
  try {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`${baseUrl}/health`, {
      method: "GET",
      signal: controller.signal,
    });
    window.clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

export const smallLabelStyle: CSSProperties = {
  fontSize: "0.8rem",
  color: "var(--muted)",
  marginBottom: 6,
  fontWeight: 600,
};

export const runButtonStyle: CSSProperties = {
  background: "var(--accent)",
  color: "#fff",
  border: "1px solid var(--accent)",
  borderRadius: 4,
  padding: "8px 18px",
  fontSize: "0.9rem",
  fontWeight: 600,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
};

export const secondaryLargeButtonStyle: CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  color: "var(--text)",
  borderRadius: 4,
  padding: "8px 18px",
  fontSize: "0.9rem",
  fontWeight: 600,
  cursor: "pointer",
};

export const secondaryButtonStyle: CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  color: "var(--text)",
  padding: "6px 12px",
  borderRadius: 4,
  fontSize: "0.85rem",
  cursor: "pointer",
};

export const tabButtonStyle = (active: boolean): CSSProperties => ({
  padding: "10px 4px",
  marginRight: 24,
  background: "transparent",
  border: "none",
  borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
  fontSize: "0.95rem",
  fontWeight: active ? 600 : 400,
  color: active ? "var(--accent)" : "var(--muted)",
  cursor: "pointer",
});

export const toolButtonStyle = (active: boolean): CSSProperties => ({
  background: active ? "var(--accentTint)" : "var(--surface)",
  border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
  color: active ? "var(--accent)" : "var(--text)",
  padding: "6px 12px",
  borderRadius: 4,
  fontSize: "0.85rem",
  fontWeight: active ? 600 : 400,
  cursor: "pointer",
});
