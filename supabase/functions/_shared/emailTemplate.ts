// The one KnownBy email shell. Table-based, all styles inline.
// No <style> block, no CSS variables, no flex/grid. Do not fork this file.

export const CANVAS = "#F2F5F9";
export const CARD = "#FFFFFF";
export const BORDER = "#E2E7EE";
export const INK = "#0F1519";
export const INK_SOFT = "#5B6673";
export const INK_FAINT = "#98A2AE";
export const ACCENT = "#0670C4";

export const BODY = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
export const DISPLAY = BODY;
export const MONO = "'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace";
export const ARABIC = "'Cairo', 'Segoe UI', Tahoma, sans-serif";

export type EmailLang = "en" | "ar";
const isAr = (lang?: EmailLang | boolean) => lang === "ar" || lang === true;
const AR_TEXT = `font-family:${ARABIC};letter-spacing:0;text-transform:none;text-align:right;`;

/**
 * Arabic copy: keep Latin names, addresses and links left-to-right inside
 * the right-to-left line. Plain copy only — never pass HTML with attributes.
 */
export function isoAr(text: string): string {
  return String(text).replace(
    /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|aura-intel\.org(?:\/[A-Za-z0-9_-]+)*|KnownBy|LinkedIn)/g,
    '<span dir="ltr" style="white-space:nowrap">$1</span>',
  );
}

/** «أهلاً {name}،» with a first name, «أهلاً،» without. */
export function greetingAr(name?: string | null): string {
  const n = (name || "").trim();
  return n ? `أهلاً ${n}،` : "أهلاً،";
}

const LOGO_URL = "https://aura-intel.org/email/aura-mark-ink.png";
const DEFAULT_PREFS_URL = "https://www.aura-intel.org/dashboard?settings=notifications";

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Small caps label. */
export function label(text: string, lang?: EmailLang): string {
  if (isAr(lang)) return `<p style="margin:0 0 10px;${AR_TEXT}font-size:13px;line-height:1.9;font-weight:600;color:${INK_FAINT};">${text}</p>`;
  return `<p style="margin:0 0 10px;font-family:${MONO};font-size:10px;line-height:1.4;letter-spacing:.16em;text-transform:uppercase;color:${INK_FAINT};">${text}</p>`;
}

/** Display heading. */
export function heading(text: string, lang?: EmailLang): string {
  if (isAr(lang)) return `<h1 style="margin:0 0 16px;${AR_TEXT}font-size:26px;line-height:1.5;font-weight:700;color:${INK};">${text}</h1>`;
  return `<h1 style="margin:0 0 16px;font-family:${DISPLAY};font-size:28px;line-height:1.25;font-weight:700;color:${INK};">${text}</h1>`;
}

/** Body paragraph. */
export function paragraph(text: string, soft = true, lang?: EmailLang): string {
  if (isAr(lang)) return `<p style="margin:0 0 16px;${AR_TEXT}font-size:16px;line-height:1.9;color:${soft ? INK_SOFT : INK};">${text}</p>`;
  return `<p style="margin:0 0 16px;font-family:${BODY};font-size:15px;line-height:1.65;color:${soft ? INK_SOFT : INK};">${text}</p>`;
}

/** Quiet note under a button or at the end of a block. */
export function note(text: string, lang?: EmailLang): string {
  if (isAr(lang)) return `<p style="margin:0 0 16px;${AR_TEXT}font-size:14px;line-height:1.9;color:${INK_FAINT};">${text}</p>`;
  return `<p style="margin:0 0 16px;font-family:${BODY};font-size:13px;line-height:1.6;color:${INK_FAINT};">${text}</p>`;
}

/** Every number in mono. */
export function stat(value: string | number, label: string, lang?: EmailLang): string {
  if (isAr(lang)) return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" dir="rtl" style="margin:0 0 16px;"><tr>
    <td dir="ltr" style="font-family:${MONO};font-size:26px;line-height:1.2;color:${INK};text-align:right;">${value}</td>
  </tr><tr>
    <td style="padding-top:4px;${AR_TEXT}font-size:13px;line-height:1.9;color:${INK_FAINT};">${label}</td>
  </tr></table>`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;"><tr>
    <td style="font-family:${MONO};font-size:26px;line-height:1.2;color:${INK};">${value}</td>
  </tr><tr>
    <td style="padding-top:4px;font-family:${MONO};font-size:10px;line-height:1.4;letter-spacing:.16em;text-transform:uppercase;color:${INK_FAINT};">${label}</td>
  </tr></table>`;
}

/** Quoted block, e.g. a personal note from the inviter. */
export function quote(text: string, rtlOrLang: boolean | EmailLang = false): string {
  const rtl = isAr(rtlOrLang);
  const side = rtl ? "border-right" : "border-left";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;"><tr>
    <td${rtl ? ' dir="rtl" align="right"' : ""} style="padding:14px 18px;background:${CANVAS};${side}:2px solid ${ACCENT};border-radius:4px;font-family:${rtl ? ARABIC : BODY};font-size:${rtl ? 16 : 14}px;line-height:${rtl ? "1.9" : "1.65"};color:${INK_SOFT};${rtl ? "text-align:right;" : "font-style:italic;"}">${text}</td>
  </tr></table>`;
}

export function divider(): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;"><tr><td style="height:1px;line-height:1px;font-size:0;background:${BORDER};">&nbsp;</td></tr></table>`;
}

/** Sign-off. The founder's name is fixed. */
export function signature(role = "KnownBy builder", lang?: EmailLang): string {
  if (isAr(lang)) return `<p style="margin:24px 0 0;${AR_TEXT}font-size:16px;line-height:1.9;color:${INK};font-weight:600;">محمد محافظة</p>
  <p style="margin:2px 0 0;${AR_TEXT}font-size:14px;line-height:1.9;color:${INK_FAINT};">مؤسس <span dir="ltr">KnownBy</span></p>`;
  return `<p style="margin:24px 0 0;font-family:${BODY};font-size:15px;line-height:1.5;color:${INK};font-weight:600;">Mohammad Mahafzah</p>
  <p style="margin:2px 0 0;font-family:${BODY};font-size:13px;line-height:1.5;color:${INK_FAINT};">${role}</p>`;
}

export interface EmailOptions {
  /** Hidden inbox preview line. Required. */
  preheader: string;
  /** HTML content slot. */
  body: string;
  /** Optional single CTA. */
  cta?: { href: string; label: string };
  /** Arabic / right-to-left rendering. */
  rtl?: boolean;
  /** Reader's language; "ar" implies rtl. */
  lang?: EmailLang;
  /** Always-present preference link. */
  prefsHref?: string;
  /** Preference link copy. */
  prefsLabel?: string;
}

/** The one and only email shell. */
export function renderEmail(opts: EmailOptions): string {
  const { preheader, body, cta, prefsHref = DEFAULT_PREFS_URL } = opts;
  const rtl = opts.lang === "ar" || opts.rtl === true;
  const prefsLabel = opts.prefsLabel ?? (rtl ? "تفضيلات الرسائل" : "Email preferences");
  const font = rtl ? ARABIC : BODY;
  const dirAttr = rtl ? ' dir="rtl"' : "";
  const align = rtl ? "right" : "left";

  const ctaBlock = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 4px;"><tr>
        <td align="center" bgcolor="${ACCENT}" style="border-radius:8px;">
          <a href="${cta.href}" style="display:inline-block;padding:0 30px;height:48px;line-height:48px;font-family:${rtl ? ARABIC : BODY};font-size:15px;font-weight:600;${rtl ? "letter-spacing:0;" : ""}color:#FFFFFF;text-decoration:none;border-radius:8px;">${cta.label}</a>
        </td>
      </tr></table>`
    : "";

  return `<!doctype html><html lang="${rtl ? "ar" : "en"}"${dirAttr}><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">${rtl ? '\n<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">' : ""}
</head>
<body${dirAttr} style="margin:0;padding:0;background-color:${CANVAS};font-family:${font};color:${INK_SOFT};${rtl ? "line-height:1.9;text-align:right;" : ""}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${CANVAS}"${dirAttr} style="background-color:${CANVAS};">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"${dirAttr} style="width:100%;max-width:560px;background-color:${CARD};border:1px solid ${BORDER};border-radius:20px;">
      <tr><td align="${align}" style="padding:32px 36px 0;">
        <img src="${LOGO_URL}" width="36" height="36" alt="KnownBy" style="display:block;width:36px;height:36px;border:0;outline:none;text-decoration:none;">
      </td></tr>
      <tr><td align="${align}" style="padding:24px 36px 8px;font-family:${font};${rtl ? "line-height:1.9;text-align:right;" : ""}">${body}${ctaBlock}</td></tr>
      <tr><td style="padding:20px 36px 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          ${rtl ? `<td align="right" dir="rtl" style="border-top:1px solid ${BORDER};padding-top:16px;${AR_TEXT}font-size:13px;line-height:1.9;color:${INK_FAINT};">
            <span dir="ltr">KnownBy</span> &middot; <a href="https://aura-intel.org" dir="ltr" style="color:${INK_FAINT};text-decoration:none;">aura-intel.org</a>
            &middot; <a href="${prefsHref}" style="color:${INK_FAINT};text-decoration:underline;">${prefsLabel}</a>
          </td>` : `<td align="${align}" style="border-top:1px solid ${BORDER};padding-top:16px;font-family:${MONO};font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:${INK_FAINT};">
            KnownBy &middot; <a href="https://aura-intel.org" style="color:${INK_FAINT};text-decoration:none;">aura-intel.org</a>
            &middot; <a href="${prefsHref}" style="color:${INK_FAINT};text-decoration:underline;">${prefsLabel}</a>
          </td>`}
        </tr></table>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}
