import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePageMeta } from "@/hooks/usePageMeta";
import {
  createSession, loadSession, saveSession, startRun,
  readToken, clearToken, type AssessmentState,
} from "@/lib/assessmentSession";
import PublicMasthead from "@/components/PublicMasthead";
import PublicFooter from "@/components/PublicFooter";
import ReadResult, { type Read as ReadShape } from "@/components/read/ReadResult";
import { ReadIdentityStrip, ReadSpine } from "@/components/read/ReadIdentityStrip";
import {
  ASSESSMENT_MINUTES, FIRST_READ_LINE, FULL_PICTURE_LINE,
  FIRST_READ_SHORT, ASSESSMENT_QUESTIONS_PHRASE,
} from "@/lib/brand";

/**
 * The Gate — and the quick read, which is step one of the one assessment.
 * This page owns the address, the read and its result. Nothing else: the
 * questions, the CV, the sliders and the reveal all live in /onboarding.
 */
type Stage = "gate" | "address" | "reading" | "read" | "resume";

const READING_LINES = [
  "Opening the profile…",
  "Reading recent posts…",
  "Finding what only you have…",
  "Writing your read…",
  "Still going — some profiles take longer.",
];

/** The wait has to look like it is moving, because it is. */
const ReadingProgress = () => {
  const reduced = typeof window !== "undefined"
    && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [pct, setPct] = useState(reduced ? 40 : 0);
  useEffect(() => {
    if (reduced) return;
    const started = Date.now();
    const id = window.setInterval(() => {
      const t = (Date.now() - started) / 25_000;
      setPct(Math.min(92, Math.round(t * 92)));
    }, 200);
    return () => window.clearInterval(id);
  }, [reduced]);
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label="Reading your profile"
      style={{
        marginBlockStart: 18, blockSize: 3, borderRadius: 999,
        background: "#E2E7EE", overflow: "hidden",
      }}
    >
      <div style={{
        blockSize: "100%", inlineSize: `${pct}%`, borderRadius: 999,
        background: "#0670C4",
        transition: reduced ? "none" : "inline-size 200ms linear",
      }} />
    </div>
  );
};

const STEP_TO_STAGE: Record<string, Stage> = {
  /* A finished read is never restored silently — the visitor is asked first. */
  address: "address", read: "resume",
};

/** "18 AUG 2026" — the one date shape on this page. */
const stampDate = (iso?: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    .replace(/\s+/g, " ").toUpperCase();
};

const Assessment = () => {
  usePageMeta({
    title: "Aura — Start your professional assessment",
    description:
      `${FULL_PICTURE_LINE}, free, and yours to keep. Aura reads your LinkedIn, your CV and your own answers, then shows what you are provably good at and what is real but invisible.`,
    path: "/assessment",
  });

  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("gate");
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<AssessmentState>({ answers: {} });
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [addr, setAddr] = useState("");
  const [addrError, setAddrError] = useState<string | null>(null);
  const [line, setLine] = useState(0);
  const insideRef = useRef<HTMLElement | null>(null);
  const autoRan = useRef(false);
  const [postsRead, setPostsRead] = useState(0);
  const [sparse, setSparse] = useState(false);
  const [ageNote, setAgeNote] = useState<string | null>(null);

  /* ── on every load: if a token is held, pick the visitor back up ── */
  useEffect(() => {
    let alive = true;
    const arriving = new URLSearchParams(window.location.search).get("url");
    const held = readToken();
    if (!held) return;
    void (async () => {
      const found = await loadSession(held);
      if (!alive) return;
      if (!found) { clearToken(); return; }   // expired, claimed or unknown — start fresh
      setToken(held);
      setState({ answers: {}, ...found.state });
      if (!arriving) setAddr(found.state.profile_url ?? "");
      if (arriving) return;                   // a link with an address wins over the old step
      /* Past the read, the journey is the real onboarding — go back to it. */
      if (found.state.step === "onboarding") { navigate("/onboarding", { replace: true }); return; }
      const back = STEP_TO_STAGE[found.state.step ?? ""] ?? null;
      if (back) setStage(back === "reading" ? "address" : back);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* progress is written after each screen, never mid-typing */
  const persist = useCallback(async (next: AssessmentState) => {
    setState(next);
    const t = token ?? readToken();
    if (t) await saveSession(t, next);
  }, [token]);

  /** The whole point: the address step opens here, with no account. */
  const begin = async () => {
    setNotice(null);
    if (token) { setStage("address"); return; }
    setBusy(true);
    const res = await createSession();
    setBusy(false);
    if (res.error || !res.token) { setNotice(res.error ?? null); return; }
    setToken(res.token);
    await saveSession(res.token, { step: "address", answers: {} });
    setState({ step: "address", answers: {} });
    setStage("address");
  };

  const scrollToInside = () => {
    const el = insideRef.current ?? document.getElementById("inside");
    if (!el) return;
    try { el.scrollIntoView({ behavior: "smooth", block: "start" }); } catch { /* older engines */ }
    // Belt and braces: some scroll containers ignore scrollIntoView.
    const top = el.getBoundingClientRect().top + window.scrollY - 16;
    window.scrollTo({ top, behavior: "smooth" });
  };

  /* ── the read ── */
  useEffect(() => {
    if (stage !== "reading") return;
    setLine(0);
    const t = [4_000, 9_000, 15_000, 26_000].map((d, i) =>
      window.setTimeout(() => setLine(i + 1), d));
    return () => t.forEach(window.clearTimeout);
  }, [stage]);

  const runRead = async (urlArg?: string) => {
    // An error that outlived its own fix is a lie — clear it before retrying.
    setNotice(null);
    const target = (urlArg ?? addr).trim();
    if (!target.toLowerCase().includes("linkedin.com/in/")) {
      setAddrError("That doesn't look like a LinkedIn profile address. It should look like linkedin.com/in/yourname.");
      return;
    }
    setAddrError(null);
    let t = token ?? readToken();
    if (!t) {
      // Someone arriving from a link has no session yet — open one silently.
      const opened = await createSession();
      if (opened.error || !opened.token) {
        setNotice(opened.error ?? "Your session has expired. Start again — nothing is lost.");
        setStage("gate"); return;
      }
      t = opened.token;
      setToken(t);
      await saveSession(t, { step: "address", answers: {} });
    }

    const gate = await startRun(t);
    if (gate.ok !== true) { setNotice(gate.error); return; }

    setStage("reading");
    try {
      const base = import.meta.env.VITE_SUPABASE_URL;
      const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const res = await fetch(`${base}/functions/v1/mirror-read`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
        body: JSON.stringify({ profile_url: target }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok || !data?.read) {
        // Every code the engine can return gets its own honest line.
        const READ_ERRORS: Record<string, string> = {
          invalid_url: "That doesn't look like a LinkedIn profile address. It should look like linkedin.com/in/yourname.",
          profile_unreadable: "LinkedIn didn't return that profile. If it's set to private, Aura can't see it either.",
          provider_limit: "Aura has hit today's reading limit with our LinkedIn provider. Nothing is wrong with your profile — try again shortly.",
          rate_limited: "That's as many reads as can come from here this hour. Nothing is lost — try again shortly.",
          not_configured: "Reading is briefly unavailable on our side. Nothing is lost — try again shortly.",
        };
        setNotice(
          READ_ERRORS[String(data?.error ?? "")] ??
          "The read didn't come back clean. Nothing is lost — try once more.");
        setStage("address");
        return;
      }
      setPostsRead(Number(data.posts_read ?? 0));
      setSparse(!!data.sparse);
      setAgeNote(data.stale && typeof data.notice === "string" ? data.notice : null);
      await persist({
        ...state, step: "read", profile_url: target, name: data.name ?? null,
        headline: data.headline ?? null, avatar_url: data.avatar_url ?? null,
        generated_at: data.generated_at ?? null, read: data.read,
        posts_read: Number(data.posts_read ?? 0),
      } as AssessmentState);
      setStage("read");
    } catch {
      setNotice("Something failed on our side. Nothing is lost — try once more.");
      setStage("address");
    }
  };

  /* ── one click saved: an address in the link starts step one at once ── */
  useEffect(() => {
    if (autoRan.current) return;
    const prefill = new URLSearchParams(window.location.search).get("url")?.trim().slice(0, 300);
    if (!prefill) return;
    autoRan.current = true;
    setAddr(prefill);
    setStage("address");
    if (prefill.toLowerCase().includes("linkedin.com/in/")) void runRead(prefill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The read is step one. Everything after it lives in the real onboarding. */
  const continueToOnboarding = async () => {
    await persist({ ...state, step: "onboarding" });
    navigate("/onboarding");
  };

  /** Finish later — nothing is cleared; the browser keeps the place. */
  const finishLater = () => { navigate("/"); };

  /** A new read replaces the one already held — so it is confirmed first. */
  const startNewRead = async () => {
    const ok = window.confirm("Start a new read? This replaces the read you already have.");
    if (!ok) return;
    setAgeNote(null);
    setPostsRead(0);
    setSparse(false);
    await persist({ step: "address", answers: {}, profile_url: state.profile_url });
    setStage("address");
  };

  const read = (state.read ?? {}) as Record<string, string | string[] | undefined>;

  /* ══════════ the in-page journey ══════════ */
  if (stage !== "gate") {
    return (
      <div className="asg">
        <style>{ASG_CSS}</style>
        <PublicMasthead cta={null} />
        <main className="asg-wrap asg-flow">
          {notice && <div className="asg-notice" role="status">{notice}</div>}

          {stage === "address" && (
            <section className="asg-panel">
              <span className="asg-k">STEP ONE · THE QUICK READ</span>
              <h1 className="asg-ph">What's your LinkedIn?</h1>
              <p className="asg-pp">We read what is already public. Nothing is posted or shared.</p>
              <label className="asg-lbl" htmlFor="asg-addr">Your LinkedIn address</label>
              <input
                id="asg-addr" className="asg-in" autoFocus value={addr}
                placeholder="linkedin.com/in/yourname"
                onChange={(e) => setAddr(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void runRead(); }}
              />
              <div aria-live="polite">{addrError && <p className="asg-err">{addrError}</p>}</div>
              <button className="asg-btn asg-bp asg-full" onClick={() => void runRead()}>
                Read my profile <span className="asg-a">↗</span>
              </button>
              <p className="asg-trust">No account needed. You can stop and come back — this page remembers.</p>
            </section>
          )}

          {stage === "reading" && (
            <section className="asg-panel asg-center">
              <span className="asg-k">READING</span>
              <h1 className="asg-ph">{READING_LINES[Math.min(line, READING_LINES.length - 1)]}</h1>
              <p className="asg-pp">This takes a moment. Leave the tab open.</p>
              <ReadingProgress />
            </section>
          )}

          {stage === "read" && (
            <div className="asg-read">
              <div className="asg-moment">
                <div>Ninety seconds ago Aura had never heard of you.</div>
                <div>
                  {postsRead > 0
                    ? `Here is what your last ${postsRead} posts say to the market.`
                    : "Here is what your profile says to the market."}
                </div>
              </div>
              <ReadResult
                read={read as unknown as ReadShape}
                postsRead={postsRead}
                sparse={sparse}
                name={state.name ?? null}
                headline={state.headline ?? null}
                avatarUrl={state.avatar_url ?? null}
                generatedAt={state.generated_at ?? null}
                ageNote={ageNote}
              />
              <button className="asg-btn asg-bp asg-full" onClick={() => void continueToOnboarding()}>
                Continue — your CV and {ASSESSMENT_QUESTIONS_PHRASE} <span className="asg-a">↗</span>
              </button>
              <p className="asg-trust">
                Saved as you go. No account yet — we ask once, at the end.
              </p>
            </div>
          )}

        </main>
        <PublicFooter />
      </div>
    );
  }

  return (
    <div className="asg">
      <style>{ASG_CSS}</style>
      {/* The Gate has one job; no competing action in its own header. */}
      <PublicMasthead cta={null} />

      <main className="asg-wrap">
        {notice && <div className="asg-notice" role="status">{notice}</div>}
        <section className="asg-cols">
          {/* ── left · the promise ── */}
          <div>
            <span className="asg-pill">
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <circle cx="5" cy="5" r="3" fill="#00807B" />
              </svg>
              BEFORE YOU START
            </span>

            <h1 className="asg-h1">
              {FIRST_READ_LINE}, and you&rsquo;ll see
              <br />
              <span className="asg-h1b">what your profile has been hiding.</span>
            </h1>

            <p className="asg-sub">
              Aura reads your LinkedIn, your CV and your own answers, then tells you what you are
              provably good at, what is real but invisible, and the position nobody else is holding.
              {" "}{FULL_PICTURE_LINE}.
            </p>

            <div className="asg-stats">
              <div className="asg-stat">
                <span className="asg-n">{FIRST_READ_SHORT}</span>
                <span className="asg-c">to your first read</span>
              </div>
              <div className="asg-stat">
                <span className="asg-n">Free</span>
                <span className="asg-c">and yours to keep</span>
              </div>
            </div>

            <div className="asg-acts">
              <button className="asg-btn asg-bp" onClick={() => void begin()} disabled={busy}>
                {busy ? "Opening…" : (<>Start with my LinkedIn <span className="asg-a">↗</span></>)}
              </button>
              <button
                type="button"
                className="asg-btn asg-bg"
                onClick={scrollToInside}
              >
                What&rsquo;s inside the report
              </button>
            </div>

            <p className="asg-trust">
              No account needed to begin. Nothing is posted, shared or shown to anyone — ever,
              without you clicking.
            </p>
          </div>

          {/* ── right · the illustration, drawn from the design system ── */}
          <div className="asg-art">
            <svg
              viewBox="0 0 420 420"
              role="img"
              aria-label="An illustration of the assessment: a CV card behind a dark blue report card showing three capability bars, with fragments of evidence feeding in and the Aura eye watching below."
            >
              <defs>
                <linearGradient id="asgcard" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#0670C4" />
                  <stop offset="1" stopColor="#04477C" />
                </linearGradient>
                <linearGradient id="asgthread" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#00CEC9" />
                  <stop offset="1" stopColor="#0670C4" />
                </linearGradient>
              </defs>

              <circle cx="210" cy="210" r="168" fill="#E7F1FB" opacity="0.55" />
              <circle
                cx="210"
                cy="210"
                r="132"
                fill="none"
                stroke="#CFE0F1"
                strokeWidth="1"
                strokeDasharray="3 6"
              />

              {/* fragments */}
              <g>
                <path d="M96 96 L136 158" stroke="url(#asgthread)" strokeWidth="1.2" strokeDasharray="3 4" />
                <path d="M210 66 L212 132" stroke="url(#asgthread)" strokeWidth="1.2" strokeDasharray="3 4" />
                <path d="M322 96 L286 156" stroke="url(#asgthread)" strokeWidth="1.2" strokeDasharray="3 4" />
                <rect x="60" y="72" width="72" height="24" rx="12" fill="#FFFFFF" stroke="#D2D8E0" />
                <rect x="174" y="42" width="72" height="24" rx="12" fill="#FFFFFF" stroke="#D2D8E0" />
                <rect x="288" y="72" width="72" height="24" rx="12" fill="#FFFFFF" stroke="#D2D8E0" />
                <rect x="70" y="82" width="46" height="4" rx="2" fill="#C9D2DC" />
                <rect x="184" y="52" width="46" height="4" rx="2" fill="#C9D2DC" />
                <rect x="298" y="82" width="46" height="4" rx="2" fill="#C9D2DC" />
                <circle cx="96" cy="96" r="3.4" fill="#00CEC9" />
                <circle cx="210" cy="66" r="3.4" fill="#00CEC9" />
                <circle cx="322" cy="96" r="3.4" fill="#00CEC9" />
              </g>

              {/* the CV card, behind */}
              <g transform="rotate(-8 168 250)">
                <rect x="104" y="150" width="128" height="176" rx="12" fill="#FFFFFF" stroke="#D2D8E0" />
                <rect x="120" y="170" width="58" height="7" rx="3.5" fill="#C9D2DC" />
                <rect x="120" y="186" width="82" height="5" rx="2.5" fill="#E2E7EE" />
                <rect x="120" y="210" width="96" height="5" rx="2.5" fill="#E2E7EE" />
                <rect x="120" y="224" width="88" height="5" rx="2.5" fill="#E2E7EE" />
                <rect x="120" y="238" width="96" height="5" rx="2.5" fill="#E2E7EE" />
                <rect x="120" y="262" width="44" height="5" rx="2.5" fill="#C9D2DC" />
                <rect x="120" y="276" width="94" height="5" rx="2.5" fill="#E2E7EE" />
                <rect x="120" y="290" width="76" height="5" rx="2.5" fill="#E2E7EE" />
              </g>

              {/* the read card, in front */}
              <g transform="rotate(5 262 248)">
                <rect x="196" y="146" width="152" height="204" rx="14" fill="url(#asgcard)" />
                <rect x="216" y="172" width="62" height="7" rx="3.5" fill="#FFFFFF" opacity="0.85" />
                <rect x="216" y="188" width="94" height="5" rx="2.5" fill="#FFFFFF" opacity="0.45" />

                <rect x="216" y="224" width="112" height="8" rx="4" fill="#FFFFFF" opacity="0.22" />
                <rect x="216" y="224" width="100" height="8" rx="4" fill="#00CEC9" />
                <rect x="216" y="256" width="112" height="8" rx="4" fill="#FFFFFF" opacity="0.22" />
                <rect x="216" y="256" width="66" height="8" rx="4" fill="#67E3E0" />
                <rect x="216" y="288" width="112" height="8" rx="4" fill="#FFFFFF" opacity="0.22" />
                <rect x="216" y="288" width="34" height="8" rx="4" fill="#FFFFFF" opacity="0.55" />

                <rect x="216" y="318" width="70" height="5" rx="2.5" fill="#FFFFFF" opacity="0.35" />
              </g>

              {/* the night circle and the eye */}
              <circle cx="118" cy="332" r="46" fill="#0F1519" />
              <circle cx="118" cy="332" r="20" fill="none" stroke="#00CEC9" strokeWidth="1.6" />
              <circle cx="118" cy="332" r="6" fill="#00CEC9" />
              <path
                d="M84 332a34 34 0 0 1 68 0"
                fill="none"
                stroke="#4A5563"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </section>

        {/* ── below · the shape of the journey ── */}
        <section className="asg-three">
          <article className="asg-card">
            <span className="asg-k">FIRST · {FIRST_READ_SHORT.toUpperCase()}</span>
            <h2>Your LinkedIn, read</h2>
            <p>We read what is already public and turn it into a first picture of how you land.</p>
          </article>
          <article className="asg-card">
            <span className="asg-k">THEN · {ASSESSMENT_MINUTES - 3} MINUTES</span>
            <h2>Your CV and {ASSESSMENT_QUESTIONS_PHRASE}</h2>
            <p>Upload what you have. Answer in your own words. Stop and come back whenever you like.</p>
          </article>
          <article className="asg-card">
            <span className="asg-k">AT THE END</span>
            <h2>Your report</h2>
            <p>What you are provably good at, what is real but invisible, and the position open to you.</p>
          </article>
        </section>

        {/* ── what the report actually contains ── */}
        <section className="asg-inside" id="inside" ref={insideRef}>
          <span className="asg-k">WHAT&rsquo;S INSIDE</span>
          <h2 className="asg-ih">Six things you will know that you did not know this morning.</h2>

          <div className="asg-grid">
            {INSIDE_ITEMS.map((item) => (
              <div className="asg-item" key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.line}</p>
              </div>
            ))}
          </div>

          <div className="asg-acts asg-acts-c">
            <button className="asg-btn asg-bp" onClick={() => void begin()} disabled={busy}>
              {busy ? "Opening…" : (<>Start with my LinkedIn <span className="asg-a">↗</span></>)}
            </button>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
};

const INSIDE_ITEMS = [
  { title: "Your capability map", line: "What is proven, what is real but invisible, what is not there yet." },
  { title: "CV against LinkedIn", line: "Where the two disagree, and what each one is hiding." },
  { title: "The space nobody has claimed", line: "The position that is open to you." },
  { title: "Your three subjects", line: "Instead of writing about ten." },
  { title: "How three people read you", line: "A headhunter, a client, a peer." },
  { title: "The report itself", line: "A PDF and a card, yours to keep." },
];

const ASG_CSS = `
.asg{--ink:#0F1519;--ink2:#37424F;--ink3:#66707D;--ink4:#5B6673;--line:#E2E7EE;--white:#FFF;
  --canvas:#F2F5F9;--blue:#0670C4;--blue2:#04477C;--bluetint:#E7F1FB;--cyan:#00CEC9;--cyanT:#00807B;
  --cyantint:#CCEFEE;--ui:"Inter",system-ui,sans-serif;--mono:"IBM Plex Mono",monospace;
  font-family:var(--ui);background:var(--canvas);color:var(--ink);min-height:100vh;}
.asg-wrap{max-width:1120px;margin:0 auto;padding:44px 22px 80px;}
.asg-cols{display:grid;grid-template-columns:1.05fr .95fr;gap:52px;align-items:center;}
.asg-pill{display:inline-flex;align-items:center;gap:8px;background:var(--cyantint);color:var(--cyanT);
  border-radius:999px;padding:7px 13px;font-family:var(--mono);font-size:9px;letter-spacing:.18em;}
.asg-h1{font-size:31px;font-weight:700;line-height:1.14;letter-spacing:-.022em;margin:20px 0 0;}
.asg-h1b{color:var(--ink4);}
.asg-sub{font-size:15px;line-height:1.6;color:var(--ink2);margin:18px 0 0;max-width:52ch;}
.asg-stats{display:flex;flex-wrap:wrap;gap:34px;margin:28px 0 0;}
.asg-stat{display:flex;flex-direction:column;gap:4px;}
.asg-n{font-family:var(--mono);font-size:19px;font-weight:600;color:var(--ink);line-height:1;}
.asg-c{font-size:11.5px;color:var(--ink3);}
.asg-acts{display:flex;flex-wrap:wrap;gap:12px;margin:30px 0 0;}
.asg-btn{display:inline-flex;align-items:center;gap:8px;border-radius:12px;padding:14px 22px;
  font-size:14.5px;font-weight:600;text-decoration:none;transition:transform .25s ease,background .25s ease;}
.asg-bp{background:#0670C4;color:var(--white);}
.asg-bp:hover{background:#04477C;transform:translateY(-2px);}
.asg-bg{background:transparent;color:var(--ink2);border:1px solid var(--line);}
.asg-bg:hover{background:var(--white);}
.asg-trust{font-size:12px;color:var(--ink3);line-height:1.55;margin:18px 0 0;max-width:50ch;}
.asg-art svg{width:100%;height:auto;display:block;}
.asg-three{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:64px;}
.asg-card{background:var(--white);border:1px solid var(--line);border-radius:16px;padding:22px;}
.asg-k{font-family:var(--mono);font-size:9px;letter-spacing:.17em;color:var(--blue);}
.asg-card h2{font-size:17px;font-weight:700;margin:10px 0 8px;letter-spacing:-.01em;}
.asg-card p{font-size:13px;line-height:1.55;color:var(--ink3);}
.asg-inside{margin-top:64px;scroll-margin-top:24px;}
.asg-ih{font-size:25px;font-weight:700;line-height:1.2;letter-spacing:-.018em;margin:10px 0 0;max-width:22ch;}
.asg-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:26px;}
.asg-item{background:var(--white);border:1px solid var(--line);border-radius:16px;padding:20px;}
.asg-item h3{font-size:15.5px;font-weight:700;letter-spacing:-.01em;margin:0 0 6px;}
.asg-item p{font-size:13px;line-height:1.55;color:var(--ink3);margin:0;}
.asg-acts-c{margin-top:26px;}
@media(max-width:900px){
  .asg-cols{grid-template-columns:1fr;gap:34px;}
  .asg-three{grid-template-columns:1fr;}
  .asg-h1{font-size:27px;}
  .asg-acts .asg-btn{flex:1 1 100%;justify-content:center;}
}
@media(max-width:700px){
  .asg-grid{grid-template-columns:1fr;}
  .asg-ih{font-size:21px;}
}
/* ── the in-page journey ── */
.asg-flow{max-width:620px;}
.asg-read{display:flex;flex-direction:column;gap:14px;}
.asg-read .asg-full{margin-top:4px;}
.asg-moment{display:flex;flex-direction:column;}
.asg-moment div:first-child{font-size:19px;font-weight:600;color:var(--ink);letter-spacing:-0.015em;line-height:1.35;}
.asg-moment div:last-child{font-size:19px;font-weight:400;color:var(--ink4);line-height:1.35;margin-top:4px;}
.asg-panel{background:var(--white);border:1px solid var(--line);border-radius:20px;padding:26px;}
.asg-center{text-align:center;}
.asg-ph{font-size:24px;font-weight:700;line-height:1.2;letter-spacing:-.018em;margin:10px 0 0;}
.asg-sh{font-size:14px;font-weight:700;margin:20px 0 0;}
.asg-pp{font-size:14.5px;line-height:1.65;color:var(--ink2);margin:12px 0 0;}
.asg-themes{margin:14px 0 0;padding-inline-start:18px;color:var(--ink2);font-size:14px;line-height:1.7;}
.asg-lbl{display:block;font-size:12px;font-weight:600;color:var(--ink3);margin:22px 0 6px;}
.asg-in,.asg-ta{width:100%;box-sizing:border-box;padding:12px 14px;border-radius:10px;
  border:1px solid var(--line);background:var(--white);color:var(--ink);font-family:var(--ui);font-size:15px;}
.asg-ta{margin-top:14px;line-height:1.6;resize:vertical;}
.asg-help{font-size:11.5px;color:var(--ink3);margin:6px 0 0;}
.asg-err{font-size:12.5px;color:#C0392B;margin:8px 0 0;}
.asg-ok{font-size:14px;line-height:1.6;color:var(--cyanT);margin:16px 0 0;}
.asg-full{width:100%;justify-content:center;margin-top:18px;border:none;cursor:pointer;font-family:var(--ui);}
.asg-btn[disabled]{opacity:.55;cursor:default;}
.asg-notice{background:var(--bluetint);border:1px solid #CFE0F1;color:var(--blue2);
  border-radius:12px;padding:12px 14px;font-size:13.5px;line-height:1.55;margin:0 0 20px;}
.asg-consent{display:flex;align-items:flex-start;gap:10px;font-size:12.5px;line-height:1.55;
  color:var(--ink3);margin:18px 0 0;cursor:pointer;}
.asg-consent input{width:18px;height:18px;flex:0 0 18px;margin-top:2px;accent-color:var(--blue);cursor:pointer;}
.asg-consent a{color:var(--blue);font-weight:600;}
button.asg-btn{border:none;cursor:pointer;font-family:var(--ui);}
button.asg-bg{border:1px solid var(--line);}
@media(max-width:700px){.asg-panel{padding:20px;}.asg-ph{font-size:21px;}}
`;

export default Assessment;
