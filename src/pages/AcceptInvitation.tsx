import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AuraLogo from "@/components/brand/AuraLogo";
import usePageMeta from "@/hooks/usePageMeta";
import { supabase } from "@/integrations/supabase/client";

/**
 * Acceptance page — the ceremonial intermediate screen between the invite
 * email and the auth/password flow. Sees the user BEFORE Supabase processes
 * their invite token. On CTA click, we forward them to the Supabase verify
 * URL (preserved as `next` or reconstructed from `token`+`type`).
 */
export default function AcceptInvitation() {
  usePageMeta({
    title: "Aura — Accept your invitation",
    description: "You've been invited to join Aura — a personal intelligence system. Your expertise is invisible; Aura fixes that. Accept your invitation to set up your account.",
    path: "/accept-invitation",
  });
  const [params] = useSearchParams();
  const token = params.get("token");
  const type = params.get("type") || "invite";
  const next = params.get("next"); // pre-built verify URL (preferred)
  const errorParam = params.get("error") || params.get("error_description");

  // Page-load pre-check: resolve the token's real status before rendering.
  const [precheck, setPrecheck] = useState<"checking" | "ok" | "dead">("checking");

  const resolvedToken = useMemo(() => {
    if (token) return token;
    if (next) {
      try {
        const url = new URL(next, window.location.origin);
        return url.searchParams.get("token");
      } catch {
        return null;
      }
    }
    return null;
  }, [token, next]);

  useEffect(() => {
    let cancelled = false;
    if (errorParam) { setPrecheck("dead"); return; }
    if (!resolvedToken) { setPrecheck("dead"); return; }

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("check-invite-token", {
          body: { token: resolvedToken },
        });
        if (cancelled) return;
        if (error) {
          // FAIL-OPEN: checker hiccup must never block a real invitee.
          setPrecheck("ok");
          return;
        }
        const status = (data as { status?: string } | null)?.status;
        setPrecheck(status === "expired" || status === "not_found" ? "dead" : "ok");
      } catch {
        if (!cancelled) setPrecheck("ok"); // FAIL-OPEN
      }
    })();

    return () => { cancelled = true; };
  }, [resolvedToken, errorParam]);

  const isExpired = Boolean(errorParam) || precheck === "dead";

  // Build the URL the CTA forwards to.
  const ctaHref = useMemo(() => {
    if (next) return next;
    if (token) {
      const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || "";
      const redirectTo = `${window.location.origin}/auth`;
      return `${base}/auth/v1/verify?token=${encodeURIComponent(token)}&type=${encodeURIComponent(type)}&redirect_to=${encodeURIComponent(redirectTo)}`;
    }
    return "/request-access";
  }, [next, token, type]);

  const handleCtaClick = (e: React.MouseEvent) => {
    if (isExpired) return; // expired state uses a Link instead
    e.preventDefault();
    window.location.href = ctaHref;
  };

  const scrollToPanels = (e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById("tell-me-more");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="ai">
      <style>{ACCEPT_CSS}</style>

      {precheck === "checking" ? (
        <section className="ai-stage">
          <div className="ai-card">
            <div className="ai-eye ai-mark">
              <AuraLogo size={60} variant="light" />
            </div>
          </div>
        </section>
      ) : (
      <>
      {/* HERO — above the fold */}
      <section className="ai-stage">
        <div className="ai-card">
          <div className="ai-eye ai-mark">
            <AuraLogo size={60} variant="light" />
          </div>

          <div className="ai-eyebrow">
            <span>{isExpired ? "Invitation" : "Your invitation"}</span>
          </div>

          <h1 className="ai-headline">
            {isExpired
              ? "This invitation has expired."
              : "Your expertise deserves to be seen."}
          </h1>

          <p className="ai-subline">
            {isExpired
              ? "Invite links last 24 hours. You can request a fresh one — it only takes a moment."
              : "Aura is a personal intelligence system that converts what you already know into the digital presence your career demands."}
          </p>

          {isExpired ? (
            <Link to="/request-access" className="ai-cta">
              Request a new one →
            </Link>
          ) : (
            <>
              <a href={ctaHref} onClick={handleCtaClick} className="ai-cta">
                Let the world see what I know →
              </a>
              <div className="ai-secondary">
                <a href="#tell-me-more" onClick={scrollToPanels} className="ai-quiet">
                  Tell me more first ↓
                </a>
              </div>
            </>
          )}
        </div>
      </section>

      {/* TELL ME MORE — three panels */}
      {!isExpired && (
        <section id="tell-me-more" className="ai-more">
          <div className="ai-more-inner">
            <Panel
              num="01"
              title="You read 50 articles a week."
              body="But none of that knowledge reaches the people who should see it. Your insights stay in your head. Your competitors publish theirs."
            />
            <Panel
              num="02"
              title="Aura reads what you already read."
              body="Paste a link. Aura extracts the strategic signal, matches it to your expertise, and writes content in your voice — not generic AI."
            />
            <Panel
              num="03"
              title="10 minutes to set up. A career of visibility."
              body="No ghostwriter. No social media agency. Just your expertise, made visible — finally."
            />

            <div className="ai-more-cta">
              <a href={ctaHref} onClick={handleCtaClick} className="ai-cta ai-cta-static">
                Let the world see what I know →
              </a>
            </div>
          </div>
        </section>
      )}
      </>
      )}
    </div>
  );
}

function Panel({ num, title, body }: { num: string; title: string; body: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setVisible(true); return; }
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.3 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className={`ai-panel${visible ? " is-in" : ""}`}>
      <div className="ai-num">{num}</div>
      <h2 className="ai-ptitle">{title}</h2>
      <p className="ai-pbody">{body}</p>
    </div>
  );
}

const ACCEPT_CSS = `
.ai{
  --page:#F2F5F9; --n0:#FFFFFF; --n100:#EEF2F7; --n200:#E2E7EE;
  --n400:#98A2AE; --n500:#5B6673; --n900:#0F1519;
  --act:#0670C4; --cy-t:#00807B;
  --ui:'Inter',ui-sans-serif,system-ui,-apple-system,sans-serif;
  --ser:'Instrument Serif',Georgia,serif;
  --mono:'IBM Plex Mono',ui-monospace,Menlo,monospace;
  min-height:100vh; background:var(--page); color:var(--n900);
  font-family:var(--ui); font-size:16px; line-height:1.6;
  -webkit-font-smoothing:antialiased; overflow-x:hidden;
}
.ai *,.ai *::before,.ai *::after{box-sizing:border-box;}
.ai p,.ai h1,.ai h2{margin:0;padding:0;}
.ai a{color:inherit;text-decoration:none;}
.ai :focus-visible{outline:2px solid var(--act);outline-offset:3px;border-radius:8px;}

.ai-stage{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:40px 20px;}
.ai-card{
  width:100%;max-width:560px;background:var(--n0);border:1px solid var(--n200);
  border-radius:26px;padding:clamp(28px,6vw,52px);text-align:center;
}
.ai-mark{display:inline-flex;margin-bottom:22px;}
.ai-mark span{color:#0F1519 !important;}
.ai-eyebrow{
  font-family:var(--mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;
  color:var(--n400);margin-bottom:14px;
}
.ai-headline{
  font-family:var(--ser);font-weight:400;font-size:clamp(28px,5.2vw,40px);
  line-height:1.12;letter-spacing:-.02em;color:var(--n900);margin:0 0 16px;
}
.ai-subline{font-size:16px;line-height:1.65;color:var(--n500);margin:0 auto 30px;max-width:400px;}
.ai .ai-cta{
  display:inline-flex;align-items:center;justify-content:center;
  width:100%;max-width:400px;min-height:48px;padding:12px 22px;
  background:var(--n900);color:var(--n0);border-radius:999px;border:0;
  font-family:var(--ui);font-size:15px;font-weight:600;letter-spacing:.01em;cursor:pointer;
  transition:background .18s ease, transform .18s ease;
}
.ai .ai-cta:hover{background:#000000;transform:translateY(-2px);}
.ai .ai-quiet{font-size:14px;color:var(--n500);}
.ai .ai-quiet:hover{color:var(--act);}
.ai-secondary{margin-top:18px;}

.ai-more{background:var(--n100);padding:88px 20px 110px;}
.ai-more-inner{max-width:560px;margin:0 auto;display:flex;flex-direction:column;gap:20px;}
.ai-panel{
  background:var(--n0);border:1px solid var(--n200);border-radius:18px;
  padding:clamp(20px,4vw,28px);
  opacity:0;transform:translateY(20px);
  transition:opacity 600ms ease-out, transform 600ms ease-out;
}
.ai-panel.is-in{opacity:1;transform:translateY(0);}
.ai-num{font-family:var(--mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--n400);margin-bottom:10px;}
.ai-ptitle{font-family:var(--ser);font-weight:400;font-size:21px;line-height:1.25;color:var(--n900);margin:0 0 10px;letter-spacing:-.01em;}
.ai-pbody{font-size:15px;line-height:1.65;color:var(--n500);margin:0;}
.ai-more-cta{margin-top:24px;text-align:center;}

@keyframes ai-eye-in { from { opacity: 0; transform: scale(0.5); } to { opacity: 1; transform: scale(1); } }
@keyframes ai-eye-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.8; } }
@keyframes ai-fade-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
@keyframes ai-fade-up-scale { from { opacity: 0; transform: translateY(20px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }

.ai .ai-eye{opacity:0;animation: ai-eye-in 600ms ease-out 800ms forwards, ai-eye-pulse 3s ease-in-out 1400ms infinite;}
.ai .ai-eyebrow{opacity:0;animation: ai-fade-up 400ms ease-out 1400ms forwards;}
.ai .ai-headline{opacity:0;animation: ai-fade-up 500ms ease-out 1600ms forwards;}
.ai .ai-subline{opacity:0;animation: ai-fade-up 400ms ease-out 2400ms forwards;}
.ai .ai-card .ai-cta{opacity:0;animation: ai-fade-up-scale 400ms ease-out 3200ms forwards;}
.ai .ai-secondary{opacity:0;animation: ai-fade-up 300ms ease-out 3600ms forwards;}
.ai .ai-cta-static{opacity:1;animation:none;}

@media (prefers-reduced-motion: reduce) {
  .ai .ai-eye, .ai .ai-eyebrow, .ai .ai-headline, .ai .ai-subline, .ai .ai-card .ai-cta, .ai .ai-secondary {
    animation: none;
    opacity: 1;
  }
  .ai-panel{transition:none;}
}
`;
