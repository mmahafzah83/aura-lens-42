import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Download, Linkedin, Loader2, CheckCircle2, Circle } from "lucide-react";
import AuraCard, { type AuraCardVariant } from "@/components/AuraCard";
import { downloadBlob } from "@/lib/download";

// Colors read from CSS variables where possible; safe fallbacks preserve calm bone look
// even before the page's tokens hydrate. No hardcoded names/scores anywhere.
const RULE = "var(--rule, rgba(27,23,18,0.14))";
const INK = "var(--ink, #1B1712)";
const INK_2 = "var(--ink-2, rgba(27,23,18,0.68))";
const INK_3 = "var(--ink-3, rgba(27,23,18,0.48))";
const PAPER = "var(--paper, #F1ECE1)";
const SPOT = "var(--spot, #7A1F2B)";
const SERIF = "var(--font-display, 'Newsreader', Georgia, serif)";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

// Skills variant is parked while we rework it. Flip to true to bring back
// the VOICE / SKILLS toggle and render both variants.
const SHOW_SKILLS = false;

interface Readiness {
  assessment: boolean;
  skills: boolean;
  photo: boolean;
  country: boolean;
  loaded: boolean;
}

interface Props {
  onNavigateAssessment?: () => void;
  onNavigateAudit?: () => void;
  onNavigatePhoto?: () => void;
  onNavigateSettings?: () => void;
  dir?: "ltr" | "rtl";
}

export default function AuraCardPanel({
  onNavigateAssessment,
  onNavigateAudit,
  onNavigatePhoto,
  onNavigateSettings,
  dir,
}: Props) {
  const [variant, setVariant] = useState<AuraCardVariant>("voice");
  const [readiness, setReadiness] = useState<Readiness>({
    assessment: false, skills: false, photo: false, country: false, loaded: false,
  });
  const [busy, setBusy] = useState<null | "png" | "share">(null);
  const [readyAt, setReadyAt] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const celebrateFiredRef = useRef(false);
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { if (!cancelled) setReadiness((s) => ({ ...s, loaded: true })); return; }
      const { data } = await (supabase.from("diagnostic_profiles" as any) as any)
        .select("brand_assessment_completed_at, audit_completed_at, avatar_url, country_code, aura_card_ready_at")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (cancelled) return;
      const p: any = data || {};
      setReadiness({
        assessment: !!p.brand_assessment_completed_at,
        skills: !!p.audit_completed_at,
        photo: !!p.avatar_url,
        country: !!p.country_code,
        loaded: true,
      });
      setReadyAt(p.aura_card_ready_at ?? null);
    })();
    return () => { cancelled = true; };
  }, []);

  const allReady = readiness.assessment && readiness.skills && readiness.photo && readiness.country;

  // First time all 4 gates flip green AND we've never marked it before: celebrate once.
  useEffect(() => {
    if (!readiness.loaded) return;
    if (!allReady) return;
    if (readyAt) return;
    if (celebrateFiredRef.current) return;
    celebrateFiredRef.current = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const uid = session?.user?.id;
        if (!uid) return;
        const nowIso = new Date().toISOString();
        const { error } = await (supabase.from("diagnostic_profiles" as any) as any)
          .update({ aura_card_ready_at: nowIso })
          .eq("user_id", uid)
          .is("aura_card_ready_at", null);
        if (error) return;
        setReadyAt(nowIso);
        setCelebrate(true);
        // Fire-and-forget lifecycle email
        supabase.functions.invoke("send-lifecycle-email", {
          body: { user_id: uid, email_type: "aura_card_ready" },
        }).catch(() => {});
      } catch { /* ignore */ }
    })();
  }, [readiness.loaded, allReady, readyAt]);

  // ── PNG via html2canvas (same primitive every export path in this app uses) ──
  const renderCanvas = async (): Promise<HTMLCanvasElement> => {
    const el = mountRef.current;
    if (!el) throw new Error("Card not mounted");
    const { default: html2canvas } = await import("html2canvas");
    try {
      if ((document as any).fonts?.ready) await (document as any).fonts.ready;
    } catch { /* ignore */ }
    return await html2canvas(el, { scale: 2, backgroundColor: null, useCORS: true, logging: false });
  };

  const downloadPng = async () => {
    if (busy) return;
    setBusy("png");
    try {
      const c = await renderCanvas();
      const blob: Blob | null = await new Promise((res) => c.toBlob((b) => res(b), "image/png", 1));
      if (!blob) throw new Error("Could not render image");
      downloadBlob(blob, `aura-card-${variant}.png`);
    } catch (e: any) {
      toast.error(e?.message || "PNG export failed");
    } finally { setBusy(null); }
  };

  // Reuse the SAME publish path Composer/FlashPanel/AuthorityTab use:
  // insert a linkedin_posts draft (with source_metadata.image_url), then
  // invoke the `linkedin-publish` edge function. The edge function already
  // supports image_url — see supabase/functions/linkedin-publish/index.ts.
  const shareToLinkedIn = async () => {
    if (busy) return;
    setBusy("share");
    setShareError(null);
    let insertedId: string | null = null;
    let uidForLog: string | null = null;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) throw new Error("Sign in first");
      const uid = session.user.id;
      uidForLog = uid;

      const c = await renderCanvas();
      const blob: Blob | null = await new Promise((res) => c.toBlob((b) => res(b), "image/png", 1));
      if (!blob) throw new Error("Could not render image");

      // Upload to the existing public capture-images bucket so LinkedIn can fetch it.
      const path = `${uid}/aura-card/${Date.now()}-${variant}.png`;
      const { error: upErr } = await supabase.storage
        .from("capture-images")
        .upload(path, blob, { contentType: "image/png", upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("capture-images").getPublicUrl(path);
      const imageUrl = pub.publicUrl;

      const caption =
        variant === "voice"
          ? "My Aura card — the topic I'm building a voice in. Measured by Aura."
          : "My Aura card — the capabilities I'm strongest in. Measured by Aura.";

      const { data: ins, error: insErr } = await supabase
        .from("linkedin_posts")
        .insert({
          user_id: uid,
          post_text: caption,
          content_type: "post",
          format_type: "post",
          source_type: "aura_generated",
          authorship: "aura_drafted",
          acquisition: "published_via_aura",
          tracking_status: "draft",
          source_metadata: { origin: "aura_card", variant, image_url: imageUrl },
        })
        .select("id")
        .single();
      if (insErr) throw insErr;
      insertedId = (ins as any)?.id ?? null;

      // Stamp publish intent BEFORE invoking so a client-side failure between
      // stamp and invoke still leaves the marker for completion-invariants-check.
      await supabase
        .from("linkedin_posts")
        .update({ publish_attempted_at: new Date().toISOString() })
        .eq("id", (ins as any).id);

      const { data, error } = await supabase.functions.invoke("linkedin-publish", {
        body: { postId: (ins as any).id },
      });
      if (error) throw error;
      if (!(data as any)?.success) {
        const msg = (data as any)?.error || "Publish failed";
        throw new Error(/not connected/i.test(msg) ? "Connect LinkedIn in Settings first." : msg);
      }
      const url = (data as any).postUrl;
      toast.success(
        "Shared to LinkedIn",
        url ? { action: { label: "View post", onClick: () => window.open(url, "_blank") } } : undefined,
      );
    } catch (e: any) {
      const message = e?.message || "Couldn't share to LinkedIn";
      // 1. Retire the orphan (rename tracking_status → 'failed'). Wrapped so a
      //    failure here cannot mask the original error.
      if (insertedId) {
        try {
          await supabase
            .from("linkedin_posts")
            .update({
              tracking_status: "failed",
              source_metadata: {
                origin: "aura_card",
                variant,
                publish_error: String(message).slice(0, 500),
                failed_at: new Date().toISOString(),
              },
            })
            .eq("id", insertedId);
        } catch { /* swallow: never let retire mask the real error */ }
      }
      // 2. Log server-side — a client failure that leaves a DB row must leave
      //    an ef_error_log row. Wrapped for the same reason.
      try {
        await (supabase.from("ef_error_log" as any) as any).insert({
          function_name: "aura-card-share",
          severity: "high",
          error_message: String(message).slice(0, 1000),
          user_id: uidForLog,
          context: { post_id: insertedId, variant },
        });
      } catch { /* swallow */ }
      // 3. Persistent inline error — replaces the vanishing toast.
      setShareError(message);
    } finally { setBusy(null); }
  };

  // ── Readiness item helper ──
  const items = useMemo(() => [
    {
      key: "assessment",
      label: "Brand assessment",
      done: readiness.assessment,
      hint: "Take the Brand Assessment in My Story.",
      action: onNavigateAssessment,
      actionLabel: "Take the assessment",
    },
    {
      key: "skills",
      label: "Skills radar",
      done: readiness.skills,
      hint: "Calibrate your capability radar.",
      action: onNavigateAudit,
      actionLabel: "Calibrate skills",
    },
    {
      key: "photo",
      label: "Profile photo",
      done: readiness.photo,
      hint: "Add a profile photo.",
      action: onNavigatePhoto,
      actionLabel: "Add photo",
    },
    {
      key: "country",
      label: "Country",
      done: readiness.country,
      hint: "Set your country in Settings.",
      action: onNavigateSettings,
      actionLabel: "Open Settings",
    },
  ], [readiness, onNavigateAssessment, onNavigateAudit, onNavigatePhoto, onNavigateSettings]);

  return (
    <section
      dir={dir}
      style={{
        border: `1px solid ${RULE}`,
        background: PAPER,
        padding: "22px 22px 20px",
        marginTop: 24,
      }}
      aria-label="Your Aura Card"
    >
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.18em", color: INK_3, textTransform: "uppercase" }}>
            Your Aura Card
          </div>
          <div style={{ fontFamily: SERIF, fontSize: 20, color: INK, marginTop: 4 }}>
            A shareable read of who you are, in one card
          </div>
        </div>

        {/* Voice / Skills toggle */}
        {SHOW_SKILLS && (
          <div role="tablist" aria-label="Card variant" style={{ display: "inline-flex", border: `1px solid ${RULE}`, background: "transparent" }}>
            {(["voice", "skills"] as const).map((v) => {
              const active = variant === v;
              return (
                <button
                  key={v}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setVariant(v)}
                  style={{
                    fontFamily: MONO, fontSize: 11, letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    padding: "8px 14px",
                    background: active ? INK : "transparent",
                    color: active ? PAPER : INK_2,
                    border: 0, cursor: "pointer",
                  }}
                >
                  {v}
                </button>
              );
            })}
          </div>
        )}
      </header>

      {!readiness.loaded ? (
        <div style={{ fontFamily: SERIF, fontStyle: "italic", color: INK_3, padding: "16px 0" }}>
          Loading your card…
        </div>
      ) : allReady ? (
        <>
          {celebrate && (
            <div
              role="status"
              style={{
                border: `1px solid ${RULE}`,
                background: "rgba(122,31,43,0.06)",
                padding: "12px 14px",
                marginBottom: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div style={{ fontFamily: SERIF, fontSize: 16, color: INK }}>
                🎉 Your Aura Card is ready
              </div>
              <button
                onClick={() => setCelebrate(false)}
                aria-label="Dismiss"
                style={{
                  fontFamily: MONO, fontSize: 10, letterSpacing: "0.12em",
                  textTransform: "uppercase", color: INK_2,
                  background: "transparent", border: 0, cursor: "pointer",
                }}
              >
                Dismiss
              </button>
            </div>
          )}
          {shareError && (
            <div
              role="alert"
              style={{
                border: `1px solid ${SPOT}`,
                background: "rgba(122,31,43,0.06)",
                padding: "12px 14px",
                marginBottom: 14,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.18em", color: SPOT, textTransform: "uppercase" }}>
                  Not posted to LinkedIn
                </div>
                <button
                  onClick={() => setShareError(null)}
                  aria-label="Dismiss"
                  style={{
                    fontFamily: MONO, fontSize: 10, letterSpacing: "0.12em",
                    textTransform: "uppercase", color: INK_2,
                    background: "transparent", border: 0, cursor: "pointer",
                  }}
                >
                  Dismiss
                </button>
              </div>
              <p style={{ margin: 0, fontFamily: SERIF, fontSize: 15, color: INK }}>
                {/not connected/i.test(shareError)
                  ? "Your card wasn't posted. Connect LinkedIn in Settings, then try again."
                  : `Your card wasn't posted. ${shareError}`}
              </p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <ActionButton
                  onClick={() => { setShareError(null); void shareToLinkedIn(); }}
                  disabled={!!busy}
                  icon={busy === "share" ? <Loader2 className="animate-spin" size={14} /> : <Linkedin size={14} />}
                  primary
                >
                  Try again
                </ActionButton>
                <ActionButton
                  onClick={downloadPng}
                  disabled={!!busy}
                  icon={busy === "png" ? <Loader2 className="animate-spin" size={14} /> : <Download size={14} />}
                >
                  Download PNG
                </ActionButton>
              </div>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 18px" }}>
            <div ref={mountRef} data-report-page style={{ background: "transparent" }}>
              <AuraCard variant={variant} />
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "flex-end", borderTop: `1px solid ${RULE}`, paddingTop: 14 }}>
            <ActionButton onClick={downloadPng} disabled={!!busy} icon={busy === "png" ? <Loader2 className="animate-spin" size={14} /> : <Download size={14} />}>
              Download PNG
            </ActionButton>
            <ActionButton onClick={shareToLinkedIn} disabled={!!busy} icon={busy === "share" ? <Loader2 className="animate-spin" size={14} /> : <Linkedin size={14} />} primary>
              Share to LinkedIn
            </ActionButton>
          </div>
        </>
      ) : (
        <div>
          <div style={{ fontFamily: SERIF, fontStyle: "italic", color: INK_2, marginBottom: 12 }}>
            Four steps until your card is ready.
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {items.map((it) => (
              <li key={it.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: `1px solid ${RULE}` }}>
                <span aria-hidden style={{ color: it.done ? SPOT : INK_3, display: "inline-flex" }}>
                  {it.done ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                </span>
                <span style={{ fontFamily: SERIF, fontSize: 15, color: INK, flex: 1 }}>{it.label}</span>
                {!it.done && it.action && (
                  <button
                    onClick={it.action}
                    style={{
                      fontFamily: MONO, fontSize: 11, letterSpacing: "0.1em",
                      textTransform: "uppercase", color: SPOT, background: "transparent",
                      border: 0, cursor: "pointer", padding: "6px 8px",
                    }}
                  >
                    {it.actionLabel} →
                  </button>
                )}
                {it.done && (
                  <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.12em", color: INK_3, textTransform: "uppercase" }}>
                    Done
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ActionButton({
  children, onClick, disabled, icon, primary,
}: { children: React.ReactNode; onClick: () => void; disabled?: boolean; icon?: React.ReactNode; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        fontFamily: MONO, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase",
        padding: "10px 14px",
        border: `1px solid ${primary ? INK : RULE}`,
        background: primary ? INK : "transparent",
        color: primary ? PAPER : INK,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {icon}<span>{children}</span>
    </button>
  );
}