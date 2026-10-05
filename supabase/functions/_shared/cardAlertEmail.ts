// oe-card-alerts email body. Pure: words come in through `v` (oe_vocabulary).
type Lang = "en" | "ar";
export type AlertCard = { id: string; opportunity_id: string; fit_band: string | null; created_at: string;
  opp: { title: string; issuer_raw: string | null; location: string | null; deadline: string | null; alive: boolean } };

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const fill = (t: string, vars: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
const MONTHS_EN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
function dateText(iso: string | null, lang: Lang): string {
  if (!iso) return "";
  const d = new Date(iso); if (isNaN(d.getTime())) return "";
  return `${d.getUTCDate()} ${(lang === "ar" ? MONTHS_AR : MONTHS_EN)[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
/** Arabic copy: keep KnownBy / LinkedIn left-to-right. Escaped text only. */
const isoAr = (s: string) => s.replace(/(KnownBy|LinkedIn)/g, '<span dir="ltr">$1</span>');

export function renderCardAlert(kind: "instant" | "digest", cards: AlertCard[], lang: Lang, v: (k: string, l: Lang) => string, site: string) {
  const rtl = lang === "ar";
  const t = (s: string) => (rtl ? isoAr(esc(s)) : esc(s));
  const font = rtl ? "Cairo, Tahoma, Arial, sans-serif" : "Inter, -apple-system, Segoe UI, Arial, sans-serif";
  const mono = "'IBM Plex Mono', Menlo, Consolas, monospace";
  const lh = rtl ? "1.9" : "1.5";
  const subject = kind === "instant"
    ? fill(v("email_instant_subject", lang), { title: cards[0].opp.title })
    : fill(v("email_digest_subject", lang), { n: cards.length });
  const intro = v(kind === "instant" ? "email_instant_intro" : "email_digest_intro", lang);
  const auto = rtl ? ' dir="auto"' : "";
  const rows = cards.map((c) => {
    const link = `${site}/opportunities?card=${encodeURIComponent(c.opportunity_id)}`;
    const meta = [c.opp.issuer_raw, c.opp.location].filter(Boolean).map(esc).join(" · ");
    const close = c.opp.deadline ? `<div style="font-family:${mono};font-size:12px;color:#5B6673;margin-top:4px">${esc(dateText(c.opp.deadline, lang))}</div>` : "";
    return `<tr><td style="padding:16px 20px;border-top:1px solid #E2E7EE">
      <a href="${link}"${auto} style="color:#0F1519;text-decoration:none;font-size:16px;font-weight:600;line-height:${lh}">${esc(c.opp.title)}</a>
      <div${auto} style="color:#5B6673;font-size:13px;line-height:${lh}">${meta}</div>${close}
      <div style="margin-top:10px"><a href="${link}" style="display:inline-block;background:#0670C4;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;padding:9px 16px;border-radius:8px">${t(v("email_open", lang))}</a></div>
    </td></tr>`;
  }).join("");
  const brand = rtl ? '<span dir="ltr">KnownBy</span>' : "KnownBy";
  const head = rtl ? '<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">' : "";
  const html = `<!doctype html><html lang="${lang}" dir="${rtl ? "rtl" : "ltr"}">${rtl ? `<head>${head}</head>` : ""}<body style="margin:0;background:#F2F5F9;font-family:${font};color:#0F1519">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F5F9;padding:24px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #E2E7EE;border-radius:20px;overflow:hidden;text-align:${rtl ? "right" : "left"}">
      <tr><td style="padding:20px 20px 12px"><div style="font-size:13px;font-weight:700;color:#0F1519">${brand}</div>
        <p style="margin:10px 0 0;font-size:15px;line-height:${lh};color:#0F1519">${t(intro)}</p></td></tr>
      ${rows}
      <tr><td style="padding:16px 20px;border-top:1px solid #E2E7EE;font-size:12px;line-height:${lh};color:#5B6673">${t(v("email_footer", lang))}</td></tr>
    </table></td></tr></table></body></html>`;
  const text = [intro, "", ...cards.map((c) => `${c.opp.title}${c.opp.issuer_raw ? ` · ${c.opp.issuer_raw}` : ""}\n${site}/opportunities?card=${c.opportunity_id}`), "", v("email_footer", lang)].join("\n");
  return { subject, html, text, preheader: intro };
}
