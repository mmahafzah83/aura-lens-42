import { Link } from "react-router-dom";
import AuraLogo from "@/components/brand/AuraLogo";

/**
 * Canonical masthead for every public page (legal, story, guide).
 * System-B: light surface, dark ink, blue for the one action.
 * Scoped under .pm so nothing leaks into the app shell.
 */
const PublicMasthead = ({ authed = false }: { authed?: boolean }) => (
  <>
    <style>{PM_CSS}</style>
    <header className="pm">
      <Link className="pm-brand" to="/" aria-label="Aura home">
        <AuraLogo size={24} variant="auto" />
        <span className="pm-bn">Aura</span>
      </Link>
      <nav className="pm-nav">
        {authed ? (
          <Link className="pm-cta" to="/dashboard">
            Back to your dashboard <span className="pm-a">↗</span>
          </Link>
        ) : (
          <>
            <Link className="pm-link" to="/auth">Sign in</Link>
            <Link className="pm-cta" to="/request-access">
              Request a founder seat <span className="pm-a">↗</span>
            </Link>
          </>
        )}
      </nav>
    </header>
  </>
);

export default PublicMasthead;

const PM_CSS = `
.pm{
  --page:#F2F5F9; --n0:#FFFFFF; --n100:#EEF2F7; --n200:#E2E7EE;
  --n400:#98A2AE; --n500:#5B6673; --n900:#0F1519; --act:#0670C4;
  --ui:'Inter',ui-sans-serif,system-ui,-apple-system,sans-serif;
  --ser:'Instrument Serif',Georgia,serif;
  --mono:'IBM Plex Mono',ui-monospace,Menlo,monospace;
  position:sticky; top:0; z-index:40;
  display:flex; align-items:center; justify-content:space-between; gap:16px;
  padding:16px clamp(20px,4.5vw,56px);
  background:rgba(242,245,249,.92); -webkit-backdrop-filter:blur(12px); backdrop-filter:blur(12px);
  border-bottom:1px solid var(--n200);
  font-family:var(--ui);
}
.pm *,.pm *::before,.pm *::after{box-sizing:border-box;}
.pm a{text-decoration:none;}
.pm :focus-visible{outline:2px solid var(--act);outline-offset:3px;border-radius:6px;}
.pm-brand{display:flex;align-items:center;gap:9px;color:var(--n900);}
.pm-bn{font-family:var(--ser);font-size:21px;line-height:1;}
.pm-nav{display:flex;align-items:center;gap:6px;}
.pm-link{font-family:var(--mono);font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;
  color:var(--n500);padding:11px 13px;border-radius:999px;min-height:44px;
  display:inline-flex;align-items:center;transition:color .2s ease,background .2s ease;}
.pm-link:hover{color:var(--n900);background:var(--n100);}
.pm-cta{display:inline-flex;align-items:center;gap:8px;background:var(--n900);color:#fff;
  border-radius:999px;padding:10px 16px;font-size:13.5px;font-weight:600;white-space:nowrap;
  min-height:44px;transition:transform .2s ease,box-shadow .25s ease;}
.pm-cta:hover{transform:translateY(-1px);box-shadow:0 10px 22px -10px rgba(15,21,25,.5);}
.pm-a{display:grid;place-items:center;width:19px;height:19px;border-radius:50%;
  background:rgba(255,255,255,.16);font-size:10px;transition:transform .22s cubic-bezier(.2,.7,.3,1);}
.pm-cta:hover .pm-a{transform:translate(2px,-2px);}
@media (max-width:520px){
  .pm-cta{font-size:12.5px;padding:10px 13px;}
  .pm-link{padding:11px 9px;}
}
@media (prefers-reduced-motion:reduce){
  .pm *{transition:none !important;}
}
`;
