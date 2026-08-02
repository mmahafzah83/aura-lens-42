/**
 * Dev-only harness for the renderer. Not linked from anywhere in the product
 * and not intended to ship as a member surface: it exists so the contract can
 * be inspected against real pixels.
 */
import React, { useMemo, useState } from "react";
import { DeckIRSchema, type DeckIR } from "../deckIR";
import { checkInvariants } from "../invariants";
import { DeckPreview } from "./Deck";
import { THEME_NAMES, DEFAULT_THEME, type ThemeName } from "./themes";
import type { FitState } from "./useFitLadder";

import enChart from "../__fixtures__/en-7-chart.json";
import arInlineEn from "../__fixtures__/ar-7-inline-en.json";
import enNoStat from "../__fixtures__/en-5-no-stat.json";

const RAW: Array<[string, unknown]> = [
  ["en-7-chart", enChart],
  ["ar-7-inline-en", arInlineEn],
  ["en-5-no-stat", enNoStat],
];

export default function CarouselPreview() {
  const [theme, setTheme] = useState<ThemeName>(DEFAULT_THEME);
  const [fits, setFits] = useState<Record<string, FitState>>({});

  const decks = useMemo(
    () =>
      RAW.map(([name, raw]) => {
        const parsed = DeckIRSchema.safeParse(raw);
        return {
          name,
          deck: parsed.success ? (parsed.data as DeckIR) : null,
          schemaErrors: parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        };
      }),
    [],
  );

  return (
    <main style={{ minHeight: "100vh", background: "#0B1216", color: "#DFE8EA", padding: 32, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 20, margin: "0 0 4px" }}>Carousel renderer — dev preview</h1>
      <p style={{ fontSize: 13, color: "#A6B4B8", margin: "0 0 20px" }}>
        Fixtures from src/carousel/__fixtures__. Invariant failures and fit-ladder steps print under each deck.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 28 }}>
        {THEME_NAMES.map((t) => (
          <button
            key={t}
            onClick={() => setTheme(t)}
            style={{
              padding: "8px 16px",
              borderRadius: 999,
              border: `1px solid ${t === theme ? "#36C5B0" : "rgba(255,255,255,.2)"}`,
              background: t === theme ? "#36C5B0" : "transparent",
              color: t === theme ? "#0B1216" : "#DFE8EA",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {decks.map(({ name, deck, schemaErrors }) => {
        const invariantErrors = deck ? checkInvariants(deck) : [];
        return (
          <section key={name} style={{ marginBottom: 48 }}>
            <h2 style={{ fontSize: 15, margin: "0 0 8px" }}>{name}</h2>

            {schemaErrors.length > 0 && (
              <pre style={{ color: "#E8674F", fontSize: 12, whiteSpace: "pre-wrap" }}>
                schema: {schemaErrors.join("\n")}
              </pre>
            )}
            <pre style={{ fontSize: 12, color: invariantErrors.length ? "#E8674F" : "#8FE3D6", whiteSpace: "pre-wrap", margin: "0 0 12px" }}>
              {invariantErrors.length ? invariantErrors.join("\n") : "checkInvariants: 0 failures"}
            </pre>

            {deck && (
              <>
                <pre style={{ fontSize: 12, color: "#A6B4B8", margin: "0 0 12px", whiteSpace: "pre-wrap" }}>
                  {deck.slides
                    .map((s) => {
                      const f = fits[`${name}:${s.index}`];
                      const suffix = f?.failed ? `  FAILED — ${f.reason}` : "";
                      return `slide ${s.index} (${s.archetype})  fit step ${f ? f.step : "…"}${suffix}`;
                    })
                    .join("\n")}
                </pre>
                <DeckPreview
                  deck={deck}
                  theme={theme}
                  width={340}
                  onFit={(index, state) =>
                    setFits((prev) => {
                      const key = `${name}:${index}`;
                      const old = prev[key];
                      if (old && old.step === state.step && old.failed === state.failed) return prev;
                      return { ...prev, [key]: state };
                    })
                  }
                />
              </>
            )}
          </section>
        );
      })}
    </main>
  );
}