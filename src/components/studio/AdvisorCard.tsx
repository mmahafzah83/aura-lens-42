import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ButtonGhost } from "@/components/systemb";

/**
 * ADVISOR — a DRAFT-level scorecard.
 *
 * It shows nothing new: every number comes from the existing
 * `evaluate-content-quality` reading (either the one the generation already
 * ran, or a re-check the member asks for). No scoring happens here.
 *
 * Two laws hold this file together:
 *  · the judge's own prose (`weaknesses`, `verdict`) is INTERNAL and is never
 *    rendered — every sentence below is ours, derived from a band or a boolean;
 *  · no score appears without a sentence and a fix.
 *
 * This is not the Imprint. It reads nothing from, and writes nothing to,
 * imprint/score_snapshots.
 */

export type Lang = "en" | "ar";

export type GatePayload = {
  scores?: Record<string, number>;
  overall?: number;
  assertions?: Record<string, boolean>;
  improved_hook?: string;
  category?: string;
} | null;

const C = {
  head: { en: "ADVISOR", ar: "المستشار" },
  lede: {
    en: "How this reads before your name goes on it.",
    ar: "كيف تُقرأ هذه الكلمات قبل أن يوضع اسمك عليها.",
  },
  recheck: { en: "Re-check", ar: "إعادة الفحص" },
  checking: { en: "Reading your draft…", ar: "نقرأ مسودتك…" },
  none: {
    en: "No reading yet for these words. Tap re-check when you're ready.",
    ar: "لا توجد قراءة لهذه الكلمات بعد. اضغط إعادة الفحص عندما تكون جاهزًا.",
  },
  failed: { en: "That reading didn't come back. Try again.", ar: "لم تعُد القراءة. حاول مرة أخرى." },
  voice: { en: "Your voice", ar: "صوتك" },
  grounded: { en: "Grounded", ar: "مستند إلى دليل" },
  opening: { en: "Opening", ar: "الافتتاحية" },
  depth: { en: "Depth", ar: "العمق" },
  room: { en: "Fits the room", ar: "يناسب قارئك" },
  fresh: { en: "Freshness", ar: "التجديد" },
  freshSoon: { en: "measured once you've published a few", ar: "يُقاس بعد نشر عدد من المنشورات" },
  fixVoice: { en: "More my voice", ar: "اجعلها أقرب لصوتي" },
  fixNumber: { en: "Remove the unbacked number", ar: "احذف الرقم غير المدعوم" },
  fixHook: { en: "Use the stronger opening", ar: "استخدم الافتتاحية الأقوى" },
  fixDepth: { en: "Go one level deeper", ar: "انزل مستوى أعمق" },
  fixRoom: { en: "Aim at my reader", ar: "وجّهها إلى قارئي" },
} as const;

/** Our sentences. Band + boolean only — never the judge's words. */
const SENTENCE: Record<string, { hi: Record<Lang, string>; mid: Record<Lang, string>; low: Record<Lang, string> }> = {
  voice: {
    hi: { en: "This sounds like you.", ar: "هذه الكلمات تشبهك." },
    mid: { en: "Close to your voice, with a few borrowed turns.", ar: "قريبة من صوتك، مع عبارات مستعارة." },
    low: { en: "This reads like a machine wrote it.", ar: "تُقرأ كأن آلة كتبتها." },
  },
  grounded: {
    hi: { en: "Specific enough to be believed.", ar: "محدّدة بما يكفي لتُصدَّق." },
    mid: { en: "One more concrete detail would carry it.", ar: "تفصيل ملموس إضافي سيقويها." },
    low: { en: "Too abstract — nothing here can be checked.", ar: "مجرّدة أكثر من اللازم — لا شيء يمكن التحقق منه." },
  },
  ungrounded: {
    hi: { en: "", ar: "" },
    mid: { en: "", ar: "" },
    low: { en: "A number here isn't backed by your evidence.", ar: "هناك رقم لا يسنده دليلك." },
  },
  opening: {
    hi: { en: "The first line stops a busy reader.", ar: "السطر الأول يوقف القارئ المشغول." },
    mid: { en: "The first line works, but it doesn't grip.", ar: "السطر الأول جيد، لكنه لا يمسك بالقارئ." },
    low: { en: "The first line reads like every other post.", ar: "السطر الأول يشبه أي منشور آخر." },
  },
  depth: {
    hi: { en: "You go past the obvious take.", ar: "تتجاوز الرأي الظاهر." },
    mid: { en: "There's an insight here — it stops one step short.", ar: "هناك فكرة، لكنها تتوقف قبل خطوة." },
    low: { en: "Anyone could have written this without your evidence.", ar: "أي شخص كان ليكتبها دون دليلك." },
  },
  room: {
    hi: { en: "Written in your language, for your reader.", ar: "مكتوبة بلغتك، ولقارئك." },
    mid: { en: "Half-aimed — either the wording or the field drifts.", ar: "موجّهة نصفيًا — الصياغة أو المجال ينحرف." },
    low: { en: "This is aimed at someone else's room.", ar: "هذه موجّهة إلى قاعة غير قاعتك." },
  },
};

function band(v: number): "hi" | "mid" | "low" {
  return v >= 75 ? "hi" : v >= 50 ? "mid" : "low";
}
function colourOf(v: number): string {
  return v >= 75 ? "#12805C" : v >= 50 ? "#E0A82E" : "#C0392B";
}

type Row = {
  key: string;
  label: string;
  value: number;
  sentence: string;
  fix?: { label: string; run: () => void };
};

const Bar: React.FC<{ value: number; colour: string }> = ({ value, colour }) => (
  <span aria-hidden style={{ display: "block", height: 4, borderRadius: 999, background: "var(--surface-subtle)", marginTop: 6 }}>
    <span style={{ display: "block", height: 4, borderRadius: 999, width: `${Math.max(2, Math.min(100, value))}%`, background: colour }} />
  </span>
);

interface Props {
  lang: Lang;
  /** The words on screen right now — what a re-check reads. */
  text: string;
  /** Reading already taken at generation, if the surface has one. */
  initial?: GatePayload;
  subject?: string | null;
  signalId?: string | null;
  busy?: boolean;
  /** Re-runs the existing generation with a directive. No new generation code. */
  onRefine: (directive: string) => void;
  /** Swaps line 1 for the stronger opening the reading returned. */
  onUseOpening: (line: string) => void;
}

const AdvisorCard: React.FC<Props> = ({ lang, text, initial, subject, signalId, busy, onRefine, onUseOpening }) => {
  const rtl = lang === "ar";
  const [payload, setPayload] = useState<GatePayload>(initial ?? null);
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => { if (initial) setPayload(initial); }, [initial]);

  const recheck = useCallback(async () => {
    if (!text.trim()) return;
    setChecking(true);
    setFailed(false);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) { setFailed(true); return; }
      const { data, error } = await supabase.functions.invoke("evaluate-content-quality", {
        body: {
          post_text: text,
          language: lang,
          signal_title: subject || undefined,
          content_kind: "post",
          signal_id: signalId || undefined,
        },
      });
      if (error || !data) { setFailed(true); return; }
      // Only the structured fields are read. `weaknesses` and `verdict` stay
      // where they belong: out of the member's sight.
      setPayload({
        scores: (data as any)?.scores ?? {},
        overall: Number((data as any)?.overall) || undefined,
        assertions: (data as any)?.assertions ?? {},
        improved_hook: typeof (data as any)?.improved_hook === "string" ? (data as any).improved_hook : undefined,
        category: (data as any)?.category,
      });
    } catch {
      setFailed(true);
    } finally {
      setChecking(false);
    }
  }, [text, lang, subject, signalId]);

  const rows: Row[] = useMemo(() => {
    if (!payload) return [];
    const s = payload.scores ?? {};
    const a = payload.assertions ?? {};
    const ten = (k: string) => Math.round(Math.max(0, Math.min(10, Number(s[k]) || 0)) * 10);

    const voice = ten("voice");
    const grounded = a.grounded_number === false ? 0 : ten("specificity");
    const opening = ten("hook");
    const depth = ten("signal_depth");
    const roomTrue = (a.register_match === false ? 0 : 1) + (a.domain_match === false ? 0 : 1);
    const room = roomTrue === 2 ? 100 : roomTrue === 1 ? 50 : 0;
    const hook = payload.improved_hook?.trim();

    return [
      {
        key: "voice", label: C.voice[lang], value: voice,
        sentence: SENTENCE.voice[band(voice)][lang],
        fix: { label: C.fixVoice[lang], run: () => onRefine(lang === "ar" ? "أعد كتابتها بصوت الكاتب نفسه: نفس الإيقاع والمفردات التي يستخدمها، دون عبارات آلية." : "Rewrite this in the member's own voice: their rhythm and vocabulary, no machine phrasing.") },
      },
      {
        key: "grounded", label: C.grounded[lang], value: grounded,
        sentence: a.grounded_number === false ? SENTENCE.ungrounded.low[lang] : SENTENCE.grounded[band(grounded)][lang],
        fix: a.grounded_number === false
          ? { label: C.fixNumber[lang], run: () => onRefine(lang === "ar" ? "احذف أي رقم لا يسنده الدليل المرفق، ولا تستبدله برقم آخر." : "Remove every statistic that the supplied evidence does not support. Do not substitute another number.") }
          : { label: C.fixDepth[lang], run: () => onRefine(lang === "ar" ? "أضف تفصيلًا ملموسًا واحدًا مستمدًا من الدليل المرفق." : "Add one concrete detail drawn only from the supplied evidence.") },
      },
      {
        key: "opening", label: C.opening[lang], value: opening,
        sentence: SENTENCE.opening[band(opening)][lang],
        fix: hook
          ? { label: C.fixHook[lang], run: () => onUseOpening(hook) }
          : { label: C.fixVoice[lang], run: () => onRefine(lang === "ar" ? "اكتب سطرًا أول أقوى يوقف القارئ، مع بقاء بقية النص كما هو في المعنى." : "Write a stronger first line that stops the reader; keep the rest of the argument.") },
      },
      {
        key: "depth", label: C.depth[lang], value: depth,
        sentence: SENTENCE.depth[band(depth)][lang],
        fix: { label: C.fixDepth[lang], run: () => onRefine(lang === "ar" ? "انزل مستوى أعمق: اشرح الآلية وراء الملاحظة، لا الملاحظة نفسها." : "Go one level deeper: explain the mechanism behind the observation, not the observation.") },
      },
      {
        key: "room", label: C.room[lang], value: room,
        sentence: SENTENCE.room[band(room)][lang],
        fix: { label: C.fixRoom[lang], run: () => onRefine(lang === "ar" ? "اكتبها بالفصحى المعاصرة ولمجال قارئي تحديدًا." : "Write this in the reader's own register and anchored in their field.") },
      },
    ];
  }, [payload, lang, onRefine, onUseOpening]);

  return (
    <section
      dir={rtl ? "rtl" : "ltr"}
      aria-label={C.head[lang]}
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--rule-outer)",
        borderRadius: 20,
        boxShadow: "var(--v23-card-rest)",
        padding: 16,
        marginTop: 16,
        fontFamily: rtl ? "Cairo, var(--ff-ui)" : "var(--ff-ui)",
        textAlign: rtl ? "right" : "left",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span style={{ fontFamily: "var(--ff-mono)", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--text-muted)" }}>
          {C.head[lang]}
        </span>
        <ButtonGhost onClick={() => void recheck()} disabled={checking || busy || !text.trim()} style={{ minHeight: 36, padding: "6px 12px" }}>
          <RotateCcw size={13} aria-hidden /> {C.recheck[lang]}
        </ButtonGhost>
      </div>
      <p style={{ fontSize: 12.5, lineHeight: rtl ? 1.9 : 1.7, color: "var(--text-secondary)", margin: "6px 0 12px" }}>
        {C.lede[lang]}
      </p>

      {checking && (
        <p role="status" aria-live="polite" style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>{C.checking[lang]}</p>
      )}
      {!checking && failed && (
        <p role="status" style={{ fontSize: 13, color: "var(--error)", margin: 0 }}>{C.failed[lang]}</p>
      )}
      {!checking && !failed && rows.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>{C.none[lang]}</p>
      )}

      {!checking && rows.length > 0 && (
        <div style={{ display: "grid", gap: 14 }}>
          {rows.map((r) => {
            const colour = colourOf(r.value);
            return (
              <div key={r.key}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)" }}>{r.label}</span>
                  <span style={{ fontFamily: "'IBM Plex Mono', var(--ff-mono)", fontVariantNumeric: "tabular-nums", fontSize: 15, fontWeight: 600, color: colour }}>
                    {r.value}
                  </span>
                </div>
                <Bar value={r.value} colour={colour} />
                <p style={{ fontSize: 12.5, lineHeight: rtl ? 1.9 : 1.7, color: "var(--text-secondary)", margin: "8px 0 0" }}>{r.sentence}</p>
                {r.fix && (
                  <button
                    type="button"
                    onClick={r.fix.run}
                    disabled={busy}
                    style={{
                      marginTop: 6, minHeight: 36, padding: 0, background: "transparent", border: 0,
                      cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 13,
                      fontWeight: 700, color: "var(--act)",
                    }}
                  >
                    {r.fix.label}
                  </button>
                )}
              </div>
            );
          })}

          {/* Freshness is not measured yet — it waits on a published corpus. */}
          <div style={{ opacity: 0.55 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)" }}>{C.fresh[lang]}</span>
              <span style={{ fontFamily: "'IBM Plex Mono', var(--ff-mono)", fontSize: 15, color: "var(--text-muted)" }}>—</span>
            </div>
            <Bar value={0} colour="var(--border-strong)" />
            <p style={{ fontSize: 12.5, lineHeight: rtl ? 1.9 : 1.7, color: "var(--text-muted)", margin: "8px 0 0" }}>{C.freshSoon[lang]}</p>
          </div>
        </div>
      )}
    </section>
  );
};

export default AdvisorCard;
