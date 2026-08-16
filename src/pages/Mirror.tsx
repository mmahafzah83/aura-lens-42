/**
 * Mirror — the public read. A stranger pastes a LinkedIn address and, ninety
 * seconds later, reads how their field currently sees them. No account, no gate.
 * One page, four states: ask → reading → the read → the list.
 */
import { useEffect, useRef, useState } from "react";
import RevealCard, { shareRevealCard, type RevealData } from "@/components/onboarding/RevealCard";
import { SENIORITY_LEVELS } from "@/constants/seniority";
import { SEAT_CTA } from "@/lib/seatCopy";

/* ── System-B surface ───────────────────────────────────────────── */
const CANVAS = "#F2F5F9";
const CARD = "#FFFFFF";
const LINE = "#E2E7EE";
const INK = "#0F1519";
const INK2 = "#5B6673";
const BLUE = "#0670C4";
const BLUE_DARK = "#04477C";
const CYAN = "#00CEC9";
const AMBER = "#E0A82E";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";
const UI = "Inter, system-ui, sans-serif";

const MIRROR_CSS = `
@keyframes mr-pulse{0%,100%{opacity:.35;transform:scale(.85)}50%{opacity:1;transform:scale(1)}}
@keyframes mr-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.mr-line{animation:mr-in .5s ease both}
.mr-btn:hover{background:${BLUE_DARK} !important}
`;

type Read = {
  archetype?: string;
  market_read?: string;
  themes?: string[];
  uncontested_space?: string;
  honest_gap?: string;
  own_words_quote?: string;
  own_words_read?: string;
};

type MirrorResponse = {
  ok?: boolean;
  cached?: boolean;
  sparse?: boolean;
  handle?: string;
  read?: Read;
  name?: string | null;
  posts_read?: number;
  error?: string;
};

const ERROR_COPY: Record<string, string> = {
  invalid_url:
    "That doesn't look like a LinkedIn profile address. It should look like linkedin.com/in/yourname.",
  invalid_email: "That email address doesn't look right.",
  rate_limited: "That's five reads from this connection in an hour. Try again shortly.",
  profile_unreadable:
    "LinkedIn didn't return that profile. If it's set to private, Aura can't see it either — and neither can most of your market.",
  not_configured: "Aura can't run reads right now. Try again shortly.",
  unreadable: "The read didn't come back clean. Nothing was saved. Try once more.",
  network: "Something failed on our side. Nothing was saved.",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const READING_LINES = [
  "Opening the profile…",
  "Reading recent posts…",
  "Finding what only you have…",
  "Writing your read…",
];

/** Line n appears at this offset, so the four spread across ~60 seconds. */
const READING_DELAYS = [0, 14_000, 32_000, 50_000];

const ARABIC_RE = /[\u0600-\u06FF]/;

/* ── small primitives ───────────────────────────────────────────── */
const Card = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <section
    style={{
      background: CARD,
      border: `1px solid ${LINE}`,
      borderRadius: 20,
      padding: 20,
      ...style,
    }}
  >
    {children}
  </section>
);

const Dot = ({ color }: { color: string }) => (
  <span
    aria-hidden
    style={{
      display: "inline-block", inlineSize: 8, blockSize: 8, borderRadius: 999,
      background: color, marginInlineEnd: 9, verticalAlign: "middle",
    }}
  />
);

const Heading = ({ children, dot }: { children: React.ReactNode; dot?: string }) => (
  <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: "0.02em", color: INK }}>
    {dot ? <Dot color={dot} /> : null}
    {children}
  </h2>
);

const Body = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <p style={{ margin: "10px 0 0", fontSize: 15, lineHeight: 1.65, color: INK, ...style }}>{children}</p>
);

const PrimaryButton = (
  props: React.ButtonHTMLAttributes<HTMLButtonElement>,
) => (
  <button
    {...props}
    className="mr-btn"
    style={{
      inlineSize: "100%", padding: "14px 18px", borderRadius: 8, border: "none",
      background: props.disabled ? "#9BB6CE" : BLUE, color: "#FFFFFF",
      fontFamily: UI, fontSize: 15, fontWeight: 700,
      cursor: props.disabled ? "default" : "pointer",
      ...props.style,
    }}
  />
);

const field: React.CSSProperties = {
  inlineSize: "100%", padding: "12px 14px", borderRadius: 8,
  border: `1px solid ${LINE}`, background: CARD, color: INK,
  fontFamily: UI, fontSize: 15, boxSizing: "border-box",
};

const label: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 600, color: INK2, marginBlockEnd: 6,
};

const fieldError = (msg?: string) =>
  msg ? <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "#B3261E" }}>{msg}</p> : null;

/* ── the page ───────────────────────────────────────────────────── */
export default function Mirror() {
  const [stage, setStage] = useState<"ask" | "reading" | "read">("ask");
  const [profileUrl, setProfileUrl] = useState("");
  const [urlError, setUrlError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [showRateHelp, setShowRateHelp] = useState(false);
  const [ref, setRef] = useState("");

  // Keep-this panel — the only place an email is asked for before the seat panel.
  const [sendEmail, setSendEmail] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState<string>();
  const [sentOk, setSentOk] = useState(false);

  const [result, setResult] = useState<MirrorResponse | null>(null);
  const [lineIndex, setLineIndex] = useState(0);

  const exportRef = useRef<HTMLDivElement>(null);
  const [shareNote, setShareNote] = useState<string>();

  // list panel
  const [listOpen, setListOpen] = useState(false);
  const [listName, setListName] = useState("");
  const [listEmail, setListEmail] = useState("");
  const [listSeniority, setListSeniority] = useState("");
  const [listBusy, setListBusy] = useState(false);
  const [listError, setListError] = useState<string>();
  const [listDone, setListDone] = useState<{ position?: number; duplicate?: boolean } | null>(null);

  useEffect(() => {
    document.title = "Read me — Aura";
    const q = new URLSearchParams(window.location.search).get("ref") ?? "";
    setRef(q.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60));
    // Prefill only — the person still presses the button.
    const prefill = new URLSearchParams(window.location.search).get("url");
    if (prefill) setProfileUrl(prefill.trim().slice(0, 300));
  }, []);

  // The reading copy advances on its own and holds on the last line.
  useEffect(() => {
    if (stage !== "reading") return;
    setLineIndex(0);
    const timers = READING_DELAYS.slice(1).map((delay, i) =>
      window.setTimeout(() => setLineIndex(i + 1), delay),
    );
    return () => timers.forEach(window.clearTimeout);
  }, [stage]);

  const failBack = (key: string) => {
    setFormError(ERROR_COPY[key] ?? ERROR_COPY.network);
    setShowRateHelp(key === "rate_limited");
    setStage("ask");
  };

  const submit = async () => {
    setFormError(undefined);
    setShowRateHelp(false);
    let bad = false;
    if (!profileUrl.toLowerCase().includes("linkedin.com/in/")) {
      setUrlError(ERROR_COPY.invalid_url); bad = true;
    } else setUrlError(undefined);
    if (bad) return;

    setStage("reading");
    try {
      const base = import.meta.env.VITE_SUPABASE_URL;
      const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const res = await fetch(`${base}/functions/v1/mirror-read`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
        body: JSON.stringify({ profile_url: profileUrl.trim(), ref: ref || undefined }),
      });
      const data: MirrorResponse = await res.json().catch(() => ({} as MirrorResponse));
      if (!res.ok || !data.ok || !data.read) {
        failBack(data.error ?? "network");
        return;
      }
      setResult(data);
      setListName(data.name ?? "");
      setStage("read");
    } catch {
      failBack("network");
    }
  };

  const SEND_ERROR: Record<string, string> = {
    invalid_email: ERROR_COPY.invalid_email,
    not_found: "We can't find that read any more. Run it once more and we'll send it.",
    rate_limited: "That's five from this connection in an hour. Try again shortly.",
    send_failed: "The email didn't leave our side. Nothing was sent — try once more.",
    network: "Something failed on our side. Nothing was sent.",
  };

  const sendRead = async () => {
    setSendError(undefined);
    if (!EMAIL_RE.test(sendEmail.trim())) { setSendError(SEND_ERROR.invalid_email); return; }
    setSendBusy(true);
    try {
      const base = import.meta.env.VITE_SUPABASE_URL;
      const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const res = await fetch(`${base}/functions/v1/send-mirror-read`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
        body: JSON.stringify({ handle: result?.handle, email: sendEmail.trim() }),
      });
      const data = await res.json().catch(() => ({} as { ok?: boolean; error?: string }));
      if (!res.ok || !data?.ok) {
        setSendError(SEND_ERROR[data?.error as string] ?? SEND_ERROR.network);
        return;
      }
      setSentOk(true);
      setListEmail(sendEmail.trim());
    } catch {
      setSendError(SEND_ERROR.network);
    } finally {
      setSendBusy(false);
    }
  };

  const joinList = async () => {
    setListBusy(true);
    setListError(undefined);
    try {
      const base = import.meta.env.VITE_SUPABASE_URL;
      const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const res = await fetch(`${base}/functions/v1/submit-waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          name: listName.trim(),
          email: listEmail.trim(),
          seniority: listSeniority || undefined,
          source: "mirror",
          ref: ref || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.duplicate) { setListDone({ duplicate: true }); return; }
      if (!res.ok || !data?.success) {
        setListError("That didn't go through. Nothing was saved — try once more.");
        return;
      }
      setListDone({ position: data.position });
    } catch {
      setListError(ERROR_COPY.network);
    } finally {
      setListBusy(false);
    }
  };

  const read = result?.read;
  const sparse = !!result?.sparse;
  const postsRead = result?.posts_read ?? 0;

  const cardData: RevealData = {
    archetype: read?.archetype ?? "",
    marketRead: read?.market_read ?? "",
    subjects: (read?.themes ?? []).slice(0, 3),
    softGround: [],
    figures: postsRead > 0 ? [{ value: String(postsRead), label: "posts of yours read" }] : [],
  };

  const share = async () => {
    if (!exportRef.current) return;
    setShareNote(undefined);
    try {
      const outcome = await shareRevealCard(exportRef.current, {
        fileName: "how-my-field-sees-me.png",
        caption:
          "I had something read my LinkedIn and tell me how my field actually sees me. This is what came back.",
      });
      setShareNote(outcome === "shared" ? "Shared." : "Saved to your device, caption copied.");
    } catch {
      setShareNote("The card didn't render. Try once more.");
    }
  };

  /* ── STATE B — reading (night) ── */
  if (stage === "reading") {
    return (
      <main style={{ minBlockSize: "100dvh", background: INK, color: "#FFFFFF", fontFamily: UI,
        display: "flex", alignItems: "center", padding: 24 }}>
        <style>{MIRROR_CSS}</style>
        <div style={{ inlineSize: "100%", maxInlineSize: 520, marginInline: "auto" }}>
          <span style={{
            display: "inline-block", inlineSize: 12, blockSize: 12, borderRadius: 999,
            background: CYAN, boxShadow: `0 0 18px 4px ${CYAN}55`,
            animation: "mr-pulse 1.6s ease-in-out infinite",
          }} />
          <div style={{ marginBlockStart: 26, display: "flex", flexDirection: "column", gap: 14 }}>
            {READING_LINES.slice(0, lineIndex + 1).map((l) => (
              <p key={l} className="mr-line" style={{
                margin: 0, fontFamily: MONO, fontSize: 14, letterSpacing: "0.04em",
                color: "rgba(255,255,255,0.86)",
              }}>{l}</p>
            ))}
          </div>
        </div>
      </main>
    );
  }

  /* ── STATE C — the read ── */
  if (stage === "read" && read) {
    return (
      <main style={{ minBlockSize: "100dvh", background: CANVAS, fontFamily: UI, color: INK }}>
        <style>{MIRROR_CSS}</style>

        {/* off-screen export node — one builder, two paths */}
        <div style={{ position: "fixed", insetInlineStart: -10000, insetBlockStart: 0 }} aria-hidden>
          <RevealCard
            ref={exportRef}
            data={cardData}
            forExport
            emptyFiguresLine={read.uncontested_space ?? ""}
          />
        </div>

        <div style={{ maxInlineSize: 560, marginInline: "auto", padding: "24px 16px 0",
          display: "flex", flexDirection: "column", gap: 14 }}>

          <RevealCard data={cardData} emptyFiguresLine={read.uncontested_space ?? ""} />

          {sparse ? (
            <Card>
              <Heading>Your profile is quieter than your career.</Heading>
              <Body>
                Aura can see the shape but not the substance. Two questions or one CV would change that.
              </Body>
            </Card>
          ) : (
            <>
              {read.uncontested_space ? (
                <Card>
                  <Heading dot={CYAN}>The space nobody has claimed</Heading>
                  <Body>{read.uncontested_space}</Body>
                </Card>
              ) : null}

              {read.honest_gap ? (
                <Card>
                  <Heading dot={AMBER}>One honest gap</Heading>
                  <Body>{read.honest_gap}</Body>
                </Card>
              ) : null}

              {read.own_words_quote ? (
                <Card>
                  <Heading>In your own words</Heading>
                  {(() => {
                    const arabic = ARABIC_RE.test(read.own_words_quote ?? "");
                    const script: React.CSSProperties = arabic
                      ? { fontFamily: "Cairo, 'IBM Plex Sans Arabic', sans-serif", lineHeight: 1.9, textAlign: "start" }
                      : {};
                    return (
                      <>
                        <p dir="auto" style={{ margin: "10px 0 0", fontSize: 15, lineHeight: 1.65,
                          color: INK, fontStyle: arabic ? "normal" : "italic", ...script }}>
                          {`“${read.own_words_quote}”`}
                        </p>
                        {read.own_words_read ? (
                          <p dir="auto" style={{ margin: "10px 0 0", fontSize: 14, lineHeight: 1.65,
                            color: INK2, ...script }}>
                            {read.own_words_read}
                          </p>
                        ) : null}
                      </>
                    );
                  })()}
                </Card>
              ) : null}
            </>
          )}

          <div>
            <button
              onClick={share}
              style={{
                inlineSize: "100%", padding: "13px 18px", borderRadius: 8,
                border: `1px solid ${LINE}`, background: CARD, color: INK,
                fontFamily: UI, fontSize: 15, fontWeight: 600, cursor: "pointer",
              }}
            >Share this card</button>
            {shareNote ? (
              <p style={{ margin: "8px 0 0", fontSize: 12.5, color: INK2 }}>{shareNote}</p>
            ) : null}
          </div>

          {/* Keep this — the promise the old gate never kept */}
          <Card>
            {sentOk ? (
              <>
                <Heading>Keep this</Heading>
                <Body>Sent. Check your inbox.</Body>
              </>
            ) : (
              <>
                <Heading>Keep this</Heading>
                <Body style={{ marginBlockEnd: 14 }}>Where should we send it?</Body>
                <label style={label} htmlFor="mr-send-email">Email</label>
                <input
                  id="mr-send-email" style={field} value={sendEmail} inputMode="email"
                  placeholder="you@email.com"
                  onChange={(e) => { setSendEmail(e.target.value); setSendError(undefined); }}
                />
                {fieldError(sendError)}
                <div style={{ marginBlockStart: 14 }}>
                  <PrimaryButton onClick={sendRead} disabled={sendBusy}>
                    {sendBusy ? "Sending…" : "Send it to me"}
                  </PrimaryButton>
                </div>
              </>
            )}
          </Card>
        </div>

        {/* closing CTA — the second and last night surface */}
        <section style={{ background: INK, color: "#FFFFFF", marginBlockStart: 24, padding: "34px 16px 44px" }}>
          <div style={{ maxInlineSize: 560, marginInline: "auto" }}>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 700, lineHeight: 1.35 }}>
              This is what the world can see. Aura's members get the read on what only they can see.
            </p>

            {!listOpen ? (
              <div style={{ marginBlockStart: 20 }}>
                <PrimaryButton onClick={() => setListOpen(true)}>{SEAT_CTA}</PrimaryButton>
              </div>
            ) : listDone ? (
              <div style={{
                marginBlockStart: 20, background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.16)", borderRadius: 12, padding: 20,
              }}>
                {listDone.duplicate ? (
                  <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.6 }}>You're already on the list.</p>
                ) : (
                  <>
                    <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.6 }}>
                      You're on the list. We'll write to you.
                    </p>
                    {listDone.position ? (
                      <p style={{
                        margin: "12px 0 0", fontFamily: MONO, fontSize: 28, fontWeight: 600,
                      }}>{`#${listDone.position}`}</p>
                    ) : null}
                  </>
                )}
              </div>
            ) : (
              <div style={{
                marginBlockStart: 20, background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.16)", borderRadius: 12, padding: 20,
                display: "flex", flexDirection: "column", gap: 14,
              }}>
                <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: "rgba(255,255,255,0.82)" }}>
                  Aura is in private beta. Founding members lock the early rate for life.
                </p>
                <div>
                  <label style={{ ...label, color: "rgba(255,255,255,0.72)" }} htmlFor="mr-name">Name</label>
                  <input id="mr-name" style={field} value={listName}
                    onChange={(e) => setListName(e.target.value)} />
                </div>
                <div>
                  <label style={{ ...label, color: "rgba(255,255,255,0.72)" }} htmlFor="mr-email">Email</label>
                  <input id="mr-email" style={field} value={listEmail} inputMode="email"
                    onChange={(e) => setListEmail(e.target.value)} />
                </div>
                <div>
                  <label style={{ ...label, color: "rgba(255,255,255,0.72)" }} htmlFor="mr-sen">
                    Where you sit (optional)
                  </label>
                  <select id="mr-sen" style={field} value={listSeniority}
                    onChange={(e) => setListSeniority(e.target.value)}>
                    <option value="">—</option>
                    {SENIORITY_LEVELS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                {fieldError(listError)}
                <PrimaryButton
                  onClick={joinList}
                  disabled={listBusy || !listName.trim() || !EMAIL_RE.test(listEmail.trim())}
                >{listBusy ? "Sending…" : "Join the list"}</PrimaryButton>
              </div>
            )}
          </div>
        </section>
      </main>
    );
  }

  /* ── STATE A — ask ── */
  return (
    <main style={{ minBlockSize: "100dvh", background: CANVAS, fontFamily: UI, color: INK,
      padding: "32px 16px 56px" }}>
      <style>{MIRROR_CSS}</style>
      <div style={{ maxInlineSize: 520, marginInline: "auto" }}>
        <h1 style={{ margin: 0, fontSize: 30, lineHeight: 1.15, fontWeight: 700, letterSpacing: "-0.02em" }}>
          Your expertise is invisible. Aura fixes that.
        </h1>
        <p style={{ margin: "14px 0 0", fontSize: 15.5, lineHeight: 1.65, color: INK }}>
          Paste your LinkedIn. Answer nothing. Ninety seconds later, read how your field currently
          sees you — and the one space you could own that nobody has claimed.
        </p>
        <p style={{ margin: "12px 0 0", fontSize: 13, lineHeight: 1.6, color: INK2 }}>
          LinkedIn now penalises generic AI writing and rewards demonstrated first-hand experience.
          Aura only ever writes what you have actually done.
        </p>

        <Card style={{ marginBlockStart: 22, display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={label} htmlFor="mr-url">LinkedIn profile URL</label>
            <input
              id="mr-url" style={field} value={profileUrl} placeholder="linkedin.com/in/yourname"
              onChange={(e) => { setProfileUrl(e.target.value); setUrlError(undefined); }}
            />
            {fieldError(urlError)}
          </div>
          <div>
            <PrimaryButton onClick={submit}>Read me</PrimaryButton>
            <p style={{ margin: "10px 0 0", fontSize: 12.5, lineHeight: 1.6, color: INK2 }}>
              No account, no sign-up. Ninety seconds.
            </p>
            {formError ? (
              <p style={{ margin: "10px 0 0", fontSize: 13, lineHeight: 1.6, color: "#B3261E" }}>
                {formError}
                {showRateHelp ? (
                  <> <a href="/request-access" style={{ color: BLUE }}>{SEAT_CTA} instead.</a></>
                ) : null}
              </p>
            ) : null}
          </div>
        </Card>
      </div>
    </main>
  );
}
