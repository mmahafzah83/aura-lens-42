/**
 * WRITE FROM PANEL — step 1 of the composer.
 *
 * Before the member presses "Write it" they see what Aura is about to write
 * from: how much evidence, how many sources, how confident, and — if they ask
 * for it — the individual sources behind the signal.
 *
 * THE RULE, restored: the number next to a control that reveals a list IS the
 * length of the list that will be revealed. "See the 4 sources behind this"
 * opens four rows. Round 1 established this; it stands.
 *
 * TWO NUMBERS, NOT THREE. The stat line states pieces of evidence (from
 * `fragment_count` — nothing reveals that list here) and sources (from the rows
 * themselves). The toggle names the SAME source number it reveals.
 *
 * The rows come from `loadSignalSources`, whose dedupe key is byte-for-byte the
 * reconciler's `COALESCE(sr.source_id, sr.id)` over an INNER JOIN — so
 * `rows.length` and `unique_orgs` are two computations of one rule and must
 * agree. `warnIfDrifted` is therefore a real invariant alarm, not a display
 * choice: if it fires, the data drifted.
 *
 * Never throws: any failure renders nothing.
 */
import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatSmartDate } from "@/lib/formatDate";
import { nEvidence, nSources } from "@/constants/vocabulary";
import { loadSignalSources, warnIfDrifted, type SignalSourceRow } from "@/lib/signalSources";

type Lang = "en" | "ar";

interface Loaded {
  meaning: string;
  confPct: number;
  fragCount: number;
  sourceCount: number;
  sources: (SignalSourceRow & { source_label: string })[];
}

const COPY = {
  eyebrow: { en: "WHAT AURA WILL WRITE FROM", ar: "ما ستكتب منه Aura" },
  loading: { en: "Reading what this is built on…", ar: "نقرأ ما بُني عليه هذا…" },
  see: {
    en: (n: number) => `See the ${nSources(n, "en")} behind this`,
    ar: (n: number) => `اطّلع على ${nSources(n, "ar")} وراء هذا`,
  },
  hide: { en: "Hide the sources", ar: "أخفِ المصادر" },
  showMore: {
    en: (n: number) => `Show the other ${n}`,
    ar: (n: number) => `أظهر الـ ${n} الباقية`,
  },
  none: { en: "No sources linked to this one yet.", ar: "لا توجد مصادر مرتبطة بهذا بعد." },
  yourCapture: { en: "Your capture", ar: "من التقاطك" },
  extracted: { en: "Extracted", ar: "مُستخرج" },
  untitled: { en: "Untitled source", ar: "مصدر بلا عنوان" },
};

/** How many source rows sit inline before the one "show the other n" control. */
const INLINE_ROWS = 8;

export default function WriteFromPanel({ signalId, lang }: { signalId: string | null; lang: Lang }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const rtl = lang === "ar";

  useEffect(() => {
    if (!signalId) { setData(null); setLoadedFor(null); return; }
    if (loadedFor === signalId) return;
    let cancelled = false;
    setOpen(false);
    setExpanded(false);
    setLoading(true);
    (async () => {
      try {
        const { data: sig, error } = await supabase
          .from("strategic_signals")
          .select("what_it_means_for_you, strategic_implications, confidence, supporting_evidence_ids, fragment_count, unique_orgs")
          .eq("id", signalId)
          .maybeSingle();
        if (error) throw error;
        if (!sig) { if (!cancelled) { setData(null); setLoading(false); setLoadedFor(signalId); } return; }

        const s: any = sig;
        const ids: string[] = Array.isArray(s.supporting_evidence_ids) ? s.supporting_evidence_ids.map(String) : [];
        const rows = await loadSignalSources(ids, COPY.untitled[lang]);
        if (cancelled) return;

        setData({
          meaning: String(s.what_it_means_for_you || "").trim() || String(s.strategic_implications || "").trim(),
          confPct: Math.round(Number(s.confidence || 0) * 100),
          fragCount: Number(s.fragment_count ?? ids.length ?? 0),
          // The number we state is the number we can show.
          sourceCount: rows.length,
          sources: rows.map(r => ({
            ...r,
            source_label: r.kind === "aura" ? COPY.extracted[lang] : COPY.yourCapture[lang],
          })),
        });
        setLoadedFor(signalId);
        warnIfDrifted("WriteFromPanel", signalId, rows.length, Number(s.unique_orgs ?? 0));
      } catch (e) {
        console.warn("[WriteFromPanel] load failed", e);
        if (!cancelled) { setData(null); setLoadedFor(signalId); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [signalId, loadedFor, lang, rtl]);

  if (!signalId) return null;

  const shell: React.CSSProperties = {
    marginTop: 16, padding: 14, borderRadius: 12,
    background: "var(--surface-subtle)",
    border: "1px solid var(--border-default)",
    textAlign: rtl ? "right" : "left",
    ...(rtl ? { fontFamily: "var(--ff-ui)", lineHeight: 1.9 } : null),
  };

  if (loading && !data) {
    return (
      <div dir={rtl ? "rtl" : undefined} style={shell}>
        <span style={{ fontFamily: "var(--ff-ui)", fontSize: 12.5, color: "var(--text-secondary)" }}>
          {COPY.loading[lang]}
        </span>
      </div>
    );
  }

  if (!data) return null;

  const { meaning, confPct, fragCount, sourceCount, sources } = data;
  const shown = expanded ? sources : sources.slice(0, INLINE_ROWS);
  // Reconciles against the number stated on the toggle: shown + rest = sourceCount.
  const rest = sourceCount - shown.length;

  const countLine = rtl
    ? `${nEvidence(fragCount, "ar")} من ${nSources(sourceCount, "ar")}. الثقة: ${confPct}%.`
    : `${nEvidence(fragCount, "en")} from ${nSources(sourceCount, "en")}. Confidence: ${confPct}%.`;

  return (
    <div dir={rtl ? "rtl" : undefined} style={shell}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
        <span style={{ width: 5, height: 5, borderRadius: 999, background: "var(--machine)", flex: "0 0 auto" }} />
        <span style={{
          fontFamily: "var(--ff-mono)",
          fontSize: 10, fontWeight: 600, letterSpacing: ".14em", textTransform: "uppercase",
          color: "var(--text-secondary)",
        }}>
          {COPY.eyebrow[lang]}
        </span>
      </div>

      <p style={{
        fontFamily: "var(--ff-ui)", fontSize: 12.5, color: "var(--text-secondary)",
        margin: 0, lineHeight: rtl ? 1.9 : 1.6,
      }}>
        {countLine}
      </p>

      {meaning && (
        <p dir="auto" style={{
          fontFamily: "var(--ff-ui)", fontSize: 13.5, color: "var(--text-primary)",
          margin: "10px 0 0", lineHeight: rtl ? 1.9 : 1.55,
        }}>
          {meaning}
        </p>
      )}

      <div style={{ marginTop: 10 }}>
        <button
          type="button"
          className="v23-tap v23-focus"
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
          style={{
            background: "none", border: "none", padding: 0, cursor: "pointer", minHeight: 44,
            fontFamily: "var(--ff-ui)", fontSize: 12.5, color: "var(--text-secondary)",
            textDecoration: "underline", textUnderlineOffset: 3,
          }}
        >
          {open ? COPY.hide[lang] : COPY.see[lang](sourceCount)}
        </button>

        {open && (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {sources.length === 0 ? (
              <span style={{ fontFamily: "var(--ff-ui)", fontSize: 12, color: "var(--text-secondary)" }}>
                {COPY.none[lang]}
              </span>
            ) : (
              <>
                {shown.map(f => (
                  <div key={f.id} style={{
                    display: "flex", gap: 10, alignItems: "center",
                    padding: "7px 10px", borderRadius: 8,
                    background: "var(--surface-card, var(--surface-subtle))",
                    border: "1px solid var(--border-default)",
                    fontFamily: "var(--ff-ui)", fontSize: 12,
                  }}>
                    <span dir="auto" style={{
                      flex: 1, minWidth: 0, color: "var(--text-primary)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {f.title}
                    </span>
                    <span style={{
                      color: "var(--text-secondary)", fontSize: 10,
                      textTransform: "uppercase", letterSpacing: ".06em", flex: "0 0 auto",
                    }}>
                      {f.source_label}
                    </span>
                    <span style={{
                      color: "var(--text-secondary)", flex: "0 0 auto",
                      fontFamily: "var(--ff-mono)", fontSize: 11,
                    }}>
                      {formatSmartDate(f.created_at)}
                    </span>
                  </div>
                ))}
                {rest > 0 && (
                  <button
                    type="button"
                    className="v23-tap v23-focus"
                    onClick={() => setExpanded(true)}
                    style={{
                      background: "none", border: "none", padding: 0, cursor: "pointer", minHeight: 44,
                      textAlign: rtl ? "right" : "left",
                      fontFamily: "var(--ff-ui)", fontSize: 12.5, color: "var(--text-secondary)",
                      textDecoration: "underline", textUnderlineOffset: 3,
                    }}
                  >
                    {COPY.showMore[lang](rest)}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
