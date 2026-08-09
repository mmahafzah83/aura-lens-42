/**
 * LinkedIn import — the automatic way to teach Aura a member's voice.
 *
 * The member confirms their profile address once; the `linkedin-fetch-posts`
 * edge function reads their own posts with their session JWT. Paste/upload
 * stays available as the manual fallback.
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/* System-B tokens */
const BLUE = "#0670C4";
const BLUE_DARK = "#04477C";
const LINE = "#E2E7EE";
const MUTED = "#5B6673";
const INK = "#0F1519";
const RED = "#C0392B";

const COPY = {
  en: {
    heading: "One more link — your profile address",
    body: "Connecting LinkedIn lets Aura see your numbers and post for you. It doesn't hand over the words you've written — your profile address does. Confirm it, and Aura learns your voice from your own posts, so every draft reads like you wrote it. One field, once — then it's automatic.",
    cta: "Confirm and read my posts",
    loading: "Reading your posts…",
    progress: "This can take up to a minute and a half. You can leave this open.",
    result: (n: number) => `Aura read ${n} of your posts.`,
    usePhoto: "Use this photo",
    photoSaved: "Photo updated.",
  },
  ar: {
    heading: "خطوة أخيرة — رابط ملفك على LinkedIn",
    body: "ربط LinkedIn يُطلع Aura على أرقامك ويتيح النشر نيابةً عنك، لكنه لا يمنحها نصوص ما كتبت — رابط ملفك يفعل. أكِّده لتتعلّم Aura صوتك من منشوراتك أنت، فيخرج كل مسودّة بصوتك. حقلٌ واحد، مرّة واحدة — ثم يصبح تلقائياً.",
    cta: "أكِّد واقرأ منشوراتي",
    loading: "نقرأ منشوراتك…",
    progress: "قد يستغرق هذا حتى دقيقة ونصف. يمكنك ترك الصفحة مفتوحة.",
    result: (n: number) => `قرأت Aura ${n} من منشوراتك.`,
    usePhoto: "استخدم هذه الصورة",
    photoSaved: "تم تحديث الصورة.",
  },
} as const;

const isProfileUrl = (v: string) => /linkedin\.com\/in\/[^/\s?]+/i.test(v);

const LinkedInImportCard = ({ onImported }: { onImported?: (summary: any) => void } = {}) => {
  const [lang, setLang] = useState<"en" | "ar">("en");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  const t = COPY[lang];
  const isAr = lang === "ar";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) return;

      const [{ data: conn }, { data: voice }] = await Promise.all([
        supabase.from("linkedin_connections").select("handle, profile_url").eq("user_id", uid).maybeSingle(),
        supabase.from("authority_voice_profiles").select("language, is_primary").eq("user_id", uid),
      ]);
      if (cancelled) return;

      const primary = Array.isArray(voice) ? (voice.find((v: any) => v?.is_primary) || voice[0]) : null;
      if ((primary as any)?.language === "ar") setLang("ar");

      const handle = typeof conn?.handle === "string" ? conn.handle.trim() : "";
      const stored = typeof conn?.profile_url === "string" ? conn.profile_url.trim() : "";
      if (handle) setUrl(`https://www.linkedin.com/in/${handle}`);
      else if (isProfileUrl(stored)) setUrl(stored);
    })();
    return () => { cancelled = true; };
  }, []);

  const submit = useCallback(async () => {
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("linkedin-fetch-posts", {
        body: { profile_url: url.trim() },
      });
      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(String(data.error));
      setResult(data);
      onImported?.(data);
    } catch (e: any) {
      const message = typeof e?.message === "string" && e.message
        ? e.message.split("\n")[0]
        : isAr ? "تعذّرت قراءة منشوراتك. تحقّق من الرابط وحاول مجدداً."
               : "Couldn't read your posts. Check the address and try again.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }, [url, onImported, isAr]);

  const useAvatar = async () => {
    const avatar = result?.author?.avatar_url;
    if (!avatar) return;
    setPhotoBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) throw new Error("Not signed in");
      const { error: updateError } = await supabase
        .from("diagnostic_profiles")
        .update({ avatar_url: avatar })
        .eq("user_id", session.user.id);
      if (updateError) throw updateError;
      toast.success(t.photoSaved);
    } catch (e: any) {
      setError(e?.message || "Couldn't save that photo");
    } finally {
      setPhotoBusy(false);
    }
  };

  return (
    <div
      dir={isAr ? "rtl" : "ltr"}
      style={{
        background: "#FFFFFF", border: `1px solid ${LINE}`, borderRadius: 20, padding: 18,
        fontFamily: isAr ? "'CairoAR', 'Cairo', Inter, sans-serif" : "Inter, system-ui, sans-serif",
        color: INK,
      }}
    >
      <h4 style={{ fontSize: 15.5, fontWeight: 600, margin: 0, lineHeight: 1.4 }}>{t.heading}</h4>
      <p style={{ fontSize: 13, lineHeight: isAr ? 1.9 : 1.65, color: MUTED, marginBlock: "8px 14px" }}>{t.body}</p>

      <input
        dir="ltr"
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="linkedin.com/in/yourname"
        disabled={busy}
        style={{
          inlineSize: "100%", border: `1px solid ${LINE}`, borderRadius: 12, padding: "11px 12px",
          fontSize: 13.5, color: INK, background: busy ? "#F2F5F9" : "#FFFFFF",
        }}
      />

      <button
        type="button"
        onClick={submit}
        disabled={busy || url.trim().length === 0}
        style={{
          marginBlockStart: 12, inlineSize: "100%", padding: "11px 18px", borderRadius: 12, border: "none",
          background: BLUE, color: "#FFFFFF", fontSize: 13.5, fontWeight: 600,
          cursor: busy || !url.trim() ? "default" : "pointer", opacity: busy || !url.trim() ? 0.6 : 1,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}
        onMouseEnter={(e) => { if (!busy) (e.currentTarget as HTMLButtonElement).style.background = BLUE_DARK; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = BLUE; }}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : null}
        {busy ? t.loading : t.cta}
      </button>

      {busy && (
        <p style={{ fontSize: 12, color: MUTED, marginBlockStart: 10 }}>{t.progress}</p>
      )}

      {error && (
        <p style={{ fontSize: 12.5, color: RED, marginBlockStart: 10, lineHeight: 1.6 }}>{error}</p>
      )}

      {result && typeof result.kept_own_text === "number" && (
        <div style={{ marginBlockStart: 14, borderBlockStart: `1px solid ${LINE}`, paddingBlockStart: 12 }}>
          <p style={{ fontSize: 13, color: INK, margin: 0 }}>{t.result(result.kept_own_text)}</p>

          {result?.author?.avatar_url && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBlockStart: 10, flexWrap: "wrap" }}>
              <img
                src={result.author.avatar_url}
                alt={result?.author?.name ? `${result.author.name} on LinkedIn` : "LinkedIn profile photo"}
                loading="lazy"
                style={{ inlineSize: 40, blockSize: 40, borderRadius: "50%", objectFit: "cover", border: `1px solid ${LINE}` }}
              />
              <button
                type="button"
                onClick={useAvatar}
                disabled={photoBusy}
                style={{
                  padding: "8px 12px", borderRadius: 10, border: `1px solid ${LINE}`, background: "#FFFFFF",
                  color: INK, fontSize: 12.5, cursor: photoBusy ? "default" : "pointer",
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                {photoBusy ? <Loader2 size={12} className="animate-spin" /> : null}
                {t.usePhoto}
              </button>
            </div>
          )}

          {result?.author?.headline && (
            <p dir="auto" style={{ fontSize: 12.5, color: MUTED, marginBlockStart: 8, lineHeight: 1.6 }}>
              {result.author.headline}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default LinkedInImportCard;
