/**
 * WRITE FROM PANEL — step 1 of the composer.
 *
 * Before the member presses "Write it" they see what Aura is about to write
 * from: how much evidence, how many sources, how confident, and — if they ask
 * for it — the individual sources behind the signal.
 *
 * TWO NUMBERS, NOT THREE. The stat line states pieces of evidence and sources.
 * The expandable toggle names the SAME source number it reveals, so every
 * number on screen traces back to one already stated.
 *
 * ONE TRUTH FOR THE NUMBER: the stated source count is `unique_orgs`, the same
 * field the signals list and the confirm screen read, so three surfaces can no
 * longer disagree. The expandable LIST still fetches real rows — chunked, so a
 * long id list fits in one URL — because members must see the actual readings.
 * If the readable rows ever disagree with `unique_orgs` we log it rather than
 * quietly reshaping the number.
 *
 * Never throws: any failure renders nothing.
 */
import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatSmartDate } from "@/lib/formatDate";
import { nEvidence, nSources } from "@/constants/vocabulary";

type Lang = "en" | "ar";

interface FragmentRow {
  id: string;
  title: string;
  created_at: string;
  source_label: string;
}

interface Loaded {
  meaning: string;
  confPct: number;
  fragCount: number;
  sourceCount: number;
  fragments: FragmentRow[];
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
};

/** How many source rows sit inline before the one "show the other n" control. */
const INLINE_ROWS = 8;
/** Ids per request — keeps a long `.in()` list inside a safe URL length. */
const CHUNK = 150;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

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
        const fragments: FragmentRow[] = [];

        if (ids.length) {
          // Every supporting fragment, not the first 20 — the cut used to happen
          // before dedup, which is what made the revealed count a third number.
          const fs: any[] = [];
          for (const part of chunk(ids, CHUNK)) {
            const { data: frags } = await supabase
              .from("evidence_fragments")
              .select("id, title, content, created_at, source_registry_id")
              .in("id", part)
              .order("created_at", { ascending: false });
            fs.push(...((frags || []) as any[]));
          }
          fs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

          const regIds = Array.from(new Set(fs.map(f => f.source_registry_id).filter(Boolean)));
          const regMap = new Map<string, any>();
          const entryMap = new Map<string, any>();
          for (const part of chunk(regIds, CHUNK)) {
            const sr = await supabase.from("source_registry" as any).select("id, source_type, source_id, title").in("id", part);
            (sr.data || []).forEach((r: any) => regMap.set(r.id, r));
          }
          const entryIds = Array.from(new Set(
            Array.from(regMap.values())
              .filter((r: any) => r.source_type === "entry" && r.source_id)
              .map((r: any) => r.source_id),
          ));
          for (const part of chunk(entryIds as string[], CHUNK)) {
            const ents = await supabase.from("entries").select("id, title, type, account_name").in("id", part);
            (ents.data || []).forEach((e: any) => entryMap.set(e.id, e));
          }

          const seen = new Set<string>();
          for (const f of fs) {
            const reg = f.source_registry_id ? regMap.get(f.source_registry_id) : null;
            let kind: "capture" | "aura" | "unknown" = "unknown";
            let label = f.title || (rtl ? "مصدر بلا عنوان" : "Untitled source");
            // A fragment with no readable registry row is still a source the
            // signal stands on — it keeps its own identity instead of being
            // silently dropped or folded into someone else's row.
            let key = f.id;
            if (reg) {
              key = reg.id;
              if (reg.source_type === "entry" && reg.source_id) {
                const ent = entryMap.get(reg.source_id);
                if (ent) {
                  const isAura = (ent.account_name || "").toLowerCase().includes("aura")
                    || (ent.type || "").toLowerCase().includes("onboarding")
                    || (ent.type || "").toLowerCase().includes("exa");
                  kind = isAura ? "aura" : "capture";
                  label = ent.title || reg.title || label;
                  key = reg.source_id;
                } else {
                  label = reg.title || label;
                }
              } else if (reg.source_type === "document") {
                kind = "capture";
                label = reg.title || label;
              } else {
                label = reg.title || label;
              }
            }
            if (seen.has(key)) continue;
            seen.add(key);
            fragments.push({
              id: f.id,
              title: label,
              created_at: f.created_at,
              source_label: kind === "aura" ? COPY.extracted[lang] : COPY.yourCapture[lang],
            });
          }
        }

        if (cancelled) return;
        setData({
          meaning: String(s.what_it_means_for_you || "").trim() || String(s.strategic_implications || "").trim(),
          confPct: Math.round(Number(s.confidence || 0) * 100),
          fragCount: Number(s.fragment_count ?? ids.length ?? 0),
          // unique_orgs is the one truth for "sources behind this signal" — the
          // reconciler keeps it exact for every signal of every status, so the
          // confirm screen, the signals list and this panel all state it.
          sourceCount: Number(s.unique_orgs ?? 0) || fragments.length,
          fragments,
        });
        setLoadedFor(signalId);
        const stated = Number(s.unique_orgs ?? 0) || fragments.length;
        if (stated !== fragments.length) {
          // Never papered over: if the rows we can read disagree with the
          // stamped count, that is a real discrepancy worth seeing.
          console.warn("[WriteFromPanel] unique_orgs disagrees with readable sources",
            { signalId, unique_orgs: stated, readable: fragments.length });
        }
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
    ...(rtl ? { fontFamily: "'Cairo', 'Inter', system-ui, sans-serif", lineHeight: 1.9 } : null),
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

  const { meaning, confPct, fragCount, sourceCount, fragments } = data;
  const shown = expanded ? fragments : fragments.slice(0, INLINE_ROWS);
  const rest = fragments.length - shown.length;

  const countLine = rtl
    ? `${nEvidence(fragCount, "ar")} من ${nSources(sourceCount, "ar")}. الثقة: ${confPct}%.`
    : `${nEvidence(fragCount)} from ${nSources(sourceCount)}. Confidence: ${confPct}%.`;

  return (
    <div dir={rtl ? "rtl" : undefined} style={shell}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
        <span style={{ width: 5, height: 5, borderRadius: 999, background: "#00CEC9", flex: "0 0 auto" }} />
        <span style={{
          fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
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
            {fragments.length === 0 ? (
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
                      fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 11,
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
