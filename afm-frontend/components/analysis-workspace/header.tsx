"use client";

import type { Dispatch, SetStateAction } from "react";

import { modelLabel, modelMeta, tabButtonStyle } from "./helpers";
import { Step, StepLine } from "./ui";
import type { ModelListItem, ThemeMode } from "./types";

export function WorkspaceHeader({
  activeModel,
  activeModelItem,
  handleNewJob,
  handleSwitchModel,
  isSwitchingModel,
  models,
  setThemeMode,
  themeMode,
}: {
  activeModel: string;
  activeModelItem: ModelListItem | null;
  handleNewJob: () => void;
  handleSwitchModel: (filename: string) => Promise<void>;
  isSwitchingModel: boolean;
  models: ModelListItem[];
  setThemeMode: Dispatch<SetStateAction<ThemeMode>>;
  themeMode: ThemeMode;
}) {
  return (
    <nav
      style={{
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
        padding: "0 32px",
        height: 52,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "var(--accent)",
            boxShadow: "0 0 12px rgba(0,212,255,0.7)",
          }}
        />
        <div style={{ fontWeight: 800, letterSpacing: "0.05em", fontSize: "1.1rem" }}>
          AFM Analysis
        </div>
        <span
          style={{
            fontSize: "0.62rem",
            color: "var(--muted)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            alignSelf: "flex-end",
            marginBottom: 2,
          }}
        >
          {/* // nanoscale imaging */}
        </span>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          justifyContent: "flex-end",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            border: "1px solid var(--border)",
            background: "var(--surface2)",
            color: "var(--text)",
            borderRadius: 6,
            padding: "5px 10px",
            minWidth: 280,
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: "0.64rem",
                color: "var(--muted)",
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                marginBottom: 2,
              }}
            >
              U-Net Model
            </div>
            <div
              style={{
                fontSize: "0.74rem",
                fontWeight: 700,
                color: "var(--text)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: 220,
              }}
              title={activeModel ? modelLabel(activeModel) : "No model selected"}
            >
              {activeModel ? modelLabel(activeModel) : "No model selected"}
            </div>
            {activeModelItem ? (
              <div style={{ fontSize: "0.63rem", color: "var(--muted)", marginTop: 2 }}>
                {modelMeta(activeModelItem)}
              </div>
            ) : null}
          </div>

          <select
            value={activeModel}
            onChange={(e) => void handleSwitchModel(e.target.value)}
            disabled={isSwitchingModel || !models.length}
            style={{
              minWidth: 180,
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--text)",
              fontSize: "0.72rem",
              fontWeight: 700,
              outline: "none",
            }}
          >
            <option value="">{models.length ? "Select model" : "No models available"}</option>
            {models.map((model) => (
              <option key={model.filename} value={model.filename}>
                {modelLabel(model.filename)}
                {model.is_active ? " (active)" : ""}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={() => setThemeMode((prev) => (prev === "dark" ? "light" : "dark"))}
          style={{
            background: "transparent",
            border: "1px solid var(--border)",
            color: "var(--text)",
            padding: "5px 12px",
            borderRadius: 4,
            fontSize: "0.73rem",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          {themeMode === "dark" ? "☼ Light Mode" : "◐ Dark Mode"}
        </button>
        <span
          style={{
            fontSize: "0.68rem",
            color: "var(--muted)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--green)",
              boxShadow: "0 0 10px rgba(0,255,157,0.8)",
              display: "inline-block",
            }}
          />
          Online
        </span>

        <button
          onClick={handleNewJob}
          style={{
            background: "transparent",
            border: "1px solid var(--border)",
            color: "var(--muted)",
            padding: "5px 12px",
            borderRadius: 4,
            fontSize: "0.73rem",
            cursor: "pointer",
          }}
        >
          ⟳ New Job
        </button>
      </div>
    </nav>
  );
}

export function WorkspaceStepper({ currentStep }: { currentStep: number }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
        padding: "10px 32px",
        display: "flex",
        alignItems: "center",
      }}
    >
      <Step
        label="Upload & Detect"
        number="01"
        state={currentStep > 1 ? "done" : currentStep === 1 ? "active" : "idle"}
      />
      <StepLine done={currentStep > 1} />
      <Step
        label="Review Mask"
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
    <div style={{ display: "flex", gap: 6, marginBottom: 22 }}>
      <button onClick={() => setActiveTab("upload")} style={tabButtonStyle(activeTab === "upload")}>
        ▶ Stage: Upload & Edit
      </button>
      <button onClick={() => setActiveTab("results")} style={tabButtonStyle(activeTab === "results")}>
        ▶ Stage: Results
      </button>
      <button onClick={() => setActiveTab("export")} style={tabButtonStyle(activeTab === "export")}>
        ▶ Stage: Export
      </button>
    </div>
  );
}
