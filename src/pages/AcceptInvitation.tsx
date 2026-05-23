import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AuraLogo from "@/components/brand/AuraLogo";
import usePageMeta from "@/hooks/usePageMeta";

/**
 * Acceptance page — the ceremonial intermediate screen between the invite
 * email and the auth/password flow. Sees the user BEFORE Supabase processes
 * their invite token. On CTA click, we forward them to the Supabase verify
 * URL (preserved as `next` or reconstructed from `token`+`type`).
 */
export default function AcceptInvitation() {
  usePageMeta({
    title: "Aura — Accept your invitation",
    description: "You've been invited to join Aura, the strategic intelligence OS for senior professionals. Accept your invitation to set up your account.",
    path: "/accept-invitation",
  });
  const [params] = useSearchParams();
  const token = params.get("token");
  const type = params.get("type") || "invite";
  const next = params.get("next"); // pre-built verify URL (preferred)
  const errorParam = params.get("error") || params.get("error_description");
  const isExpired = Boolean(errorParam);

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
    <div
      style={{
        background: "#0d0d0d",
        color: "#ededed",
        minHeight: "100vh",
        fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <style>{ACCEPT_CSS}</style>

      {/* HERO — above the fold */}
      <section
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px 20px",
        }}
      >
        <div style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>
          <div className="ai-eye" style={{ display: "inline-flex", marginBottom: 28 }}>
            <AuraLogo size={60} variant="dark" />
          </div>

          <h1
            className="ai-headline"
            style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontWeight: 400,
              lineHeight: 1.2,
              color: "#ffffff",
              margin: "0 0 18px",
            }}
          >
            {isExpired
              ? "This invitation has expired."
              : "Your expertise deserves to be seen."}
          </h1>

          <p
            className="ai-subline"
            style={{
              fontSize: 16,
              lineHeight: 1.6,
              color: "rgba(237,237,237,0.65)",
              margin: "0 auto 32px",
              maxWidth: 380,
            }}
          >
            {isExpired
              ? "Invite links last 48 hours. You can request a fresh one — it only takes a moment."
              : "Aura is a personal intelligence system that converts what you already know into the digital presence your career demands."}
          </p>

          {isExpired ? (
            <Link
              to="/request-access"
              className="ai-cta"
              style={primaryButtonStyle}
            >
              Request a new one →
            </Link>
          ) : (
            <>
              <a
                href={ctaHref}
                onClick={handleCtaClick}
                className="ai-cta"
                style={primaryButtonStyle}
              >
                Let the world see what I know →
              </a>
              <div className="ai-secondary" style={{ marginTop: 18 }}>
                <a
                  href="#tell-me-more"
                  onClick={scrollToPanels}
                  style={{
                    fontSize: 14,
                    color: "rgba(237,237,237,0.5)",
                    textDecoration: "none",
                  }}
                >
                  Tell me more first ↓
                </a>
              </div>
            </>
          )}
        </div>
      </section>

      {/* TELL ME MORE — three panels */}
      {!isExpired && (
        <section
          id="tell-me-more"
          style={{
            background: "#111110",
            padding: "100px 20px 120px",
          }}
        >
          <div style={{ maxWidth: 480, margin: "0 auto" }}>
            <Panel
              num="01"
              title="You read 50 articles a week."
              body="But none of that knowledge reaches the people who should see it. Your insights stay in your head. Your competitors publish theirs."
            />
            <div style={{ height: 80 }} />
            <Panel
              num="02"
              title="Aura reads what you already read."
              body="Paste a link. Aura extracts the strategic signal, matches it to your expertise, and writes content in your voice — not generic AI."
            />
            <div style={{ height: 80 }} />
            <Panel
              num="03"
              title="10 minutes to set up. A career of visibility."
              body="No ghostwriter. No social media agency. Just your expertise, made visible — finally."
            />

            <div style={{ height: 64 }} />
            <div style={{ textAlign: "center" }}>
              <a
                href={ctaHref}
                onClick={handleCtaClick}
                style={primaryButtonStyle}
              >
                Let the world see what I know →
              </a>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

const BRAND = "#B08D3A";

const primaryButtonStyle: React.CSSProperties = {
  display: "inline-block",
  width: "100%",
  maxWidth: 400,
  background: BRAND,
  color: "#ffffff",
  height: 48,
  lineHeight: "48px",
  borderRadius: 8,
  fontSize: 15,
  fontWeight: 600,
  textDecoration: "none",
  textAlign: "center",
  border: 0,
  cursor: "pointer",
  letterSpacing: "0.01em",
};

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
    <div
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(20px)",
        transition: "opacity 600ms ease-out, transform 600ms ease-out",
      }}
    >
      <div style={{ fontSize: 12, letterSpacing: "2px", color: BRAND, marginBottom: 12, fontWeight: 600 }}>
        {num}
      </div>
      <h2 style={{ fontSize: 18, color: "#ffffff", fontWeight: 700, margin: "0 0 12px", lineHeight: 1.35 }}>
        {title}
      </h2>
      <p style={{ fontSize: 14, color: "#999", lineHeight: 1.65, margin: 0, maxWidth: 400 }}>
        {body}
      </p>
    </div>
  );
}

const ACCEPT_CSS = `
@keyframes ai-eye-in { from { opacity: 0; transform: scale(0.5); } to { opacity: 1; transform: scale(1); } }
@keyframes ai-eye-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.8; } }
@keyframes ai-fade-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
@keyframes ai-fade-up-scale { from { opacity: 0; transform: translateY(20px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }

.ai-eye {
  opacity: 0;
  animation: ai-eye-in 600ms ease-out 800ms forwards, ai-eye-pulse 3s ease-in-out 1400ms infinite;
}
.ai-headline {
  font-size: 32px;
  opacity: 0;
  animation: ai-fade-up 500ms ease-out 1600ms forwards;
}
@media (max-width: 600px) {
  .ai-headline { font-size: 26px; }
}
.ai-subline {
  opacity: 0;
  animation: ai-fade-up 400ms ease-out 2400ms forwards;
}
.ai-cta {
  opacity: 0;
  animation: ai-fade-up-scale 400ms ease-out 3200ms forwards;
}
.ai-secondary {
  opacity: 0;
  animation: ai-fade-up 300ms ease-out 3600ms forwards;
}

@media (prefers-reduced-motion: reduce) {
  .ai-eye, .ai-headline, .ai-subline, .ai-cta, .ai-secondary {
    animation: none;
    opacity: 1;
  }
}
`;