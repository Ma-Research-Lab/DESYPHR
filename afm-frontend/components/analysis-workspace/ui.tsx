import type { CSSProperties, ReactNode } from "react";

import { secondaryButtonStyle, smallLabelStyle } from "./helpers";
import type { ViewerImage } from "./types";

export function Panel({
  title,
  children,
  style,
  accentColor,
}: {
  title: string;
  children: ReactNode;
  style?: CSSProperties;
  accentColor?: string;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        position: "relative",
        overflow: "hidden",
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: accentColor
            ? accentColor
            : "linear-gradient(90deg, var(--accent), var(--accent2))",
          opacity: 0.6,
        }}
      />
      <div
        style={{
          padding: "12px 18px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "var(--surface2)",
        }}
      >
        <div
          style={{
            width: 6,
            height: 6,
            background: accentColor || "var(--accent)",
            borderRadius: "50%",
          }}
        />
        <span
          style={{
            fontSize: "0.78rem",
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: accentColor || "var(--accent)",
          }}
        >
          {title}
        </span>
      </div>

      <div style={{ padding: 18 }}>{children}</div>
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
  const color =
    state === "done"
      ? "var(--green)"
      : state === "active"
      ? "var(--accent)"
      : "var(--muted)";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: "0.72rem",
        fontWeight: 500,
        color,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
      }}
    >
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: 4,
          border: "1px solid currentColor",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "0.68rem",
          fontWeight: 700,
          flexShrink: 0,
          background:
            state === "active"
              ? "rgba(0,212,255,0.1)"
              : state === "done"
              ? "rgba(0,255,157,0.1)"
              : "transparent",
          boxShadow: state === "active" ? "0 0 8px rgba(0,212,255,0.4)" : "none",
        }}
      >
        {state === "done" ? "✓" : number}
      </div>
      {label}
    </div>
  );
}

export function StepLine({ done }: { done: boolean }) {
  return (
    <div
      style={{
        flex: 1,
        height: 1,
        background: done ? "var(--green)" : "var(--border)",
        margin: "0 14px",
        minWidth: 30,
        position: "relative",
      }}
    >
      <span
        style={{
          position: "absolute",
          right: -5,
          top: -7,
          fontSize: "0.55rem",
          color: done ? "var(--green)" : "var(--border)",
        }}
      >
        ▶
      </span>
    </div>
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
          fontSize: "0.65rem",
          padding: "4px 10px",
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
        background: "var(--surface2)",
      }}
    >
      <div
        style={{
          fontSize: "0.64rem",
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: "0.86rem", color: "var(--accent)", fontWeight: 700 }}>
        {value}
      </div>
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
        <span style={{ minWidth: 44, color: "var(--yellow)", fontWeight: 700 }}>
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
      ? "rgba(0,255,157,0.05)"
      : "rgba(0,212,255,0.05)"
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
