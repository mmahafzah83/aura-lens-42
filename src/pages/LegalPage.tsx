import { Link, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import PublicMasthead from "@/components/PublicMasthead";
import PublicFooter from "@/components/PublicFooter";

export interface LegalSection {
  title: string;
  body: string;
}

interface Props {
  title: string;
  updated: string;
  sections: LegalSection[];
}

const LegalPage = ({ title, updated, sections }: Props) => {
  const location = useLocation();
  const path = location.pathname;
  const isTrust = path.startsWith("/trust");
  const isTerms = path.startsWith("/terms");

  const kicker = isTrust ? "Trust · Security" : isTerms ? "Legal · Terms" : "Legal · Privacy";
  const crossTo = isTrust ? "/privacy" : isTerms ? "/privacy" : "/terms";
  const crossLabel = isTrust
    ? "Read our Privacy Policy →"
    : isTerms
      ? "Read our Privacy Policy →"
      : "Read our Terms of Service →";

  return (
    <div className="lg">
      <style>{LG_CSS}</style>
      <PublicMasthead />

      <main className="lg-main">
        <Link to="/" className="lg-back"><ArrowLeft size={13} /> Back to home</Link>

        <div className="lg-eyebrow"><span>{kicker}</span></div>
        <h1 className="lg-h1">{title}</h1>
        <p className="lg-updated">Last updated · {updated}</p>

        <div className="lg-sections">
          {sections.map((s, i) => (
            <section key={i} className="lg-sec">
              <h2 className="lg-h2">
                <span className="lg-no">{String(i + 1).padStart(2, "0")}</span>
                {s.title}
              </h2>
              <p className="lg-body">{s.body}</p>
            </section>
          ))}
        </div>

        <div className="lg-end">
          <Link to="/" className="lg-back"><ArrowLeft size={13} /> Back to home</Link>
          <Link to={crossTo} className="lg-cross">{crossLabel}</Link>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
};

export default LegalPage;

const LG_CSS = `
.lg{
  --page:#F2F5F9; --n0:#FFFFFF; --n200:#E2E7EE; --n300:#D6DCE4;
  --n400:#98A2AE; --n500:#5B6673; --n700:#3A434E; --n900:#0F1519;
  --act:#0670C4; --cy:#00CEC9; --cy-t:#00807B;
  --ui:'Inter',ui-sans-serif,system-ui,-apple-system,sans-serif;
  --ser:'Instrument Serif',Georgia,serif;
  --mono:'IBM Plex Mono',ui-monospace,Menlo,monospace;
  min-height:100vh; display:flex; flex-direction:column;
  background:var(--page); color:var(--n900);
  font-family:var(--ui); -webkit-font-smoothing:antialiased;
}
.lg *,.lg *::before,.lg *::after{box-sizing:border-box;}
.lg p,.lg h1,.lg h2{margin:0;}
.lg a{text-decoration:none;color:inherit;}
.lg :focus-visible{outline:2px solid var(--act);outline-offset:3px;border-radius:6px;}

.lg-main{flex:1;width:100%;max-width:760px;margin:0 auto;
  padding:clamp(44px,7vw,76px) clamp(20px,4.5vw,40px) clamp(48px,7vw,72px);}
.lg-back{display:inline-flex;align-items:center;gap:6px;font-family:var(--mono);
  font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--n500);
  min-height:40px;transition:color .2s ease;}
.lg-back:hover{color:var(--n900);}
.lg-eyebrow{position:relative;display:inline-block;padding:9px 14px;margin:22px 0 20px;}
.lg-eyebrow span{font-family:var(--mono);font-size:10px;letter-spacing:.2em;
  text-transform:uppercase;color:var(--n700);}
.lg-eyebrow::before,.lg-eyebrow::after{content:'';position:absolute;width:13px;height:13px;
  border:1.5px solid var(--n300);}
.lg-eyebrow::before{left:0;bottom:0;border-top:0;border-right:0;}
.lg-eyebrow::after{right:0;top:0;border-bottom:0;border-left:0;}
.lg-h1{font-family:var(--ser);font-weight:400;font-size:clamp(34px,4.4vw,52px);
  line-height:1.02;letter-spacing:-.028em;}
.lg-updated{margin-top:12px;font-family:var(--mono);font-size:10px;letter-spacing:.14em;
  text-transform:uppercase;color:var(--n400);}

.lg-sections{margin-top:clamp(36px,5vw,54px);border-top:2px solid var(--n900);}
.lg-sec{padding:clamp(26px,3.4vw,34px) 0;border-bottom:1px solid var(--n200);}
.lg-sec:last-child{border-bottom:0;}
.lg-h2{font-family:var(--ser);font-weight:400;font-size:clamp(22px,2.6vw,29px);
  line-height:1.15;letter-spacing:-.018em;display:flex;gap:14px;align-items:baseline;}
.lg-no{font-family:var(--mono);font-size:11px;letter-spacing:.14em;color:var(--cy-t);
  flex:0 0 auto;transform:translateY(-2px);}
.lg-body{margin-top:14px;padding-left:38px;font-size:15.5px;line-height:1.78;
  color:var(--n700);white-space:pre-line;}

.lg-end{margin-top:clamp(40px,6vw,64px);padding-top:26px;border-top:1px solid var(--n200);
  display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:14px;}
.lg-cross{font-family:var(--mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;
  color:var(--act);font-weight:500;min-height:40px;display:inline-flex;align-items:center;}
.lg-cross:hover{text-decoration:underline;}

@media (max-width:560px){ .lg-body{padding-left:0;} }
@media (prefers-reduced-motion:reduce){ .lg *{transition:none !important;} }
`;
