"use client";

import Link from "next/link";

export default function LandingPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "32px 20px",
        color: "#e8f0ff",
        background:
          "radial-gradient(circle at top left, rgba(0, 212, 255, 0.12), transparent 28%), linear-gradient(180deg, #07111f 0%, #091728 45%, #08111d 100%)",
      }}
    >
      <section
        style={{
          width: "min(720px, 100%)",
          padding: "36px 32px",
          borderRadius: 24,
          border: "1px solid rgba(138,203,255,0.14)",
          background: "rgba(9, 20, 34, 0.9)",
          boxShadow: "0 24px 64px rgba(0, 0, 0, 0.28)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: "0.78rem",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "#8acbff",
            marginBottom: 14,
          }}
        >
          Ma Research Lab
        </div>

        <h1
          style={{
            margin: 0,
            fontSize: "clamp(2.3rem, 6vw, 4rem)",
            lineHeight: 0.98,
            letterSpacing: "-0.05em",
          }}
        >
          AFM Analysis Platform
        </h1>

        <p
          style={{
            margin: "18px auto 0",
            maxWidth: 560,
            color: "rgba(232,240,255,0.74)",
            fontSize: "1rem",
            lineHeight: 1.75,
          }}
        >
          Upload AFM images, review segmentation, run morphology-specific analysis,
          and export results from one workspace.
        </p>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 12,
            flexWrap: "wrap",
            marginTop: 28,
          }}
        >
          <Link
            href="/analysis"
            style={{
              padding: "13px 20px",
              borderRadius: 999,
              background: "linear-gradient(135deg, #00c8ff 0%, #2f7cff 100%)",
              color: "#04101d",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Open Analysis Workspace
          </Link>

          <a
            href="https://www.maresearchlab.com/"
            target="_blank"
            rel="noreferrer"
            style={{
              padding: "13px 20px",
              borderRadius: 999,
              border: "1px solid rgba(138,203,255,0.22)",
              color: "#d9ebff",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Ma Research Lab
          </a>
        </div>
      </section>
    </main>
  );
}
