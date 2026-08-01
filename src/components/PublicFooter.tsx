import { Link } from "react-router-dom";

/**
 * Canonical public footer — System-B light.
 * Sits at the bottom of any flex-column page via marginTop:auto.
 * Scoped under .pf.
 */
const LINKS: Array<{ label: string; to: string }> = [
  { label: "Home", to: "/" },
  { label: "Our Story", to: "/our-story" },
  { label: "The Guide", to: "/guide" },
  { label: "Contact", to: "/contact" },
  { label: "Security & Trust", to: "/trust" },
  { label: "Privacy", to: "/privacy" },
  { label: "Terms", to: "/terms" },
];

const PublicFooter = () => (
  <>
    <style>{PF_CSS}</style>
    <footer className="pf">
      <div className="pf-in">
        <nav className="pf-links">
          {LINKS.map((l) => (
            <Link key={l.to} to={l.to}>{l.label}</Link>
          ))}
        </nav>
        <div className="pf-right">
          <a href="mailto:support@aura-intel.org">support@aura-intel.org</a>
          <span>© 2026 Aura · Built in Riyadh, for the world.</span>
        </div>
      </div>
    </footer>
  </>
);

export default PublicFooter;

const PF_CSS = `
.pf{
  --page:#F2F5F9; --n200:#E2E7EE; --n400:#98A2AE; --n500:#5B6673; --n900:#0F1519;
  --mono:'IBM Plex Mono',ui-monospace,Menlo,monospace;
  margin-top:auto; background:var(--page); border-top:1px solid var(--n200);
  padding:28px clamp(20px,4.5vw,56px);
}
.pf *,.pf *::before,.pf *::after{box-sizing:border-box;}
.pf a{text-decoration:none;color:inherit;}
.pf :focus-visible{outline:2px solid #0670C4;outline-offset:3px;border-radius:6px;}
.pf-in{max-width:1240px;margin:0 auto;display:flex;flex-wrap:wrap;
  align-items:flex-start;justify-content:space-between;gap:16px 28px;
  font-family:var(--mono);font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;}
.pf-links{display:flex;flex-wrap:wrap;gap:6px 18px;}
.pf-links a{color:var(--n500);padding:6px 0;transition:color .2s ease;}
.pf-links a:hover{color:var(--n900);}
.pf-right{display:flex;flex-direction:column;gap:6px;color:var(--n400);text-align:right;}
.pf-right a{transition:color .2s ease;}
.pf-right a:hover{color:var(--n900);}
@media (max-width:640px){
  .pf-in{flex-direction:column;}
  .pf-right{text-align:left;}
}
@media (prefers-reduced-motion:reduce){ .pf *{transition:none !important;} }
`;
