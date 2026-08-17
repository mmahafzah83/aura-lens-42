/**
 * /r/:token — the public destination of a minted share link.
 *
 * Public, ungated, anon-callable. The only data call is the
 * `get_shared_read` RPC; no table is queried directly.
 *
 * NOTE ON PREVIEWS: this is a Vite SPA, so the head tags written below are
 * set client-side after hydration. Crawlers (WhatsApp, LinkedIn, Slack) read
 * only the static index.html and will therefore show the site-level card
 * until the app is prerendered or server-rendered. The page itself is correct
 * for every human who clicks the link.
 */
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { OB, RADIUS } from "@/components/onboarding/tokens";

type SharedRead = {
  headline: string | null;
  archetype: string | null;
  market_read: string | null;
  subjects: unknown;
  own_words: string | null;
  lang: string | null;
  display_name: string | null;
};

const mono = (size: number): React.CSSProperties => ({
  fontFamily: OB.mono,
  fontSize: size,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
});

function setMeta(selector: string, attr: "property" | "name", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      minHeight: "100dvh",
      background: OB.night,
      color: OB.white,
      fontFamily: OB.ui,
      overflowX: "hidden",
      padding: "28px 20px 56px",
    }}
  >
    <div style={{ maxWidth: 640, margin: "0 auto", width: "100%" }}>{children}</div>
  </div>
);

const PrimaryButton = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      width: "100%",
      minBlockSize: 48,
      padding: "14px 20px",
      borderRadius: RADIUS.pill,
      border: "none",
      background: OB.white,
      color: OB.night,
      fontFamily: OB.ui,
      fontSize: 16,
      fontWeight: 600,
      cursor: "pointer",
    }}
  >
    {label}
  </button>
);

export default function SharedRead() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<"loading" | "gone" | "ready">("loading");
  const [read, setRead] = useState<SharedRead | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!token) { setState("gone"); return; }
      const { data, error } = await supabase.rpc("get_shared_read", { p_token: token });
      if (!alive) return;
      const row = Array.isArray(data) ? (data[0] as SharedRead | undefined) : (data as SharedRead | null);
      if (error || !row) { setState("gone"); return; }
      setRead(row);
      setState("ready");
    })();
    return () => { alive = false; };
  }, [token]);

  useEffect(() => {
    if (state !== "ready" || !read) return;
    const title = `${read.archetype ?? "A read"} — a read from Aura`;
    const desc = read.market_read?.slice(0, 155) ?? "A read from Aura.";
    document.title = title;
    setMeta('meta[property="og:title"]', "property", "og:title", title);
    setMeta('meta[property="og:description"]', "property", "og:description", desc);
    setMeta('meta[name="twitter:title"]', "name", "twitter:title", title);
  }, [state, read]);

  const subjects = useMemo<string[]>(() => {
    const raw = read?.subjects;
    if (Array.isArray(raw)) return raw.filter((s): s is string => typeof s === "string" && !!s.trim());
    return [];
  }, [read]);

  const firstName = (read?.display_name ?? "").trim().split(/\s+/)[0] || "";
  const isArabic = read?.lang === "ar";

  if (state === "loading") {
    return (
      <Shell>
        <div style={{ paddingTop: 80, display: "grid", gap: 16 }}>
          {[70, 100, 88].map((w, i) => (
            <div
              key={i}
              style={{
                height: i === 1 ? 34 : 14,
                width: `${w}%`,
                borderRadius: RADIUS.chip,
                background: OB.nightSoft,
                animation: "aura-quiet-pulse 1.6s ease-in-out infinite",
                animationDelay: `${i * 0.16}s`,
              }}
            />
          ))}
          <style>{`@keyframes aura-quiet-pulse{0%,100%{opacity:.45}50%{opacity:1}}`}</style>
        </div>
      </Shell>
    );
  }

  if (state === "gone") {
    return (
      <Shell>
        <div style={{ paddingTop: 96, display: "grid", gap: 24 }}>
          <div style={{ ...mono(11), color: OB.mutedNight }}>A READ FROM AURA</div>
          <p style={{ fontSize: 24, fontWeight: 600, lineHeight: 1.3, margin: 0 }}>
            This read is no longer shared.
          </p>
          <PrimaryButton label="Get your own read" onClick={() => navigate("/assessment")} />
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div style={{ ...mono(11), color: OB.mutedNight }}>A READ FROM AURA</div>

      {firstName && (
        <div dir="auto" style={{ marginTop: 10, color: OB.mutedNight, fontSize: 15 }}>
          {firstName}'s read
        </div>
      )}

      <h1
        dir="auto"
        style={{
          marginTop: 18,
          marginBottom: 0,
          fontFamily: OB.ui,
          fontWeight: 700,
          fontSize: "clamp(30px, 9vw, 46px)",
          lineHeight: 1.05,
          letterSpacing: "-0.02em",
        }}
      >
        {read?.archetype || read?.headline || "A read from Aura"}
      </h1>

      {read?.market_read && (
        <p
          dir="auto"
          style={{
            marginTop: 20,
            maxWidth: "60ch",
            fontSize: 17,
            lineHeight: 1.75,
            color: OB.white,
          }}
        >
          {read.market_read}
        </p>
      )}

      {subjects.length > 0 && (
        <section style={{ marginTop: 36 }}>
          <div style={{ ...mono(10), color: OB.mutedNight }}>THE SUBJECTS THEY OWN</div>
          <ul style={{ listStyle: "none", padding: 0, margin: "14px 0 0", display: "grid", gap: 8 }}>
            {subjects.map((s, i) => (
              <li
                key={i}
                dir="auto"
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "baseline",
                  padding: "12px 16px",
                  borderRadius: RADIUS.card,
                  background: OB.nightSoft,
                  border: `1px solid ${OB.lineNight}`,
                  fontSize: 16,
                  lineHeight: 1.5,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 999,
                    background: OB.cyan,
                    flex: "0 0 auto",
                    transform: "translateY(-1px)",
                  }}
                />
                <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{s}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {read?.own_words && (
        <section style={{ marginTop: 36 }}>
          <div style={{ ...mono(10), color: OB.mutedNight }}>IN THEIR OWN WORDS</div>
          <blockquote
            dir={isArabic ? "rtl" : "auto"}
            style={{
              margin: "14px 0 0",
              padding: "22px 22px",
              borderRadius: RADIUS.card,
              border: `1px solid ${OB.lineNight}`,
              borderInlineStart: `3px solid ${OB.cyan}`,
              background: OB.nightSoft,
              fontSize: 21,
              lineHeight: isArabic ? 1.9 : 1.6,
              fontFamily: isArabic ? "'Cairo', system-ui, sans-serif" : OB.ui,
              textAlign: isArabic ? "right" : "start",
              overflowWrap: "anywhere",
            }}
          >
            {read.own_words}
          </blockquote>
        </section>
      )}

      <section
        style={{
          marginTop: 44,
          paddingTop: 28,
          borderTop: `1px solid ${OB.lineNight}`,
          display: "grid",
          gap: 16,
        }}
      >
        <p style={{ margin: 0, fontSize: 17, lineHeight: 1.7, maxWidth: "60ch" }}>
          Aura reads what you have already published and tells you what the market can see. It
          takes about ten minutes and costs nothing.
        </p>
        <PrimaryButton label="Read me too" onClick={() => navigate("/assessment")} />
        <p style={{ margin: 0, fontSize: 14, color: OB.mutedNight }}>
          No card. Your read is yours to keep.
        </p>
      </section>

      <footer style={{ marginTop: 48, ...mono(10), color: OB.mutedNight }}>aura-intel.org</footer>
    </Shell>
  );
}
