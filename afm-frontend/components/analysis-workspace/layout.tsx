"use client";

import { secondaryButtonStyle } from "./helpers";
import type { ViewerImage } from "./types";

export function GlobalWorkspaceStyles() {
  return (
    <style jsx global>{`
      /* Clean, light data-portal look: grey page, white bordered cards,
         navy top bar, blue accent, sentence-case headings. */
      :root,
      :root[data-theme="light"] {
        --bg: #f3f5f8;
        --surface: #ffffff;
        --surface2: #f7f9fb;
        --border: #dbe1e8;
        --accent: #1a5fb4;
        --accent2: #154c91;
        --accentTint: rgba(26, 95, 180, 0.08);
        --accentTintStrong: rgba(26, 95, 180, 0.14);
        --green: #2e7d32;
        --yellow: #a15c00;
        --text: #1f2a37;
        --muted: #5b6878;
        --imageBg: #0f1720;
        --navBg: #1d2b3a;
        --navText: #ffffff;
        --navMuted: #b8c4d2;
        --shadow: 0 1px 2px rgba(16, 24, 40, 0.06);
        --overlayGrid: rgba(26, 95, 180, 0.05);
        --overlayAxis: rgba(26, 95, 180, 0.12);
      }

      :root[data-theme="dark"] {
        --bg: #111821;
        --surface: #18212c;
        --surface2: #1e2834;
        --border: #2c3846;
        --accent: #5b9bea;
        --accent2: #3d7fd1;
        --accentTint: rgba(91, 155, 234, 0.1);
        --accentTintStrong: rgba(91, 155, 234, 0.18);
        --green: #66bb6a;
        --yellow: #f0b45a;
        --text: #e6ebf1;
        --muted: #9aa7b6;
        --imageBg: #000000;
        --navBg: #0b1118;
        --navText: #ffffff;
        --navMuted: #9aa7b6;
        --shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
        --overlayGrid: rgba(91, 155, 234, 0.05);
        --overlayAxis: rgba(91, 155, 234, 0.12);
      }

      * {
        box-sizing: border-box;
      }

      html, body {
        margin: 0;
        padding: 0;
        background: var(--bg);
        color: var(--text);
        font-family: "Source Sans 3", "Source Sans Pro", Inter, system-ui, -apple-system, "Segoe UI", Roboto,
          "Helvetica Neue", Arial, sans-serif;
        font-size: 14px;
        line-height: 1.5;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }

      /* Sentence case throughout, like a data portal; the components were
         written for an all-caps, letter-spaced look. */
      main * {
        text-transform: none !important;
        letter-spacing: normal !important;
      }

      button,
      input,
      select {
        font: inherit;
      }

      button:focus-visible,
      select:focus-visible,
      input:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }

      select {
        border-radius: 4px !important;
      }

      input[type="checkbox"] {
        accent-color: var(--accent);
      }

      input[type="range"] {
        accent-color: var(--accent) !important;
      }

      a {
        color: var(--accent);
      }

      .file-list-scroll {
        scrollbar-width: thin;
        scrollbar-color: var(--border) transparent;
      }
    `}</style>
  );
}

export function WorkspaceFooter() {
  return (
    <footer
      className="ws-footer"
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
