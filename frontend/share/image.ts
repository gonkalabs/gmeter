import { createElement as h } from "react";
import { ImageResponse } from "@vercel/og";
import type { ShareCard } from "./preview";

let fontRegular: ArrayBuffer | null = null;
let fontBold: ArrayBuffer | null = null;

export async function shareImage(card: ShareCard) {
  const fonts = await loadFonts();
  return new ImageResponse(cardElement(card), {
    width: 1200,
    height: 630,
    fonts,
    headers: {
      "cache-control": "public, max-age=600",
    },
  });
}

function cardElement(card: ShareCard) {
  const stats = card.stats.slice(0, 4);
  return h(
    "div",
    {
      style: {
        width: "1200px",
        height: "630px",
        display: "flex",
        background: "#050505",
        padding: "36px",
        fontFamily: "Space Grotesk",
      },
    },
    h(
      "div",
      {
        style: {
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#141414",
          border: "1px solid #2a2a2a",
          borderRadius: "32px",
          padding: "42px 48px 36px",
        },
      },
      h(
        "div",
        { style: { display: "flex", flexDirection: "column" } },
        h(
          "div",
          { style: { display: "flex", alignItems: "center" } },
          h(
            "div",
            {
              style: {
                width: "54px",
                height: "54px",
                borderRadius: "14px",
                background: "#17171c",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "32px",
                fontWeight: 700,
              },
            },
            "G",
          ),
          h(
            "div",
            { style: { display: "flex", marginLeft: "16px", color: "#f5f5f7", fontSize: "34px", fontWeight: 700 } },
            "meter.gonka.gg",
          ),
          h(
            "div",
            {
              style: {
                display: "flex",
                marginLeft: "16px",
                background: "#f4f5fb",
                color: "#19182b",
                borderRadius: "999px",
                padding: "6px 14px",
                fontSize: "22px",
                fontWeight: 700,
              },
            },
            "meter",
          ),
        ),
        h(
          "div",
          {
            style: {
              display: "flex",
              marginTop: "36px",
              color: card.kickerColor,
              fontSize: "24px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            },
          },
          card.kicker,
        ),
        h(
          "div",
          {
            style: {
              display: "flex",
              marginTop: "8px",
              color: "#ffffff",
              fontSize: card.headline.length > 28 ? "54px" : "68px",
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
            },
          },
          card.headline,
        ),
        h(
          "div",
          { style: { display: "flex", marginTop: "10px", color: "#b5b5be", fontSize: "28px" } },
          card.sub,
        ),
      ),
      h(
        "div",
        { style: { display: "flex", flexDirection: "column" } },
        h("div", { style: { display: "flex", height: "1px", background: "#2e2e2e", marginBottom: "22px" } }),
        h(
          "div",
          { style: { display: "flex", justifyContent: "space-between" } },
          ...stats.map((stat) =>
            h(
              "div",
              { style: { display: "flex", flexDirection: "column", width: "240px" } },
              h(
                "div",
                { style: { display: "flex", color: "#8d8d96", fontSize: "20px", letterSpacing: "0.04em" } },
                stat.label,
              ),
              h(
                "div",
                { style: { display: "flex", marginTop: "6px", color: "#ffffff", fontSize: "32px", fontWeight: 700 } },
                stat.value,
              ),
            ),
          ),
        ),
        h(
          "div",
          { style: { display: "flex", marginTop: "22px", color: "#6f6f78", fontSize: "20px" } },
          card.foot,
        ),
      ),
    ),
  );
}

async function loadFonts() {
  try {
    if (!fontRegular) fontRegular = await fetchFont("500");
    if (!fontBold) fontBold = await fetchFont("700");
    return [
      { name: "Space Grotesk", data: fontRegular, weight: 500 as const, style: "normal" as const },
      { name: "Space Grotesk", data: fontBold, weight: 700 as const, style: "normal" as const },
    ];
  } catch {
    return undefined;
  }
}

async function fetchFont(weight: "500" | "700") {
  const response = await fetch(
    `https://cdn.jsdelivr.net/fontsource/fonts/space-grotesk@5.2.8/latin-${weight}-normal.woff`,
    { signal: AbortSignal.timeout(8000) },
  );
  if (!response.ok) throw new Error("font");
  return response.arrayBuffer();
}
