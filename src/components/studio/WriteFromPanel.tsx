/**
 * WRITE FROM PANEL — step 1 of the composer.
 *
 * Before the member presses "Write it" they see what Aura is about to write
 * from: how much evidence, how many sources, how confident, and — if they ask
 * for it — the individual readings behind the signal.
 *
 * Queries and column names mirror SignalHero in IntelligenceTab exactly.
 * Never throws: any failure renders nothing.
 */
import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatSmartDate } from "@/lib/formatDate";

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
  see: { en: "See the readings behind this", ar: "اطّلع على القراءات وراء هذا" },
  none: { en: "No readings linked to this one yet.", ar: "لا توجد قراءات مرتبطة بهذا بعد." },
  yourCapture: { en: "Your capture", ar: "من التقاطك" },
  extracted: { en: "Extracted", ar: "مُستخرج" },
};

export default function WriteFromPanel({ signalId, lang }: { signalId: string | null; lang: Lang }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const rtl = lang === "ar";

  useEffect(() => {
    if (!signalId) { setData(null); setLoadedFor(null); return; }
    if (loadedFor === signalId) return;
    let cancelled = false;
    setOpen(false);
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
        const ids: string[] = Array.isArray(s.supporting_evidence_ids) ? s.supporting_evidence_ids : [];
        let fragments: FragmentRow[] = [];

        if (ids.length) {
          const { data: frags } = await supabase
            .from("evidence_fragments")
            .select("id, title, content, created_at, source_registry_id")
            .in("id", ids)
            .order("created_at", { ascending: false })
            .limit(20);
          const fs = (frags || []) as any[];
          const regIds = Array.from(new Set(fs.map(f => f.source_registry_id).filter(Boolean)));
          const regMap = new Map<string, any>();
          const entryMap = new Map<string, any>();
          if (regIds.length) {
            const sr = await supabase.from("source_registry" as any).select("id, source_type, source_id, title").in("id", regIds);
            (sr.data || []).forEach((r: any) => regMap.set(r.id, r));
            const entryIds = Array.from(new Set((sr.data || [])
              .filter((r: any) => r.source_type === "entry" && r.source_id)
              .map((r: any) => r.source_id)));
            if (entryIds.length) {
              const ents = await supabase.from("entries").select("id, title, type, account_name").in("id", entryIds);
              (ents.data || []).forEach((e: any) => entryMap.set(e.id, e));
            }
          }
          const seen = new Set<string>();
          for (const f of fs) {
            const reg = f.source_registry_id ? regMap.get(f.source_registry_id) : null;
            let kind: "capture" | "aura" | "unknown" = "unknown";
            let label = f.title || (rtl ? "مصدر بلا عنوان" : "Untitled source");
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
                }
              } else if (reg.source_type === "document") {
                kind = "capture";
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
          sourceCount: Number(s.unique_orgs ?? 1),
          fragments,
        });
        setLoadedFor(signalId);
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
  const count = fragments.length || fragCount;

  const countLine = rtl
    ? `${fragCount} قطعة من الأدلة من ${sourceCount} مصدر. الثقة: ${confPct}%.`
    : `${fragCount} piece${fragCount === 1 ? "" : "s"} of evidence from ${sourceCount} source${sourceCount === 1 ? "" : "s"}. Confidence: ${confPct}%.`;

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
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
          style={{
            background: "none", border: "none", padding: 0, cursor: "pointer",
            fontFamily: "var(--ff-ui)", fontSize: 12.5, color: "var(--text-secondary)",
            textDecoration: "underline", textUnderlineOffset: 3,
          }}
        >
          {`${COPY.see[lang]} (${count})`}
        </button>

        {open && (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {fragments.length === 0 ? (
              <span style={{ fontFamily: "var(--ff-ui)", fontSize: 12, color: "var(--text-secondary)" }}>
                {COPY.none[lang]}
              </span>
            ) : fragments.map(f => (
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
          </div>
        )}
      </div>
    </div>
  );
}
