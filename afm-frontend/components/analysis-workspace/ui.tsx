import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import { secondaryButtonStyle, smallLabelStyle } from "./helpers";
import type { ViewerImage } from "./types";

// Single-window layout applies at or above this size; smaller screens scroll.
export const FIT_QUERY = "(min-width: 1100px) and (min-height: 620px)";

export function Panel({
  title,
  children,
  style,
  bodyStyle,
  fill = false,
  cap = false,
  aside,
}: {
  title: string;
  children: ReactNode;
  style?: CSSProperties;
  bodyStyle?: CSSProperties;
  accentColor?: string;
  // Fill the space the column gives it; the body scrolls only if it must.
  fill?: boolean;
  // In a column: take only the height its content needs, up to a share of it.
  cap?: boolean;
  aside?: ReactNode;
}) {
  return (
    <section
      className={`ws-panel${fill ? " wiz-panel-fill" : ""}${cap ? " wiz-panel-cap" : ""}`}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        boxShadow: "var(--shadow)",
        ...style,
      }}
    >
      <h2
        className="ws-panel-title"
        style={{
          margin: 0,
          padding: "8px 14px",
          borderBottom: "1px solid var(--border)",
          fontSize: "0.92rem",
          fontWeight: 600,
          color: "var(--text)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <span>{title}</span>
        {aside}
      </h2>
      <div className="wiz-panel-body" style={{ padding: 12, ...bodyStyle }}>
        {children}
      </div>
    </section>
  );
}

// Lays out `count` square tiles (each with a one-line label) at the largest size
// that fits the box, choosing the column count to match. Below FIT_QUERY the box
// has no fixed height, so tiles just fill the width.
export function FitGrid({
  count,
  children,
  gap = 10,
  labelHeight = 22,
}: {
  count: number;
  children: ReactNode;
  gap?: number;
  labelHeight?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ cols: 1, tile: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !count) return;
    const measure = () => {
      const width = el.clientWidth;
      const fit = window.matchMedia(FIT_QUERY).matches;
      const height = fit ? el.clientHeight : Infinity;
      let best = { cols: 1, tile: 0 };
      for (let cols = 1; cols <= count; cols++) {
        const rows = Math.ceil(count / cols);
        const byWidth = (width - gap * (cols - 1)) / cols;
        const byHeight = (height - gap * (rows - 1)) / rows - labelHeight;
        const tile = Math.floor(Math.min(byWidth, byHeight, fit ? Infinity : 320));
        if (tile > best.tile) best = { cols, tile };
      }
      setLayout((prev) => (prev.cols === best.cols && prev.tile === best.tile ? prev : best));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [count, gap, labelHeight]);

  return (
    <div ref={ref} className="wiz-fit-grid">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${layout.cols}, ${layout.tile}px)`,
          gridAutoRows: `${layout.tile + labelHeight}px`,
          gap,
          justifyContent: "center",
          alignContent: "center",
          height: "100%",
          visibility: layout.tile ? "visible" : "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// Grid tile: label above a square image; click to open the full-size viewer.
export function FitTile({
  label,
  src,
  caption,
  onOpen,
}: {
  label: string;
  src: string;
  caption: string;
  onOpen: (image: ViewerImage) => void;
}) {
  const safeSrc = src?.trim();
  return (
    <div
      title={caption}
      onClick={() => safeSrc && onOpen({ src: safeSrc, caption, label })}
      style={{ display: "grid", gridTemplateRows: "22px minmax(0, 1fr)", minWidth: 0, cursor: safeSrc ? "zoom-in" : "default" }}
    >
      <div
        style={{
          ...smallLabelStyle,
          margin: 0,
          lineHeight: "22px",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {label}
      </div>
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 4,
          overflow: "hidden",
          background: "#000",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {safeSrc ? (
          <img src={safeSrc} alt={label} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
        ) : (
          <span style={{ color: "var(--muted)", fontSize: "0.72rem" }}>No preview</span>
        )}
      </div>
    </div>
  );
}

// An image that fills whatever box its parent gives it.
export function FillImage({ src, alt }: { src: string; alt: string }) {
  const safeSrc = src?.trim();
  return (
    <div
      className="wiz-fill-image"
      style={{
        border: "1px solid var(--border)",
        borderRadius: 4,
        overflow: "hidden",
        background: "#000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {safeSrc ? (
        <img src={safeSrc} alt={alt} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
      ) : (
        <span style={{ color: "var(--muted)", fontSize: "0.72rem" }}>No image loaded</span>
      )}
    </div>
  );
}

export function Step({
  label,
  number,
  state,
}: {
  label: string;
  number: string;
  state: "done" | "active" | "idle";
}) {
  const active = state === "active";
  const done = state === "done";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: "0.86rem",
        fontWeight: active ? 600 : 400,
        color: active || done ? "var(--text)" : "var(--muted)",
        whiteSpace: "nowrap",
      }}
    >
      <div
        className={`ws-step-dot${done ? " ws-step-done" : ""}`}
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "0.75rem",
          fontWeight: 600,
          flexShrink: 0,
          color: active || done ? "#fff" : "var(--muted)",
          background: done ? "var(--green)" : active ? "var(--accent)" : "transparent",
          border: active || done ? "none" : "1px solid var(--border)",
        }}
      >
        {done ? "✓" : Number(number)}
      </div>
      {label}
    </div>
  );
}

export function StepLine({ done }: { done: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`ws-step-line${done ? " ws-step-line-done" : ""}`}
      style={{
        flex: 1,
        height: 1,
        background: done ? "var(--green)" : "var(--border)",
        margin: "0 14px",
        minWidth: 24,
      }}
    />
  );
}

export function ImageFrame({
  src,
  caption,
  height = 190,
}: {
  src: string;
  caption: string;
  height?: number;
}) {
  const safeSrc = src?.trim();

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 4,
        overflow: "hidden",
        background: "#000",
      }}
    >
      <div
        style={{
          width: "100%",
          minHeight: height,
          background: "#000",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {safeSrc ? (
          <img
            src={safeSrc}
            alt={caption}
            style={{
              width: "100%",
              height,
              objectFit: "contain",
              display: "block",
              background: "#000",
            }}
          />
        ) : (
          <div style={{ color: "var(--muted)", fontSize: "0.72rem" }}>
            No preview available
          </div>
        )}
      </div>
      <div
        style={{
          fontSize: "0.75rem",
          padding: "5px 10px",
          background: "var(--surface2)",
          borderTop: "1px solid var(--border)",
          color: "var(--muted)",
        }}
      >
        {caption}
      </div>
    </div>
  );
}

export function ResultsImage({
  label,
  src,
  caption,
  onOpen,
}: {
  label: string;
  src: string;
  caption: string;
  onOpen: (image: ViewerImage) => void;
}) {
  const safeSrc = src?.trim();

  return (
    <div
      style={{ cursor: safeSrc ? "zoom-in" : "default" }}
      onClick={() => {
        if (!safeSrc) return;
        onOpen({ src: safeSrc, caption, label });
      }}
    >
      <div style={smallLabelStyle}>{label}</div>
      <ImageFrame src={src} caption={caption} height={160} />
    </div>
  );
}

export function CompactMetric({ label, value, dense = false }: { label: string; value: string; dense?: boolean }) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 6,
        padding: dense ? "6px 10px" : "10px 12px",
        background: "var(--surface)",
        minWidth: 0,
      }}
    >
      <div
        title={label}
        style={{
          fontSize: dense ? "0.7rem" : "0.78rem",
          color: "var(--muted)",
          marginBottom: 2,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: dense ? "0.9rem" : "1.05rem", color: "var(--text)", fontWeight: 600 }}>{value}</div>
    </div>
  );
}

export function SliderRow({
  label,
  min,
  max,
  step,
  value,
  onChange,
  compact = false,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  // Label, slider and value on one line.
  compact?: boolean;
}) {
  const valueText = Number.isInteger(value) ? value : value.toFixed(step < 0.1 ? 3 : 1);
  if (compact) {
    return (
      <label style={{ display: "grid", gridTemplateColumns: "minmax(0, 0.9fr) minmax(0, 1fr) 40px", alignItems: "center", gap: 8 }}>
        <span title={label} style={{ fontSize: "0.72rem", color: "var(--muted)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {label}
        </span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ width: "100%", minWidth: 0, accentColor: "var(--accent)" }}
        />
        <span style={{ fontSize: "0.74rem", color: "var(--text)", fontWeight: 600, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
          {valueText}
        </span>
      </label>
    );
  }
  return (
    <div>
      <div style={smallLabelStyle}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ flex: 1, accentColor: "var(--accent)" }}
        />
        <span style={{ minWidth: 44, color: "var(--text)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
          {valueText}
        </span>
      </div>
    </div>
  );
}

export function RadioOption({
  active,
  accent,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  accent: "green" | "accent";
  onClick: () => void;
  label: string;
  icon: string;
}) {
  const borderColor = active
    ? accent === "green"
      ? "var(--green)"
      : "var(--accent)"
    : "var(--border)";

  const color = active
    ? accent === "green"
      ? "var(--green)"
      : "var(--accent)"
    : "var(--text)";

  const background = active
    ? accent === "green"
      ? "rgba(46,125,50,0.07)"
      : "var(--accentTint)"
    : "var(--surface2)";

  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        borderRadius: 4,
        border: `1px solid ${borderColor}`,
        background,
        marginBottom: 8,
        cursor: "pointer",
        fontSize: "0.8rem",
        color,
      }}
    >
      <span>{icon}</span>
      {label}
    </div>
  );
}

export { secondaryButtonStyle };
