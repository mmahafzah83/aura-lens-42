import { Link } from "react-router-dom";
import { usePageMeta } from "@/hooks/usePageMeta";
import PublicMasthead from "@/components/PublicMasthead";
import PublicFooter from "@/components/PublicFooter";

/**
 * The Gate — what someone reads before the nine-minute assessment begins.
 * System-B only. The account step still lives at /auth?intent=assessment;
 * this page leads to it.
 */
const Assessment = () => {
  usePageMeta({
    title: "Aura — Start your professional assessment",
    description:
      "Nine minutes, free, and yours to keep. Aura reads your LinkedIn, your CV and your own answers, then shows what you are provably good at and what is real but invisible.",
    path: "/assessment",
  });

  return (
    <div className="asg">
      <style>{ASG_CSS}</style>
      <PublicMasthead />

      <main className="asg-wrap">
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
              Nine minutes, and you&rsquo;ll see
              <br />
              <span className="asg-h1b">what your profile has been hiding.</span>
            </h1>

            <p className="asg-sub">
              Aura reads your LinkedIn, your CV and your own answers, then tells you what you are
              provably good at, what is real but invisible, and the position nobody else is holding.
            </p>

            <div className="asg-stats">
              <div className="asg-stat">
                <span className="asg-n">9 min</span>
                <span className="asg-c">stop and return anytime</span>
              </div>
              <div className="asg-stat">
                <span className="asg-n">Free</span>
                <span className="asg-c">and yours to keep</span>
              </div>
              <div className="asg-stat">
                <span className="asg-n">0</span>
                <span className="asg-c">posts published</span>
              </div>
            </div>

            <div className="asg-acts">
              <Link className="asg-btn asg-bp" to="/auth?intent=assessment">
                Start with my LinkedIn <span className="asg-a">↗</span>
              </Link>
              <a className="asg-btn asg-bg" href="#inside">
                What&rsquo;s inside the report
              </a>
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

        {/* ── below · the shape of the nine minutes ── */}
        <section className="asg-three" id="inside">
          <article className="asg-card">
            <span className="asg-k">FIRST · 90 SECONDS</span>
            <h2>Your LinkedIn, read</h2>
            <p>We read what is already public and turn it into a first picture of how you land.</p>
          </article>
          <article className="asg-card">
            <span className="asg-k">THEN · 7 MINUTES</span>
            <h2>Your CV and nine questions</h2>
            <p>Upload what you have. Answer in your own words. Stop and come back whenever you like.</p>
          </article>
          <article className="asg-card">
            <span className="asg-k">AT THE END</span>
            <h2>Your report</h2>
            <p>What you are provably good at, what is real but invisible, and the position open to you.</p>
          </article>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
};

const ASG_CSS = `
.asg{--ink:#0F1519;--ink2:#37424F;--ink3:#66707D;--ink4:#9AA4B0;--line:#E2E7EE;--white:#FFF;
  --canvas:#F2F5F9;--blue:#0670C4;--blue2:#04477C;--bluetint:#E7F1FB;--cyan:#00CEC9;--cyanT:#00807B;
  --cyantint:#E0F7F6;--ui:"Inter",system-ui,sans-serif;--mono:"IBM Plex Mono",monospace;
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
.asg-bp{background:var(--ink);color:var(--white);}
.asg-bp:hover{transform:translateY(-2px);}
.asg-bg{background:transparent;color:var(--ink2);border:1px solid var(--line);}
.asg-bg:hover{background:var(--white);}
.asg-trust{font-size:12px;color:var(--ink4);line-height:1.55;margin:18px 0 0;max-width:50ch;}
.asg-art svg{width:100%;height:auto;display:block;}
.asg-three{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:64px;}
.asg-card{background:var(--white);border:1px solid var(--line);border-radius:16px;padding:22px;}
.asg-k{font-family:var(--mono);font-size:9px;letter-spacing:.17em;color:var(--blue);}
.asg-card h2{font-size:17px;font-weight:700;margin:10px 0 8px;letter-spacing:-.01em;}
.asg-card p{font-size:13px;line-height:1.55;color:var(--ink3);}
@media(max-width:900px){
  .asg-cols{grid-template-columns:1fr;gap:34px;}
  .asg-three{grid-template-columns:1fr;}
  .asg-h1{font-size:27px;}
  .asg-acts .asg-btn{flex:1 1 100%;justify-content:center;}
}
`;

export default Assessment;