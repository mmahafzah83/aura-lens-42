// System-A email theme — bone palette, email-safe literals.
// Visual module only. No logic. Used by transactional emails.

export const PAPER_BG = "#E9E2D3";
export const CARD = "#F1ECE1";
export const INK = "#1B1712";
export const INK_BODY = "#5A5147";
export const INK_MUTE = "#8A8073";
export const RULE = "#D6CDB9";
export const AMBER = "#D6A748";
export const OXBLOOD = "#6E2A26";
export const TEAL = "#36C5B0";

export const SERIF = "Georgia, 'Times New Roman', serif";
export const BODY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
export const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
export const ARABIC = "'Cairo', 'Segoe UI', Tahoma, sans-serif";

export function auraMark(size: number, ink: string = INK): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <g fill="${ink}" stroke="${ink}" stroke-linecap="round">
    <line x1="32" y1="18.89" x2="32" y2="8.77" stroke-width="1.2"/>
    <line x1="39.09" y1="20.97" x2="44.56" y2="12.45" stroke-width="1.2"/>
    <line x1="43.92" y1="26.56" x2="53.13" y2="22.35" stroke-width="1.2"/>
    <line x1="44.97" y1="33.87" x2="55" y2="35.31" stroke-width="1.2"/>
    <line x1="41.91" y1="40.58" x2="49.56" y2="47.22" stroke-width="1.2"/>
    <line x1="35.69" y1="44.58" x2="38.55" y2="54.29" stroke-width="1.2"/>
    <line x1="28.31" y1="44.58" x2="25.45" y2="54.29" stroke-width="1.2"/>
    <line x1="22.09" y1="40.58" x2="14.44" y2="47.22" stroke-width="1.2"/>
    <line x1="19.03" y1="33.87" x2="9" y2="35.31" stroke-width="1.2"/>
    <line x1="20.08" y1="26.56" x2="10.87" y2="22.35" stroke-width="1.2"/>
    <line x1="24.91" y1="20.97" x2="19.44" y2="12.45" stroke-width="1.2"/>
    <circle cx="32" cy="32" r="6.85" stroke="none"/>
  </g>
  <g stroke="${TEAL}" fill="${TEAL}" stroke-linecap="round">
    <line x1="40.07" y1="21.67" x2="49.24" y2="9.94" stroke-width="1.55"/>
    <circle cx="49.24" cy="9.94" r="1.61"/>
  </g>
</svg>`;
}

export function sectionLabel(t: string): string {
  return `<p style="font-family:${MONO};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${INK_MUTE};margin:0 0 10px;">${t}</p>`;
}

export function heading(t: string): string {
  return `<h1 style="font-family:${SERIF};font-size:26px;font-weight:500;line-height:1.25;color:${INK};margin:0 0 14px;">${t}</h1>`;
}

export function divider(): string {
  return `<hr style="border:none;border-top:1px solid ${RULE};margin:24px 0;"/>`;
}

export function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:${AMBER};color:${INK};font-family:${BODY};font-size:14px;font-weight:600;padding:13px 22px;border-radius:10px;text-decoration:none;">${label}</a>`;
}

export function pullQuote(t: string): string {
  return `<blockquote style="margin:18px 0;padding:4px 0 4px 18px;border-left:2px solid ${AMBER};font-family:${SERIF};font-style:italic;color:${INK};">${t}</blockquote>`;
}

export function emailHeader(): string {
  return `<tr><td align="left" style="padding-bottom:18px;">${auraMark(36, INK)}</td></tr>`;
}

export function emailFooter(): string {
  return `<tr><td style="border-top:1px solid ${RULE};padding-top:18px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td valign="middle" style="padding-right:8px;">${auraMark(16, INK_MUTE)}</td>
      <td valign="middle" style="font-family:${MONO};font-size:11px;color:${INK_MUTE};">Aura · Turns your expertise into presence · aura-intel.org</td>
    </tr></table>
  </td></tr>`;
}

export function emailShell(opts: { preheader?: string; body: string; maxWidth?: number }): string {
  const { preheader = "", body, maxWidth = 560 } = opts;
  return `<!doctype html><html><body style="margin:0;padding:0;background:${PAPER_BG};font-family:${BODY};color:${INK_BODY};">
<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${preheader}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER_BG};padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:${maxWidth}px;background:${CARD};border:1px solid ${RULE};border-radius:14px;padding:36px 36px 28px;">
      ${emailHeader()}
      <tr><td>${body}</td></tr>
      ${emailFooter()}
    </table>
  </td></tr>
</table>
</body></html>`;
}