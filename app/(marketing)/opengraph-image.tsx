import { ImageResponse } from "next/og";

export const alt = "Dunnit: invoices chased, politely.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Brand colours from docs/spec.md section 6 (hex, since next/og cannot read CSS variables).
const ink = "#14213D";
const paper = "#FBF8F3";
const sand = "#E9E2D3";
const amber = "#F2A33A";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: paper,
          color: ink,
          padding: "72px 88px",
          fontFamily: "serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 34, height: 34, background: amber, transform: "rotate(-4deg)" }} />
          <div style={{ fontSize: 54, fontWeight: 700, letterSpacing: "-0.02em" }}>Dunnit</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 104, lineHeight: 1.02, letterSpacing: "-0.03em", display: "flex", flexWrap: "wrap" }}>
            <span>Invoices chased,&nbsp;</span>
            <span style={{ borderBottom: `10px solid ${amber}` }}>politely.</span>
          </div>
          <div
            style={{
              marginTop: 44,
              paddingTop: 24,
              borderTop: `2px solid ${sand}`,
              fontSize: 28,
              fontFamily: "sans-serif",
              color: ink,
              opacity: 0.75,
            }}
          >
            An accounts-receivable agent for small businesses.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
