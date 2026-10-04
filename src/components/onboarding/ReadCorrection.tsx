/**
 * "Not a verdict" — the member can say the read is wrong, in one line.
 * The correction is stored on the profile and used the next time Aura reads.
 */
import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { OB, EASE, RADIUS } from "./tokens";

const ReadCorrection = ({ userId, onNight = false, inline = false }: {
  userId: string | null; onNight?: boolean; inline?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const muted = onNight ? "rgba(255,255,255,0.86)" : OB.muted;

  const save = async () => {
    if (!userId || !text.trim()) return;
    setSaving(true);
    try {
      const { data } = await (supabase.from("diagnostic_profiles" as any) as any)
        .select("ui_dismissals").eq("user_id", userId).maybeSingle();
      const cur = ((data as any)?.ui_dismissals ?? {}) as Record<string, any>;
      const { error } = await (supabase.from("diagnostic_profiles" as any) as any)
        .update({
          ui_dismissals: { ...cur, read_correction: { text: text.trim(), at: new Date().toISOString() } },
        })
        .eq("user_id", userId);
      if (error) throw error;
      setDone(true);
      toast.success(t("readfix.toastOk"));
    } catch (e) {
      console.warn("[read-correction] save failed", e);
      toast.error(t("readfix.toastFail"));
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return <p style={{ margin: "14px 0 0", fontSize: 12, color: muted }}>{t("readfix.done")}</p>;
  }

  const form = (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBlockStart: 10 }}>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t("readfix.placeholder")}
        aria-label={t("readfix.placeholder")}
        style={{
          inlineSize: "100%", padding: "12px 13px", borderRadius: RADIUS.card, fontFamily: "inherit",
          fontSize: 14, color: OB.ink, background: "#FFFFFF", border: `1px solid ${OB.line}`,
        }} />
      <button type="button" disabled={!text.trim() || saving} onClick={() => void save()} style={{
        padding: "11px 14px", borderRadius: RADIUS.card, cursor: "pointer", fontFamily: "inherit",
        fontSize: 13.5, fontWeight: 600, color: "#FFFFFF", background: OB.night, border: "none",
        opacity: !text.trim() || saving ? 0.6 : 1, transition: `opacity 200ms ${EASE}`,
      }}>{saving ? t("readfix.saving") : t("readfix.send")}</button>
    </div>
  );

  if (inline) {
    return (
      <>
        <button type="button" onClick={() => setOpen((v) => !v)} style={{
          background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit",
          fontSize: "inherit", color: "inherit", textDecoration: "underline",
        }}>{t("readfix.tell")}</button>
        {open ? form : null}
      </>
    );
  }

  return (
    <div style={{ marginBlockStart: 14 }}>
      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: muted }}>
        {t("readfix.intro")}{" "}
        {!open && (
          <button type="button" onClick={() => setOpen(true)} style={{
            background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit",
            fontSize: 12, textDecoration: "underline", color: onNight ? "#FFFFFF" : OB.blue,
          }}>{t("readfix.notMe")}</button>
        )}
      </p>
      {open ? form : null}
    </div>
  );
};

export default ReadCorrection;
