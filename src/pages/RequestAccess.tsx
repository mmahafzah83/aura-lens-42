import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import usePageMeta from "@/hooks/usePageMeta";
import { SECTORS } from "@/constants/sectors";
import { SENIORITY_LEVELS } from "@/constants/seniority";
import AuraLogo from "@/components/brand/AuraLogo";
import {
  SEAT_PRICE, SEAT_PRICE_SUBLINE, SEAT_HEADING, SEAT_LEAD,
  SEAT_ONE_JOB, SEAT_HOW, SEAT_HOW_LABEL, SEAT_VS_TOOLS, SEAT_CONSTRAINT, SEAT_RACK_LABEL,
  INTENT_RESERVE, INTENT_KEEP_POSTED, RESERVED_TITLE, RESERVED_BODY, POSTED_TITLE,
  WORTH_QUESTION, WORTH_PLACEHOLDER, WORTH_SEND, WORTH_SKIP, WORTH_THANKS,
  type SeatIntent,
} from "@/lib/seatCopy";

/* ────────────────────────────────────────────────────────────────
   /request-access — "The Door".
   Same System-B language as the landing so the click never feels
   like it left the product. Every rule is scoped under .ra.

   The signature device is the seat rack: one tick per founding seat,
   the taken ones inked, and the next one — yours — breathing in blue.
   It renders ONLY when founding_seats() answers. No fallback count,
   ever: a fake scarcity number is worse than no number.
   ──────────────────────────────────────────────────────────────── */

type Status = "idle" | "loading" | "success" | "duplicate" | "error" | "validation";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SENIORITY: string[] = [...SENIORITY_LEVELS];
const SECTOR: string[] = [...SECTORS];
const COUNTER_REVEAL_THRESHOLD = 7;

function usePositionCount(target: number, start: boolean, duration = 800) {
  const [value, setValue] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (!start || started.current || !target) return;
    started.current = true;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { setValue(target); return; }
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, start, duration]);
  return value;
}

export default function RequestAccess() {
  usePageMeta({
    title: "Aura — Reserve a founding seat",
    description:
      "The founding fifty is for the weekly loop. Thirty seconds to ask. Read personally, answered within 24 hours.",
    path: "/request-access",
  });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [seniority, setSeniority] = useState("");
  const [sector, setSector] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [submittedName, setSubmittedName] = useState("");
  const [position, setPosition] = useState<number | null>(null);
  const [seats, setSeats] = useState<{ claimed: number; cap: number } | null>(null);
  const [intent, setIntent] = useState<SeatIntent>(INTENT_RESERVE);
  // Arriving from the seat panel already carries which door was pressed there.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("intent");
    if (q === INTENT_KEEP_POSTED || q === INTENT_RESERVE) setIntent(q);
  }, []);
  const [worth, setWorth] = useState("");
  const [worthState, setWorthState] = useState<"idle" | "sending" | "sent" | "skipped">("idle");
  const [errors, setErrors] = useState<{ name?: string; email?: string; seniority?: string; sector?: string }>({});
  const [validationMessage, setValidationMessage] = useState("");

  const isDone = status === "success" || status === "duplicate";

  /* ── founding seats — reservations only. The rack counts people who said
     yes at $69, nothing else. If the RPC is silent, the rack does not render. ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await (supabase as any).rpc("founding_reservations");
        if (cancelled || error || !data) return;
        const row: any = Array.isArray(data) ? (data as any)[0] : data;
        const claimed = Number(row?.claimed);
        const cap = Number(row?.cap);
        if (!Number.isFinite(claimed) || !Number.isFinite(cap) || cap <= 0) return;
        setSeats({ claimed, cap });
      } catch {
        /* silent — the rack simply doesn't render */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const validate = () => {
    const next: typeof errors = {};
    if (!name.trim()) next.name = "Your name is required";
    if (!email.trim()) next.email = "Email is required";
    else if (!EMAIL_RE.test(email.trim())) next.email = "Enter a valid email";
    if (!seniority) next.seniority = "Select your level";
    if (!sector) next.sector = "Select your sector";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent, chosen: SeatIntent = intent) => {
    e.preventDefault();
    setIntent(chosen);
    if (!validate()) return;
    setStatus("loading");
    try {
      const { data, error } = await supabase.functions.invoke("submit-waitlist", {
        body: { name: name.trim(), email: email.trim(), seniority, sector, intent: chosen },
      });
      if (error) {
        // FunctionsHttpError exposes the EF response body via error.context;
        // FunctionsFetchError (a true network failure) does not.
        const ctx: any = (error as any).context;
        if (ctx && typeof ctx.json === "function") {
          let efMsg = "";
          try { efMsg = (await ctx.json())?.error ?? ""; } catch { /* ignore parse error */ }
          setValidationMessage(
            typeof efMsg === "string" && efMsg.trim()
              ? efMsg
              : "Please check the highlighted fields and try again.",
          );
          setStatus("validation");
          return;
        }
        throw error;
      }
      setSubmittedName(name.trim().split(" ")[0]);
      if (data?.duplicate) {
        setStatus("duplicate");
      } else {
        if (typeof data?.position === "number") setPosition(data.position);
        setStatus("success");
        // only a reservation moves the reservation count
        if (chosen === INTENT_RESERVE) {
          setSeats((s) => (s ? { ...s, claimed: Math.min(s.claimed + 1, s.cap) } : s));
        }
      }
    } catch (err) {
      console.error("submit-waitlist failed:", err);
      setStatus("error");
    }
  };

  /* The optional three-month question, stored with the same rule as the intent. */
  const sendWorth = async () => {
    const answer = worth.trim();
    if (!answer) { setWorthState("skipped"); return; }
    setWorthState("sending");
    try {
      await supabase.functions.invoke("submit-waitlist", {
        body: {
          name: name.trim(), email: email.trim(), seniority, sector,
          intent: INTENT_RESERVE, answer,
        },
      });
    } catch (err) {
      console.error("worth answer failed:", err);
    }
    setWorthState("sent");
  };

  return (
    <div className="ra">
      <style>{RA_CSS}</style>

      <header className="ra-mast">
        <Link className="ra-brand" to="/">
          <AuraLogo size={24} variant="auto" />
          <span className="ra-bn">Aura</span>
        </Link>
        <div className="ra-mr">
          <Link className="ra-mlink" to="/">← Back to Aura</Link>
          <Link className="ra-mlink" to="/auth">Sign in</Link>
        </div>
      </header>

      <main className="ra-main">
        {/* ── LEFT · the door ── */}
        <div>
          <div className="ra-eyebrow"><span>The door</span></div>
          <h1 className="ra-h1">{SEAT_HEADING}</h1>
          <p className="ra-lede">{SEAT_LEAD}</p>
          <p className="ra-onejob">{SEAT_ONE_JOB}</p>
          <p className="ra-howlb">{SEAT_HOW_LABEL}</p>
          <ul className="ra-how">
            {SEAT_HOW.map((row) => <li key={row}>{row}</li>)}
          </ul>
          <p className="ra-vs">{SEAT_VS_TOOLS}</p>
          <p className="ra-constraint">{SEAT_CONSTRAINT}</p>

          {seats && (
            <div className="ra-rack">
              {seats.claimed < COUNTER_REVEAL_THRESHOLD ? (
                <>
                  <div className="ra-rackhead">
                    <span className="ra-lb">Founding circle</span>
                  </div>
                  <p className="ra-rackteaser">
                    Fifty founding seats. I onboard each one personally.
                  </p>
                </>
              ) : (
                <>
                  <div className="ra-rackhead">
                    <span className="ra-n">
                      {SEAT_RACK_LABEL(seats.claimed, seats.cap)}
                    </span>
                    <span className="ra-lb">Founding circle</span>
                  </div>
                  <div className="ra-ticks" aria-hidden="true">
                    {Array.from({ length: seats.cap }).map((_, i) => (
                      <i
                        key={i}
                        className={
                          i < seats.claimed ? "taken" : !isDone && i === seats.claimed ? "yours" : ""
                        }
                      />
                    ))}
                  </div>
                  <p className={`ra-rackfoot${isDone ? " counted" : ""}`}>
                    <span className="ra-sq" />
                    {isDone ? "Yours is counted" : "The next one is yours"}
                  </p>
                </>
              )}
            </div>
          )}

          <div className="ra-ledger">
            <div className="ra-lrow">
              <span className="ra-k">You send this</span>
              <span className="ra-lead" />
              <span className={`ra-v${isDone ? " cy" : ""}`}>{isDone ? "Done" : "Thirty seconds"}</span>
            </div>
            <div className="ra-lrow">
              <span className="ra-k">I read it</span>
              <span className="ra-lead" />
              <span className="ra-v act">Within 24 hours</span>
            </div>
            <div className="ra-lrow">
              <span className="ra-k">Your seat opens</span>
              <span className="ra-lead" />
              <span className="ra-v">The assessment first</span>
            </div>
            <div className="ra-lrow">
              <span className="ra-k">Aura starts reading</span>
              <span className="ra-lead" />
              <span className={`ra-v${isDone ? "" : " cy"}`}>That same night</span>
            </div>
          </div>

          <p className="ra-readfree">
            Not ready for a seat? <Link to="/read">Read yourself free</Link> — no account,
            ninety seconds.
          </p>
          <p className="ra-ar" dir="rtl">
            حتى السوق يعرفك قبل ما يشوفك <span aria-hidden="true">✦</span>
          </p>
        </div>

        {/* ── RIGHT · the sheet ── */}
        <div className={`ra-sheet${isDone ? " ra-done" : ""}`}>
          {!isDone && (
            <>
              <h2 className="ra-h2">Tell me who you are.</h2>
              <p className="ra-sub">Four fields. Nothing you'd have to think about.</p>

              <form onSubmit={handleSubmit} noValidate className="ra-form">
                <Field
                  id="ra-name" label="Your name" placeholder="Your full name"
                  value={name} maxLength={200} error={errors.name}
                  onChange={(v) => { setName(v); if (errors.name) setErrors((p) => ({ ...p, name: undefined })); }}
                />
                <Field
                  id="ra-email" label="Your email" type="email" placeholder="you@email.com"
                  value={email} maxLength={255} error={errors.email}
                  onChange={(v) => { setEmail(v); if (errors.email) setErrors((p) => ({ ...p, email: undefined })); }}
                />
                <Select
                  id="ra-seniority" label="Your level" placeholder="Select your level"
                  value={seniority} options={SENIORITY} error={errors.seniority}
                  onChange={(v) => { setSeniority(v); if (errors.seniority) setErrors((p) => ({ ...p, seniority: undefined })); }}
                />
                <Select
                  id="ra-sector" label="Your sector" placeholder="Select your sector"
                  value={sector} options={SECTOR} error={errors.sector}
                  onChange={(v) => { setSector(v); if (errors.sector) setErrors((p) => ({ ...p, sector: undefined })); }}
                />

                {status === "error" && (
                  <div className="ra-alert">Didn't connect. Try once more.</div>
                )}
                {status === "validation" && (
                  <div className="ra-alert">
                    {validationMessage || "Please check the highlighted fields and try again."}
                  </div>
                )}

                <div className="ra-price">
                  <span className="ra-price-n">{SEAT_PRICE}</span>
                  <span className="ra-price-s">{SEAT_PRICE_SUBLINE}</span>
                </div>

                <button
                  type="submit"
                  disabled={status === "loading"}
                  className="ra-door ra-door-fill"
                  onClick={() => setIntent(INTENT_RESERVE)}
                >
                  {status === "loading" && intent === INTENT_RESERVE
                    ? <span className="ra-pulse">Sending…</span>
                    : "Reserve my seat"}
                </button>
                <p className="ra-soft">
                  <span className="ra-soft-q">Not ready to commit?</span>{" "}
                  <button
                    type="button"
                    className="ra-soft-a"
                    disabled={status === "loading"}
                    onClick={(e) => void handleSubmit(e, INTENT_KEEP_POSTED)}
                  >
                    Just keep me posted
                  </button>
                </p>
              </form>

              <p className="ra-fine">
                No card, nothing charged. You're telling me you want in at this price — I'll come to you when it opens.
              </p>
              <p className="ra-fine ra-fine--small">
                Protected under Saudi PDPL · <Link to="/privacy">Privacy Policy</Link> · Already have a seat? <Link to="/auth">Sign in →</Link>
              </p>
            </>
          )}

          {status === "success" && intent === INTENT_RESERVE && (
            <Ceremony
              position={position}
              seatTag={seats ? `Seat ${seats.claimed} of ${seats.cap} · reserved` : "Reserved"}
              title={RESERVED_TITLE}
              body={RESERVED_BODY}
              withSignature
            >
              {worthState === "sent" || worthState === "skipped" ? (
                <p className="ra-quiet" role="status">{WORTH_THANKS}</p>
              ) : (
                <div className="ra-worth">
                  <label htmlFor="ra-worth">{WORTH_QUESTION}</label>
                  <textarea
                    id="ra-worth" className="ra-field" rows={3} maxLength={1000}
                    placeholder={WORTH_PLACEHOLDER}
                    value={worth} onChange={(e) => setWorth(e.target.value)}
                  />
                  <div className="ra-doors">
                    <button type="button" className="ra-door ra-door-fill"
                      disabled={worthState === "sending"} onClick={() => void sendWorth()}>
                      {worthState === "sending" ? <span className="ra-pulse">Sending…</span> : WORTH_SEND}
                    </button>
                    <button type="button" className="ra-door ra-door-line"
                      onClick={() => setWorthState("skipped")}>{WORTH_SKIP}</button>
                  </div>
                </div>
              )}
            </Ceremony>
          )}

          {status === "success" && intent === INTENT_KEEP_POSTED && (
            <Ceremony position={null} title={POSTED_TITLE} body={`Thank you, ${submittedName}.`} />
          )}

          {status === "duplicate" && (
            <Ceremony
              position={null}
              title="You already asked."
              body="Your request is with me. If I haven't come back to you yet, I will."
              quiet="Need to check where it stands? Write to support@aura-intel.org and I'll answer."
            />
          )}
        </div>
      </main>

      <footer className="ra-foot">
        <span>© 2026 Aura</span>
        <span>aura-intel.org</span>
        <span>
          <Link to="/privacy">Privacy</Link> · <Link to="/terms">Terms</Link> ·{" "}
          <a href="/contact">Contact</a>
        </span>
      </footer>
    </div>
  );
}

/* ── pieces ── */

function Field({
  id, label, value, onChange, error, placeholder, type = "text", maxLength,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  error?: string; placeholder?: string; type?: string; maxLength?: number;
}) {
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <input
        id={id} type={type} value={value} placeholder={placeholder} maxLength={maxLength}
        className="ra-field" aria-invalid={!!error}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && <p className="ra-err">{error}</p>}
    </div>
  );
}

function Select({
  id, label, value, options, placeholder, onChange, error,
}: {
  id: string; label: string; value: string; options: string[];
  placeholder: string; onChange: (v: string) => void; error?: string;
}) {
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <select
        id={id} value={value} className="ra-field ra-select" aria-invalid={!!error}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      {error && <p className="ra-err">{error}</p>}
    </div>
  );
}

function Ceremony({
  title, body, quiet, withSignature, position, seatTag, children,
}: {
  title: string; body: string; quiet?: string;
  withSignature?: boolean; position: number | null; seatTag?: string;
  children?: React.ReactNode;
}) {
  const counted = usePositionCount(position ?? 0, position != null);
  return (
    <div className="ra-ceremony">
      <div className="ra-mk"><AuraLogo size={44} variant="auto" /></div>
      {seatTag ? (
        <span className="ra-pos"><i className="ra-d" />{seatTag}</span>
      ) : position != null && position > 0 && (
        <span className="ra-pos"><i className="ra-d" />Number {counted} on the list</span>
      )}
      <h2 className="ra-h2">{title}</h2>
      <p className="ra-cbody">{body}</p>
      {quiet && <p className="ra-quiet">{quiet}</p>}
      {children}
      <p className="ra-inbox">Check your inbox — and your spam folder — for a note from Aura.</p>
      {withSignature && (
        <div className="ra-sig">
          <div className="ra-nm">Mohammad Mahafdhah</div>
          <div className="ra-rl">Aura builder</div>
        </div>
      )}
    </div>
  );
}

/* ── styles · every selector scoped under .ra ── */

const RA_CSS = `
.ra{
  --page:#F2F5F9; --n0:#FFFFFF; --n100:#EEF2F7; --n200:#E2E7EE; --n300:#D6DCE4;
  --n400:#98A2AE; --n500:#5B6673; --n700:#3A434E; --n900:#0F1519;
  --act:#0670C4; --act-50:#E6F2FD; --cy:#00CEC9; --cy-t:#00807B;
  --err:#C0392B; --err-50:#FCEAE6;
  --ui:'Inter',ui-sans-serif,system-ui,-apple-system,sans-serif;
  --ser:'Inter',ui-sans-serif,system-ui,-apple-system,sans-serif;
  --mono:'IBM Plex Mono',ui-monospace,Menlo,monospace;
  --ar:'Cairo','CairoAR',sans-serif;
  --gut:clamp(20px,4.5vw,56px);
  min-height:100vh; display:flex; flex-direction:column;
  background:var(--page); color:var(--n900);
  font-family:var(--ui); font-size:16px; line-height:1.6;
  -webkit-font-smoothing:antialiased;
}
.ra *,.ra *::before,.ra *::after{box-sizing:border-box;}
.ra p,.ra h1,.ra h2,.ra ul,.ra li{margin:0;padding:0;list-style:none;}
.ra a{color:inherit;text-decoration:none;}
.ra :focus-visible{outline:2px solid var(--act);outline-offset:3px;border-radius:6px;}

.ra-h1{font-family:var(--ser);font-weight:700;font-size:clamp(34px,4.4vw,52px);line-height:1;letter-spacing:-.028em;}
.ra-h1 em{font-style:normal;color:var(--n400);}
.ra-h2{font-family:var(--ser);font-weight:700;font-size:clamp(24px,2.8vw,32px);line-height:1.08;letter-spacing:-.02em;margin-bottom:8px;}
.ra-lede{font-size:16.5px;line-height:1.6;color:var(--n700);max-width:44ch;margin-top:22px;}

.ra-mast{display:flex;align-items:center;justify-content:space-between;gap:16px;
  padding:18px var(--gut);border-bottom:1px solid var(--n200);}
.ra-brand{display:flex;align-items:center;gap:9px;}
.ra-bn{font-family:var(--ser);font-weight:700;font-size:20px;letter-spacing:-.02em;line-height:1;}
.ra-mr{display:flex;align-items:center;gap:6px;}
.ra-mlink{font-family:var(--mono);font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;
  color:var(--n500);padding:11px 13px;border-radius:999px;transition:color .2s ease,background .2s ease;
  display:inline-flex;align-items:center;min-height:44px;}
.ra-mlink:hover{color:var(--n900);background:var(--n100);}

.ra-main{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:clamp(28px,5vw,72px);
  padding:clamp(36px,6vw,76px) var(--gut) clamp(48px,7vw,88px);
  max-width:1240px;margin:0 auto;width:100%;align-items:start;}
.ra-eyebrow{position:relative;display:inline-block;padding:9px 14px;margin-bottom:24px;}
.ra-eyebrow span{font-family:var(--mono);font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--n700);}
.ra-eyebrow::before,.ra-eyebrow::after{content:'';position:absolute;width:13px;height:13px;border:1.5px solid var(--n300);}
.ra-eyebrow::before{left:0;bottom:0;border-top:0;border-right:0;}
.ra-eyebrow::after{right:0;top:0;border-bottom:0;border-left:0;}

.ra-rack{margin-top:clamp(30px,4vw,44px);}
.ra-rackhead{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:12px;}
.ra-n{font-family:var(--mono);font-size:12px;letter-spacing:.12em;color:var(--n900);}
.ra-n b{font-weight:500;}
.ra-lb{font-family:var(--mono);font-size:9.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--n400);}
.ra-ticks{display:flex;gap:3px;align-items:flex-end;height:26px;}
.ra-ticks i{flex:1;border-radius:2px;background:var(--n300);height:12px;
  transition:height .5s cubic-bezier(.2,.7,.3,1),background .4s ease;}
.ra-ticks i.taken{background:var(--n900);height:20px;}
.ra-ticks i.yours{background:var(--act);height:26px;box-shadow:0 0 0 3px var(--act-50);
  animation:ra-breathe 2.2s ease-in-out infinite;}
@keyframes ra-breathe{0%,100%{opacity:1;}50%{opacity:.45;}}
.ra-rackfoot{margin-top:12px;font-family:var(--mono);font-size:10px;letter-spacing:.13em;
  text-transform:uppercase;color:var(--act);display:flex;align-items:center;gap:8px;}
.ra-sq{width:8px;height:12px;border-radius:2px;background:var(--act);flex:0 0 8px;}
.ra-rackfoot.counted{color:var(--cy-t);}
.ra-rackfoot.counted .ra-sq{background:var(--cy);}
.ra-rackteaser{font-size:16px;line-height:1.55;color:var(--n900);margin-top:8px;}

.ra-ledger{margin-top:clamp(30px,4vw,44px);border-top:2px solid var(--n900);}
.ra-lrow{display:flex;align-items:baseline;gap:12px;padding:15px 0;border-bottom:1px solid var(--n200);}
.ra-lrow:last-child{border-bottom:0;}
.ra-k{font-family:var(--ser);font-weight:700;font-size:17px;line-height:1.15;letter-spacing:-.015em;white-space:nowrap;}
.ra-lead{flex:1;height:1px;align-self:flex-end;margin-bottom:6px;min-width:16px;
  background-image:radial-gradient(circle,var(--n300) .9px,transparent .9px);
  background-size:6px 1px;background-repeat:repeat-x;}
.ra-v{font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;
  color:var(--n500);text-align:right;white-space:nowrap;}
.ra-v.cy{color:var(--cy-t);}
.ra-v.act{color:var(--act);}
.ra-ar{font-family:var(--ar);direction:rtl;line-height:1.9;margin-top:30px;font-size:19px;color:var(--cy-t);}
.ra-readfree{margin-top:22px;font-size:14px;line-height:1.6;color:var(--n500);max-width:46ch;}
.ra-readfree a{color:var(--act);text-decoration:underline;text-underline-offset:3px;}
.ra-readfree a:hover{color:#04477C;}

.ra-sheet{background:var(--n0);border:1px solid var(--n200);border-radius:24px;
  padding:clamp(24px,3vw,36px);box-shadow:0 30px 64px -40px rgba(15,21,25,.28);}
.ra-sub{font-size:14.5px;color:var(--n500);margin-bottom:26px;}
.ra-form{display:flex;flex-direction:column;gap:18px;}
.ra label{display:block;font-family:var(--mono);font-size:9.5px;letter-spacing:.16em;
  text-transform:uppercase;color:var(--n500);margin-bottom:7px;}
.ra-field{width:100%;background:var(--page);border:1px solid var(--n200);color:var(--n900);
  font-size:15.5px;font-family:inherit;padding:14px 16px;border-radius:12px;outline:none;
  transition:border-color .25s ease,box-shadow .25s ease,background .25s ease;}
.ra-field::placeholder{color:var(--n400);}
.ra-field:focus{border-color:var(--act);background:var(--n0);box-shadow:0 0 0 4px var(--act-50);}
.ra-field[aria-invalid="true"]{border-color:var(--err);}
.ra-select{appearance:none;-webkit-appearance:none;-moz-appearance:none;padding-right:38px;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'><path d='M2 4l4 4 4-4' stroke='%2398A2AE' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>");
  background-repeat:no-repeat;background-position:right 15px center;}
.ra-err{margin-top:7px;font-size:12.5px;color:var(--err);}
.ra-alert{padding:13px 15px;border-radius:12px;background:var(--err-50);
  border:1px solid color-mix(in srgb,var(--err) 34%,transparent);color:var(--err);font-size:14px;}
.ra-btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:54px;width:100%;
  border-radius:999px;font-size:16px;font-weight:600;font-family:inherit;border:1px solid transparent;
  background:var(--n900);color:#fff;margin-top:6px;cursor:pointer;
  transition:transform .2s ease,box-shadow .25s ease,opacity .2s ease;}
.ra-btn:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 16px 34px -16px rgba(15,21,25,.7);}
.ra-btn:disabled{cursor:default;opacity:.85;}
.ra-a{width:24px;height:24px;border-radius:50%;background:rgba(255,255,255,.15);
  display:grid;place-items:center;font-size:11px;transition:transform .22s cubic-bezier(.2,.7,.3,1);}
.ra-btn:hover:not(:disabled) .ra-a{transform:translate(2px,-2px);}
.ra-pulse{animation:ra-pulse 1.4s ease-in-out infinite;}
@keyframes ra-pulse{0%,100%{opacity:1;}50%{opacity:.55;}}
.ra-legal{font-size:11.5px;color:var(--n400);text-align:center;margin-top:14px;line-height:1.6;}
.ra-legal a{color:var(--act);}
.ra-price{display:flex;flex-direction:column;gap:4px;align-items:center;text-align:center;margin-top:4px;}
.ra-price-n{font-family:var(--mono);font-size:20px;font-weight:600;letter-spacing:-.02em;color:var(--n900);}
.ra-price-s{font-size:12.5px;color:var(--n500);line-height:1.5;}

.ra-onejob{margin-top:20px;font-size:17px;line-height:1.55;font-weight:600;color:var(--n900);max-width:44ch;}
.ra-howlb{margin-top:24px;font-family:var(--mono);font-size:9.5px;letter-spacing:.18em;
  text-transform:uppercase;color:var(--n400);}
.ra-how{margin-top:10px;display:flex;flex-direction:column;gap:8px;max-width:46ch;}
.ra-how li{font-size:14px;line-height:1.55;color:var(--n700);padding-left:16px;position:relative;}
.ra-how li::before{content:'';position:absolute;left:0;top:9px;width:7px;height:1px;background:var(--act);}
.ra-constraint{margin-top:18px;font-size:14px;line-height:1.6;color:var(--n900);max-width:44ch;}
.ra-vs{margin-top:14px;font-size:14px;line-height:1.55;color:var(--n700);max-width:46ch;}

/* Two doors — identical geometry, so the choice between them is real. */
.ra-doors{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px;}
.ra-door{display:inline-flex;align-items:center;justify-content:center;text-align:center;
  min-height:52px;padding:12px 14px;width:100%;border-radius:999px;font-family:inherit;
  font-size:15px;font-weight:600;line-height:1.25;cursor:pointer;
  transition:background .2s ease,color .2s ease,box-shadow .25s ease;}
.ra-door:disabled{cursor:default;opacity:.85;}
.ra-door-fill{background:var(--act);color:#fff;border:1.5px solid var(--act);}
.ra-door-fill:hover:not(:disabled){background:#04477C;border-color:#04477C;}
.ra-door-line{background:var(--n0);color:var(--act);border:1.5px solid var(--act);}
.ra-door-line:hover:not(:disabled){background:var(--act-50);}
.ra-reservenote{margin-top:12px;font-size:12.5px;line-height:1.6;color:var(--n500);text-align:center;}
.ra-worth{margin-top:22px;text-align:left;}
.ra-worth label{margin-bottom:9px;text-transform:none;letter-spacing:0;font-family:var(--ui);
  font-size:14px;line-height:1.55;color:var(--n700);}
.ra-worth textarea{resize:vertical;}
@media (max-width:520px){.ra-doors{grid-template-columns:1fr;}}
.ra-signin{text-align:center;margin-top:22px;padding-top:20px;border-top:1px solid var(--n200);
  font-size:14.5px;color:var(--n500);}
.ra-signin a{color:var(--act);font-weight:600;}

.ra-ceremony{text-align:center;padding:8px 0;}
.ra-mk{display:flex;justify-content:center;margin-bottom:22px;}
.ra-pos{display:inline-flex;align-items:center;gap:9px;border:1px solid rgba(0,128,123,.3);
  background:rgba(0,206,201,.07);border-radius:999px;padding:8px 15px;font-family:var(--mono);
  font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--cy-t);margin-bottom:18px;}
.ra-d{width:7px;height:7px;border-radius:50%;background:var(--cy);}
.ra-cbody{font-size:15px;color:var(--n700);line-height:1.7;max-width:42ch;margin:0 auto;}
.ra-quiet{font-size:13.5px;color:var(--n500);line-height:1.7;max-width:42ch;
  margin:18px auto 0;font-style:italic;}
.ra-inbox{font-size:13px;color:var(--n400);line-height:1.6;max-width:42ch;margin:16px auto 0;}
.ra-sig{margin-top:32px;padding-top:22px;border-top:1px solid var(--n200);}
.ra-nm{font-family:var(--ser);font-weight:700;font-size:20px;letter-spacing:-.02em;}
.ra-rl{font-family:var(--mono);font-size:9.5px;letter-spacing:.18em;text-transform:uppercase;
  color:var(--n500);margin-top:5px;}

.ra-foot{border-top:1px solid var(--n200);padding:22px var(--gut);display:flex;flex-wrap:wrap;
  gap:10px 22px;justify-content:space-between;font-family:var(--mono);font-size:9.5px;
  letter-spacing:.16em;text-transform:uppercase;color:var(--n400);}
.ra-foot a:hover{color:var(--n700);}

.ra input:-webkit-autofill,
.ra input:-webkit-autofill:hover,
.ra input:-webkit-autofill:focus,
.ra select:-webkit-autofill{
  -webkit-box-shadow:0 0 0 1000px #F2F5F9 inset !important;
  -webkit-text-fill-color:#0F1519 !important;
  caret-color:#0F1519 !important;
  transition:background-color 5000s ease-in-out 0s;
}

@media (max-width:900px){
  .ra-main{grid-template-columns:1fr;gap:34px;}
  .ra-ticks{height:22px;}
  .ra-mlink{padding:11px 10px;}
}
@media (prefers-reduced-motion:reduce){
  .ra *,.ra *::before,.ra *::after{animation:none !important;transition:none !important;}
}
`;
