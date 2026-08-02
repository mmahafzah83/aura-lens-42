/**
 * Dev-only harness for the renderer and the export path. Not linked from
 * anywhere in the product: it exists so the contract can be inspected against
 * real pixels, and so the export can be proved to capture THOSE pixels — the
 * export reads the very nodes rendered below, never a clone.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DeckIRSchema, type DeckIR } from "../deckIR";
import { checkInvariants } from "../invariants";
import { DeckPreview } from "./Deck";
import { THEME_NAMES, DEFAULT_THEME, type ThemeName } from "./themes";
import type { FitState } from "./useFitLadder";
import { collectSlideNodes, exportDeckPdf, exportDeckPngs, maxFitStep, type ExportResult } from "./exportDeck";
import { logDeckEvent } from "./deckTelemetry";

import enChart from "../__fixtures__/en-7-chart.json";
import arInlineEn from "../__fixtures__/ar-7-inline-en.json";
import enNoStat from "../__fixtures__/en-5-no-stat.json";

const RAW: Array<[string, unknown]> = [
  ["en-7-chart", enChart],
  ["ar-7-inline-en", arInlineEn],
  ["en-5-no-stat", enNoStat],
];

const btn = (active = false): React.CSSProperties => ({
  padding: "8px 16px",
  borderRadius: 999,
  border: `1px solid ${active ? "#36C5B0" : "rgba(255,255,255,.2)"}`,
  background: active ? "#36C5B0" : "transparent",
  color: active ? "#0B1216" : "#DFE8EA",
  fontSize: 13,
  cursor: "pointer",
});

function DeckSection({
  name, deck, schemaErrors, theme,
}: {
  name: string;
  deck: DeckIR | null;
  schemaErrors: string[];
  theme: ThemeName;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [fits, setFits] = useState<Record<number, FitState>>({});
  const [busy, setBusy] = useState<null | "pdf" | "png">(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const invariantErrors = deck ? checkInvariants(deck) : [];
  const rendered = deck ? Object.keys(fits).length === deck.slides.length : false;

  // 'rendered' once every slide has reported, carrying the deck's worst fit step.
  const loggedRender = useRef(false);
  useEffect(() => {
    if (!deck || !rendered || loggedRender.current) return;
    loggedRender.current = true;
    const step = Object.values(fits).reduce((m, f) => Math.max(m, f.step), 0);
    void logDeckEvent("rendered", deck, { theme, fitSteps: step, invariantFailures: invariantErrors.length ? invariantErrors : undefined });
  }, [deck, rendered, fits, theme, invariantErrors]);

  const run = useCallback(
    async (kind: "pdf" | "png") => {
      if (!deck || !mountRef.current) return;
      setBusy(kind);
      setError(null);
      setResult(null);
      const started = performance.now();
      const nodes = collectSlideNodes(mountRef.current);
      try {
        const out =
          kind === "pdf"
            ? await exportDeckPdf(nodes, `${name}.pdf`)
            : await exportDeckPngs(nodes, `${name}-pngs.zip`);
        setResult(out);
        void logDeckEvent("exported", deck, { theme, fitSteps: out.maxFitStep, durationMs: out.durationMs });
      } catch (e) {
        // Abort the whole deck. A partial carousel is worse than none.
        setError(e instanceof Error ? e.message : String(e));
        void logDeckEvent("export_failed", deck, {
          theme,
          fitSteps: maxFitStep(nodes),
          durationMs: Math.round(performance.now() - started),
        });
      } finally {
        setBusy(null);
      }
    },
    [deck, name, theme],
  );

  return (
    <section style={{ marginBottom: 48 }}>
      <h2 style={{ fontSize: 15, margin: "0 0 8px" }}>{name}</h2>

      {schemaErrors.length > 0 && (
        <pre style={{ color: "#E8674F", fontSize: 12, whiteSpace: "pre-wrap" }}>schema: {schemaErrors.join("\n")}</pre>
      )}
      <pre style={{ fontSize: 12, color: invariantErrors.length ? "#E8674F" : "#8FE3D6", whiteSpace: "pre-wrap", margin: "0 0 12px" }}>
        {invariantErrors.length ? invariantErrors.join("\n") : "checkInvariants: 0 failures"}
      </pre>

      {deck && (
        <>
          <pre style={{ fontSize: 12, color: "#A6B4B8", margin: "0 0 12px", whiteSpace: "pre-wrap" }}>
            {deck.slides
              .map((s) => {
                const f = fits[s.index];
                const suffix = f?.failed ? `  FAILED — ${f.reason}` : "";
                return `slide ${s.index} (${s.archetype})  fit step ${f ? f.step : "…"}${suffix}`;
              })
              .join("\n")}
          </pre>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
            <button style={btn()} disabled={!!busy} onClick={() => run("pdf")}>
              {busy === "pdf" ? "Exporting…" : "Export PDF"}
            </button>
            <button style={btn()} disabled={!!busy} onClick={() => run("png")}>
              {busy === "png" ? "Exporting…" : "Export PNGs"}
            </button>
            {result && (
              <span data-export-readout style={{ fontSize: 12, color: "#8FE3D6" }}>
                {result.slides} slides captured · max fit step {result.maxFitStep} · {result.durationMs} ms
              </span>
            )}
            {error && (
              <span data-export-error style={{ fontSize: 12, color: "#E8674F" }}>
                Export failed — {error}{" "}
                <button style={{ ...btn(), padding: "4px 10px" }} onClick={() => run(busy ?? "pdf")}>
                  Retry
                </button>
              </span>
            )}
          </div>

          <div ref={mountRef}>
            <DeckPreview
              deck={deck}
              theme={theme}
              width={340}
              onFit={(index, state) =>
                setFits((prev) => {
                  const old = prev[index];
                  if (old && old.step === state.step && old.failed === state.failed) return prev;
                  return { ...prev, [index]: state };
                })
              }
            />
          </div>
        </>
      )}
    </section>
  );
}

export default function CarouselPreview() {
  const [theme, setTheme] = useState<ThemeName>(DEFAULT_THEME);

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
        Fixtures from src/carousel/__fixtures__. Export captures the mounted slides below — same DOM, no clone.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 28 }}>
        {THEME_NAMES.map((t) => (
          <button key={t} onClick={() => setTheme(t)} style={btn(t === theme)}>
            {t}
          </button>
        ))}
      </div>

      {decks.map((d) => (
        <DeckSection key={d.name} {...d} theme={theme} />
      ))}
    </main>
  );
}
