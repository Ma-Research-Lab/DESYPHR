"use client";

import Link from "next/link";

const pageFont =
  '"Source Sans 3", "Source Sans Pro", Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export default function LandingPage() {
  return (
    <main style={{ minHeight: "100vh", background: "#f3f5f8", color: "#1f2a37", fontFamily: pageFont }}>
      <nav
        style={{
          background: "#1d2b3a",
          color: "#fff",
          padding: "0 32px",
          height: 56,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span style={{ fontWeight: 700, fontSize: "1.15rem" }}>AFM Analysis</span>
        <span style={{ fontSize: "0.8rem", color: "#b8c4d2" }}>Ma Research Lab</span>
      </nav>

      <section style={{ maxWidth: 880, margin: "0 auto", padding: "72px 24px 48px" }}>
        <h1 style={{ margin: 0, fontSize: "clamp(2rem, 5vw, 2.8rem)", fontWeight: 700, lineHeight: 1.15 }}>
          AFM Analysis Platform
        </h1>
        <p style={{ margin: "14px 0 0", maxWidth: 620, color: "#5b6878", fontSize: "1.1rem", lineHeight: 1.6 }}>
          Upload AFM images, review segmentation, run morphology-specific analysis, and export
          results from one workspace.
        </p>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 28 }}>
          <Link
            href="/analysis"
            style={{
              padding: "10px 20px",
              borderRadius: 4,
              background: "#1a5fb4",
              color: "#fff",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Open analysis workspace
          </Link>
          <a
            href="https://www.maresearchlab.com/"
            target="_blank"
            rel="noreferrer"
            style={{
              padding: "10px 20px",
              borderRadius: 4,
              border: "1px solid #dbe1e8",
              background: "#fff",
              color: "#1f2a37",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Ma Research Lab
          </a>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
            marginTop: 48,
          }}
        >
          {[
            ["Classify", "CNN morphology classification: dots, lines, mixed or irregular."],
            ["Segment", "U-Net masks with per-image preprocessing and a mask editor."],
            ["Measure", "Domain spacing and grain area, with CSV and PDF export."],
          ].map(([title, body]) => (
            <div
              key={title}
              style={{
                background: "#fff",
                border: "1px solid #dbe1e8",
                borderRadius: 6,
                padding: "16px 18px",
                boxShadow: "0 1px 2px rgba(16,24,40,0.06)",
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
              <div style={{ color: "#5b6878", fontSize: "0.92rem", lineHeight: 1.5 }}>{body}</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
