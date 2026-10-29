"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";

import { THEME_OPTIONS } from "./types";
import type { ThemeMode, WorkspaceStep } from "./types";

export type WizardTabState = "active" | "done" | "ready" | "locked";

export const WIZARD_STEPS: { id: WorkspaceStep; title: string; short: string; hint: string }[] = [
  { id: "upload", title: "Upload images", short: "Upload", hint: "Add one or more AFM scans, then upload them for detection." },
  {
    id: "review",
    title: "Review detection",
    short: "Review",
    hint: "Confirm the morphology for each image, tune its segmentation or binarization, and correct the mask.",
  },
  { id: "results", title: "Results", short: "Results", hint: "Inspect metrics and output images, and fine-tune the analysis." },
  { id: "export", title: "Export", short: "Export", hint: "Download PDF reports and the results table." },
];

const sideButtonStyle = {
  background: "transparent",
  border: "1px solid rgba(255,255,255,0.28)",
  color: "var(--navText)",
  padding: "7px 12px",
  borderRadius: 4,
  fontSize: "0.8rem",
  cursor: "pointer",
} as const;

const themeSelectStyle = {
  width: "100%",
  padding: "6px 10px",
  borderRadius: 4,
  border: "1px solid rgba(255,255,255,0.28)",
  background: "rgba(255,255,255,0.08)",
  color: "var(--navText)",
  fontSize: "0.8rem",
} as const;

function ThemeSelect({
  themeMode,
  setThemeMode,
}: {
  themeMode: ThemeMode;
  setThemeMode: Dispatch<SetStateAction<ThemeMode>>;
}) {
  return (
    <select
      aria-label="Theme"
      value={themeMode}
      onChange={(e) => setThemeMode(e.target.value as ThemeMode)}
      style={themeSelectStyle}
    >
      {THEME_OPTIONS.map((option) => (
        <option key={option.value} value={option.value} style={{ color: "#1f2a37" }}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

// Step menu on the left: brand, the four steps, then theme and new job at the foot.
export function WizardSidebar({
  activeStep,
  stateOf,
  detailOf,
  onSelect,
  themeMode,
  setThemeMode,
  handleNewJob,
}: {
  activeStep: WorkspaceStep;
  stateOf: (index: number) => WizardTabState;
  detailOf: (step: WorkspaceStep, state: WizardTabState) => string;
  onSelect: (step: WorkspaceStep) => void;
  themeMode: ThemeMode;
  setThemeMode: Dispatch<SetStateAction<ThemeMode>>;
  handleNewJob: () => void;
}) {
  return (
    <aside className="wiz-side ws-nav">
      <div className="wiz-brand ws-brand">
        <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
          <span style={{ fontWeight: 700, fontSize: "1.1rem", whiteSpace: "nowrap" }}>AFM Analysis</span>
          <span style={{ fontSize: "0.76rem", color: "var(--navMuted)" }}>Ma Research Lab</span>
        </div>
        <div className="wiz-compact-tools">
          <ThemeSelect themeMode={themeMode} setThemeMode={setThemeMode} />
          <button type="button" onClick={handleNewJob} style={sideButtonStyle} aria-label="New job">
            ⟳
          </button>
        </div>
      </div>

      <nav className="wiz-menu" aria-label="Analysis steps">
        {WIZARD_STEPS.map((step, index) => {
          const state = stateOf(index);
          const detail = detailOf(step.id, state);
          return (
            <button
              key={step.id}
              type="button"
              className="wiz-tab px-flat"
              data-state={state}
              onClick={() => onSelect(step.id)}
              disabled={state === "locked"}
              aria-current={step.id === activeStep ? "step" : undefined}
            >
              <span className={`wiz-tab-node ws-step-dot${state === "done" ? " ws-step-done" : ""}`}>
                {state === "done" ? "✓" : index + 1}
              </span>
              <span style={{ minWidth: 0 }}>
                <span className="wiz-tab-title">{step.short}</span>
                <span className="wiz-tab-detail" title={detail}>
                  {detail}
                </span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="wiz-side-foot">
        <label style={{ display: "grid", gap: 6 }}>
          <span className="ws-nav-label" style={{ fontSize: "0.72rem", color: "var(--navMuted)" }}>
            Theme
          </span>
          <ThemeSelect themeMode={themeMode} setThemeMode={setThemeMode} />
        </label>
        <button type="button" onClick={handleNewJob} style={sideButtonStyle}>
          ⟳ New job
        </button>
        <div className="wiz-copy">
          <span>Copyright 2026 Ma Research Lab</span>
          <a href="https://www.maresearchlab.com/" target="_blank" rel="noreferrer">
            www.maresearchlab.com
          </a>
        </div>
      </div>
    </aside>
  );
}

export function WizardHead({ index, total, title, hint }: { index: number; total: number; title: string; hint: string }) {
  return (
    <header className="wiz-head">
      <div className="wiz-head-count">
        Step {index + 1} of {total}
      </div>
      <h1 className="wiz-head-title">{title}</h1>
      <p className="wiz-head-hint">{hint}</p>
    </header>
  );
}

// Bottom bar: Back on the left, live status in the middle, the step's main action on the right.
export function WizardBar({
  onBack,
  backDisabled,
  status,
  isBusy,
  children,
}: {
  onBack: () => void;
  backDisabled: boolean;
  status: string;
  isBusy: boolean;
  children: ReactNode;
}) {
  return (
    <footer className="wiz-bar">
      <button
        type="button"
        onClick={onBack}
        disabled={backDisabled}
        style={{
          border: "1px solid var(--border)",
          background: "var(--surface)",
          color: "var(--text)",
          borderRadius: 4,
          padding: "11px 18px",
          fontSize: "0.82rem",
          fontWeight: 600,
          cursor: backDisabled ? "not-allowed" : "pointer",
          opacity: backDisabled ? 0.45 : 1,
        }}
      >
        ← Back
      </button>
      <div className="wiz-status" role="status">
        <span className={isBusy ? "wiz-pulse" : undefined} style={{ color: isBusy ? "var(--yellow)" : "var(--accent)" }}>
          ●
        </span>
        <span>{status}</span>
      </div>
      {children}
    </footer>
  );
}

// Fixed full-screen frame: step menu on the left, one step on the right. Below 900px the
// menu becomes a row of tabs across the top.
export function WizardStyles() {
  return (
    <style jsx global>{`
      .wiz-root {
        --wiz-pad: clamp(12px, 3vw, 32px);
        --wiz-side-w: clamp(230px, 18vw, 290px);
        height: 100vh;
        height: 100dvh;
        display: grid;
        grid-template-columns: var(--wiz-side-w) minmax(0, 1fr);
        overflow: hidden;
      }

      /* ---------- left menu ---------- */

      .wiz-side {
        display: flex;
        flex-direction: column;
        gap: 22px;
        padding: 20px 14px;
        background: var(--navBg);
        color: var(--navText);
        overflow-y: auto;
        min-height: 0;
      }

      .wiz-brand {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 0 6px;
      }

      .wiz-compact-tools {
        display: none;
        gap: 6px;
        align-items: center;
      }

      .wiz-menu {
        display: grid;
        gap: 6px;
      }

      .wiz-tab {
        display: grid;
        grid-template-columns: 32px minmax(0, 1fr);
        align-items: center;
        column-gap: 12px;
        width: 100%;
        padding: 10px;
        border-radius: 6px;
        border: 1px solid transparent;
        background: transparent;
        color: var(--navText);
        text-align: left;
        cursor: pointer;
        transition: background 140ms ease, border-color 140ms ease;
      }

      .wiz-tab:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.08);
      }

      .wiz-tab:disabled {
        cursor: not-allowed;
        opacity: 0.5;
      }

      .wiz-tab[aria-current="step"] {
        background: rgba(255, 255, 255, 0.12);
        border-color: rgba(255, 255, 255, 0.32);
      }

      .wiz-tab-node {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 800;
        font-size: 0.78rem;
        border: 2px solid rgba(255, 255, 255, 0.45);
        color: var(--navText);
      }

      .wiz-tab[aria-current="step"] .wiz-tab-node {
        background: var(--accent);
        border-color: var(--accent);
        color: #fff;
      }

      .wiz-tab[data-state="done"] .wiz-tab-node {
        background: var(--green);
        border-color: var(--green);
        color: #fff;
      }

      .wiz-tab-title {
        display: block;
        font-weight: 700;
        font-size: 0.86rem;
      }

      .wiz-tab-detail {
        display: block;
        font-size: 0.7rem;
        color: var(--navMuted);
        margin-top: 3px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .wiz-side-foot {
        margin-top: auto;
        display: grid;
        gap: 10px;
      }

      .wiz-copy {
        display: grid;
        gap: 2px;
        padding: 4px 2px 0;
        font-size: 0.66rem;
        color: var(--navMuted);
      }

      .wiz-copy a {
        color: var(--navText);
        text-decoration: none;
      }

      /* ---------- right: one step ---------- */

      .wiz-main {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr) auto;
        min-width: 0;
        min-height: 0;
      }

      .wiz-head {
        padding: 16px var(--wiz-pad) 14px;
        border-bottom: 1px solid var(--border);
        background: var(--surface);
      }

      .wiz-head-count {
        font-size: 0.68rem;
        color: var(--muted);
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }

      .wiz-head-title {
        margin: 4px 0 0;
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--text);
      }

      .wiz-head-hint {
        margin: 4px 0 0;
        font-size: 0.78rem;
        color: var(--muted);
      }

      .wiz-body {
        overflow-y: auto;
        min-height: 0;
        padding: 22px var(--wiz-pad);
      }

      .wiz-body-inner {
        max-width: 1400px;
        margin: 0 auto;
      }

      .wiz-bar {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px var(--wiz-pad);
        border-top: 1px solid var(--border);
        background: var(--surface);
      }

      .wiz-status {
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.76rem;
        color: var(--muted);
      }

      .wiz-status > span:last-child {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      @keyframes wiz-pulse {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.25;
        }
      }

      .wiz-pulse {
        animation: wiz-pulse 1s ease-in-out infinite;
      }

      /* Review step: settings on the left, mask and editor on the right; one column when narrow. */
      .wiz-review {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1.35fr);
        gap: 18px;
        align-items: start;
      }

      @media (max-width: 1180px) {
        .wiz-review {
          grid-template-columns: minmax(0, 1fr);
        }
      }

      /* ---------- tablets and phones: menu becomes top tabs ---------- */

      @media (max-width: 900px) {
        .wiz-root {
          grid-template-columns: minmax(0, 1fr);
          grid-template-rows: auto minmax(0, 1fr);
        }

        .wiz-side {
          gap: 10px;
          padding: 10px var(--wiz-pad);
          overflow: visible;
        }

        .wiz-brand {
          padding: 0;
        }

        .wiz-compact-tools {
          display: flex;
        }

        .wiz-compact-tools select {
          width: auto;
        }

        .wiz-menu {
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 4px;
        }

        .wiz-tab {
          grid-template-columns: minmax(0, 1fr);
          justify-items: center;
          row-gap: 4px;
          padding: 6px 4px;
          text-align: center;
        }

        .wiz-tab-node {
          width: 26px;
          height: 26px;
          font-size: 0.7rem;
        }

        .wiz-tab-detail,
        .wiz-side-foot {
          display: none;
        }

        .wiz-head {
          padding: 12px var(--wiz-pad) 10px;
        }
      }

      @media (max-width: 640px) {
        .wiz-bar {
          flex-wrap: wrap;
          gap: 8px;
        }

        .wiz-status {
          order: -1;
          flex-basis: 100%;
        }

        .wiz-bar > button:last-child {
          flex: 1;
        }
      }
    `}</style>
  );
}
