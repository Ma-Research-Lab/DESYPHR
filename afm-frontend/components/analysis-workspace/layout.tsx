"use client";

import { secondaryButtonStyle } from "./helpers";
import type { ViewerImage } from "./types";

export function GlobalWorkspaceStyles() {
  return (
    <style jsx global>{`
      :root {
        --bg: #0a0e17;
        --surface: #111827;
        --surface2: #1a2236;
        --border: #1e2d45;
        --accent: #00d4ff;
        --accent2: #7c3aed;
        --green: #00ff9d;
        --yellow: #ffd60a;
        --text: #f4f7fb;
        --muted: #93a9c3;
        --imageBg: #000;
        --overlayGrid: rgba(0, 212, 255, 0.04);
        --overlayAxis: rgba(0, 212, 255, 0.1);
        --bodyScanline: rgba(0, 0, 0, 0.04);
      }

      :root[data-theme="light"] {
        --bg: #f4f7fb;
        --surface: #ffffff;
        --surface2: #edf3fb;
        --border: #c4d2e5;
        --accent: #005fcc;
        --accent2: #0087a8;
        --green: #0a8f57;
        --yellow: #9b6b00;
        --text: #09111f;
        --muted: #44566f;
        --imageBg: #dfe8f3;
        --overlayGrid: rgba(0, 95, 204, 0.06);
        --overlayAxis: rgba(0, 95, 204, 0.12);
        --bodyScanline: rgba(255, 255, 255, 0.02);
      }

      * {
        box-sizing: border-box;
      }

      html, body {
        margin: 0;
        padding: 0;
        background: var(--bg);
        color: var(--text);
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }

      body::before {
        content: "";
        position: fixed;
        inset: 0;
        z-index: 9999;
        pointer-events: none;
        background: repeating-linear-gradient(
          0deg,
          transparent,
          transparent 2px,
          rgba(0, 0, 0, 0.04) 2px,
          var(--bodyScanline) 4px
        );
      }

      button,
      input,
      select {
        font: inherit;
      }

      .file-list-scroll {
        scrollbar-width: thin;
        scrollbar-color: rgba(0, 212, 255, 0.55) var(--surface2);
      }

      .file-list-scroll::-webkit-scrollbar {
        width: 10px;
      }

      .file-list-scroll::-webkit-scrollbar-track {
        background: var(--surface2);
        border-left: 1px solid var(--border);
      }

      .file-list-scroll::-webkit-scrollbar-thumb {
        background: linear-gradient(var(--accent), var(--accent2));
        border-radius: 999px;
        border: 2px solid var(--surface2);
      }
    `}</style>
  );
}

export function WorkspaceFooter() {
  return (
    <footer
      style={{
        maxWidth: 1280,
        margin: "0 auto",
        padding: "0 28px 28px",
        color: "var(--muted)",
        fontSize: "0.72rem",
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <span>Copyright 2026 Ma Research Lab</span>
      <a
        href="https://www.maresearchlab.com/"
        target="_blank"
        rel="noreferrer"
        style={{ color: "var(--accent)", textDecoration: "none" }}
      >
        www.maresearchlab.com
      </a>
    </footer>
  );
}

export function ImageViewerModal({
  viewerImage,
  onClose,
}: {
  viewerImage: ViewerImage | null;
  onClose: () => void;
}) {
  if (!viewerImage) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 500,
        background: "rgba(4, 10, 18, 0.82)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(1100px, 100%)",
          maxHeight: "calc(100vh - 48px)",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          overflow: "hidden",
          boxShadow: "0 24px 80px rgba(0, 0, 0, 0.45)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "12px 16px",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface2)",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: "0.72rem",
                color: "var(--muted)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {viewerImage.label}
            </div>
            <div
              style={{
                fontSize: "0.92rem",
                color: "var(--text)",
                fontWeight: 700,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {viewerImage.caption}
            </div>
          </div>
          <button onClick={onClose} style={secondaryButtonStyle}>
            Close
          </button>
        </div>

        <div
          style={{
            padding: 16,
            background: "var(--imageBg)",
            maxHeight: "calc(100vh - 130px)",
            overflow: "auto",
          }}
        >
          <img
            src={viewerImage.src}
            alt={viewerImage.caption}
            style={{
              display: "block",
              width: "100%",
              height: "auto",
              objectFit: "contain",
              background: "var(--imageBg)",
            }}
          />
        </div>
      </div>
    </div>
  );
}
