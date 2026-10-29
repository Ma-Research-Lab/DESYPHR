"use client";

import Link from "next/link";
import type { Dispatch, SetStateAction } from "react";

import { tabButtonStyle } from "./helpers";
import { Step, StepLine } from "./ui";
import { THEME_OPTIONS } from "./types";
import type { ThemeMode } from "./types";

const navButtonStyle = {
  background: "transparent",
  border: "1px solid rgba(255,255,255,0.28)",
  color: "var(--navText)",
  padding: "6px 12px",
  borderRadius: 4,
  fontSize: "0.85rem",
  cursor: "pointer",
} as const;

export function WorkspaceHeader({
  handleNewJob,
  setThemeMode,
  themeMode,
}: {
  handleNewJob: () => void;
  setThemeMode: Dispatch<SetStateAction<ThemeMode>>;
  themeMode: ThemeMode;
}) {
  return (
    <nav
      className="ws-nav"
      style={{
        background: "var(--navBg)",
        color: "var(--navText)",
        padding: "0 32px",
        minHeight: 56,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      <Link
        href="/"
        className="ws-brand"
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          color: "var(--navText)",
          textDecoration: "none",
        }}
      >
        <span style={{ fontWeight: 700, fontSize: "1.15rem" }}>AFM Analysis</span>
        <span style={{ fontSize: "0.8rem", color: "var(--navMuted)" }}>Ma Research Lab</span>
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.85rem" }}>
          <span className="ws-nav-label" style={{ color: "var(--navMuted)" }}>Theme</span>
          <select
            value={themeMode}
            onChange={(e) => setThemeMode(e.target.value as ThemeMode)}
            style={{
              minWidth: 160,
              padding: "6px 10px",
              borderRadius: 4,
              border: "1px solid rgba(255,255,255,0.28)",
              background: "rgba(255,255,255,0.08)",
              color: "var(--navText)",
              fontSize: "0.85rem",
            }}
          >
            {THEME_OPTIONS.map((option) => (
              <option key={option.value} value={option.value} style={{ color: "#1f2a37" }}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <button type="button" onClick={handleNewJob} style={navButtonStyle}>
          New job
        </button>
      </div>
    </nav>
  );
}

export function WorkspaceStepper({ currentStep }: { currentStep: number }) {
  return (
    <div className="ws-stepper" style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: "12px 28px",
          display: "flex",
          alignItems: "center",
        }}
      >
        <Step
          label="Upload & detect"
          number="01"
          state={currentStep > 1 ? "done" : currentStep === 1 ? "active" : "idle"}
        />
        <StepLine done={currentStep > 1} />
        <Step
          label="Review mask"
          number="02"
          state={currentStep > 2 ? "done" : currentStep === 2 ? "active" : "idle"}
        />
        <StepLine done={currentStep > 2} />
        <Step
          label="Analysis"
          number="03"
          state={currentStep > 3 ? "done" : currentStep === 3 ? "active" : "idle"}
        />
        <StepLine done={currentStep > 3} />
        <Step label="Export" number="04" state={currentStep === 4 ? "active" : "idle"} />
      </div>
    </div>
  );
}

export function WorkspaceStageTabs({
  activeTab,
  setActiveTab,
}: {
  activeTab: "upload" | "results" | "export";
  setActiveTab: Dispatch<SetStateAction<"upload" | "results" | "export">>;
}) {
  return (
    <div
      role="tablist"
      style={{ display: "flex", borderBottom: "1px solid var(--border)", marginBottom: 20 }}
    >
      <button
        role="tab"
        aria-selected={activeTab === "upload"}
        className="ws-tab px-flat"
        onClick={() => setActiveTab("upload")}
        style={tabButtonStyle(activeTab === "upload")}
      >
        Upload & edit
      </button>
      <button
        role="tab"
        aria-selected={activeTab === "results"}
        className="ws-tab px-flat"
        onClick={() => setActiveTab("results")}
        style={tabButtonStyle(activeTab === "results")}
      >
        Results
      </button>
      <button
        role="tab"
        aria-selected={activeTab === "export"}
        className="ws-tab px-flat"
        onClick={() => setActiveTab("export")}
        style={tabButtonStyle(activeTab === "export")}
      >
        Export
      </button>
    </div>
  );
}
