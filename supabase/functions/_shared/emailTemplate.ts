// System-B "Studio Plate" email shell — the single template for every Aura email.
// Table-based, all styles inline. No <style> block, no CSS variables, no flex/grid.
// Do not fork this file: every Resend email function renders through renderEmail().

export const CANVAS = "#F2F5F9";
export const CARD = "#FFFFFF";
export const BORDER = "#E2E7EE";
export const INK = "#0F1519";
export const INK_SOFT = "#5B6673";
export const INK_FAINT = "#98A2AE";
export const ACCENT = "#0670C4";

export const DISPLAY = "'Instrument Serif', Georgia, serif";
export const BODY = "'Inter', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
export const MONO = "'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace";

const LOGO_URL = "https://aura-intel.org/email/aura-mark-ink.png";

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Small caps label. */
export function label(text: string): string {
  return `<p style="margin:0 0 10px;font-family:${MONO};font-size:10px;line-height:1.4;letter-spacing:.16em;text-transform:uppercase;color:${INK_FAINT};">${text}</p>`;
}

/** Display heading. */
export function heading(text: string): string {
  return `<h1 style="margin:0 0 16px;font-family:${DISPLAY};font-size:28px;line-height:1.2;font-weight:400;color:${INK};">${text}</h1>`;
}

/** Body paragraph. */
export function paragraph(text: string, soft = true): string {
  return `<p style="margin:0 0 16px;font-family:${BODY};font-size:15px;line-height:1.65;color:${soft ? INK_SOFT : INK};">${text}</p>`;
}

/** Quiet note under a button or at the end of a block. */
export function note(text: string): string {
  return `<p style="margin:0 0 16px;font-family:${BODY};font-size:13px;line-height:1.6;color:${INK_FAINT};">${text}</p>`;
}

/** Quoted block, e.g. a personal note from the inviter. */
export function quote(text: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;"><tr>
    <td style="padding:14px 18px;background:${CANVAS};border-left:2px solid ${ACCENT};border-radius:4px;font-family:${BODY};font-size:14px;line-height:1.65;color:${INK_SOFT};font-style:italic;">${text}</td>
  </tr></table>`;
}

export function divider(): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;"><tr><td style="height:1px;line-height:1px;font-size:0;background:${BORDER};">&nbsp;</td></tr></table>`;
}

/** Sign-off. The founder's name is fixed. */
export function signature(role = "Aura builder"): string {
  return `<p style="margin:24px 0 0;font-family:${BODY};font-size:15px;line-height:1.5;color:${INK};font-weight:600;">Mohammad Mahafdhah</p>
  <p style="margin:2px 0 0;font-family:${BODY};font-size:13px;line-height:1.5;color:${INK_FAINT};">${role}</p>`;
}

export interface EmailOptions {
  /** Hidden inbox preview line. */
  preheader?: string;
  /** HTML content slot. */
  body: string;
  /** Optional single CTA. */
  cta?: { href: string; label: string };
}

/** The one and only email shell. */
export function renderEmail(opts: EmailOptions): string {
  const { preheader = "", body, cta } = opts;

  const ctaBlock = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 4px;"><tr>
        <td align="center" bgcolor="${INK}" style="border-radius:999px;">
          <a href="${cta.href}" style="display:inline-block;padding:0 30px;height:48px;line-height:48px;font-family:${BODY};font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:999px;">${cta.label}</a>
        </td>
      </tr></table>`
    : "";

  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background-color:${CANVAS};font-family:${BODY};color:${INK_SOFT};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${CANVAS}" style="background-color:${CANVAS};">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background-color:${CARD};border:1px solid ${BORDER};border-radius:16px;">
      <tr><td style="padding:32px 36px 0;">
        <img src="${LOGO_URL}" width="36" height="36" alt="Aura" style="display:block;width:36px;height:36px;border:0;outline:none;text-decoration:none;">
      </td></tr>
      <tr><td style="padding:24px 36px 8px;">${body}${ctaBlock}</td></tr>
      <tr><td style="padding:20px 36px 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="border-top:1px solid ${BORDER};padding-top:16px;font-family:${MONO};font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:${INK_FAINT};">
            Aura &middot; <a href="https://aura-intel.org" style="color:${INK_FAINT};text-decoration:none;">aura-intel.org</a>
          </td>
        </tr></table>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}
