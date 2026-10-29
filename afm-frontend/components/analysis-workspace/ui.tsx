import type { CSSProperties, ReactNode } from "react";

import { secondaryButtonStyle, smallLabelStyle } from "./helpers";
import type { ViewerImage } from "./types";

export function Panel({
  title,
  children,
  style,
}: {
  title: string;
  children: ReactNode;
  style?: CSSProperties;
  accentColor?: string;
}) {
  return (
    <section
      className="ws-panel"
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
          padding: "12px 18px",
          borderBottom: "1px solid var(--border)",
          fontSize: "1rem",
          fontWeight: 600,
          color: "var(--text)",
        }}
      >
        {title}
      </h2>
      <div style={{ padding: 18 }}>{children}</div>
    </section>
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

export function CompactMetric({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 6,
        padding: "10px 12px",
        background: "var(--surface)",
      }}
    >
      <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: "1.05rem", color: "var(--text)", fontWeight: 600 }}>{value}</div>
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
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
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
          {Number.isInteger(value) ? value : value.toFixed(step < 0.1 ? 3 : 1)}
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
