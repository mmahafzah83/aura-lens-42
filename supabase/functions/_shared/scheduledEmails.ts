// The scheduled emails, in both languages. Pure builders: no I/O, so the exact
// HTML can be rendered from fixtures in tests. English output is the wording
// each function sent before (with "Aura" ⇒ "KnownBy"); Arabic is the founder's copy.
import {
  renderEmail, heading as h1, paragraph, note, label, stat, quote, divider, signature,
  escapeHtml, isoAr, greetingAr,
  INK, INK_SOFT, INK_FAINT, CANVAS, BORDER, ACCENT, BODY, MONO, ARABIC,
  type EmailLang,
} from "./emailTemplate.ts";
import { countNoun } from "./vocabulary.ts";

const esc = (s: unknown) => escapeHtml(String(s ?? ""));
/** Stored text (titles, headlines, excerpts): its own direction. */
const auto = (s: unknown) => `<span dir="auto">${esc(s)}</span>`;
/** Arabic template: isolate Latin brand words in the copy, then fill values (already HTML). */
function ar(tpl: string, vars: Record<string, string | number> = {}): string {
  return isoAr(tpl).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}
/** «{name}، » at the start, or nothing. */
const nameLead = (n: string | null | undefined) => (n && n.trim() ? `${auto(n.trim())}، ` : "");
const AR_P = `font-family:${ARABIC};letter-spacing:0;text-transform:none;text-align:right;`;

const MONTHS_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
export const MONTHS_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
export const WEEKDAYS_AR = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];
/** "October" / "Oct" ⇒ «أكتوبر»; anything else passes through. */
export function monthAr(m: string): string {
  const i = MONTHS_EN.findIndex((x) => x.toLowerCase().startsWith(String(m).trim().toLowerCase().slice(0, 3)));
  return i >= 0 && String(m).trim().length >= 3 ? MONTHS_AR[i] : m;
}
/** «الاثنين 5 أكتوبر» — Arabic names, Western digits. */
export function dayDateAr(d: Date): string {
  return `${WEEKDAYS_AR[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_AR[d.getUTCMonth()]}`;
}

// {tier} — the app's Arabic Imprint level names (src/i18n/locales/ar.json tier.*).
const TIER_AR: Record<string, string> = {
  observer: "مراقب", explorer: "مستكشف", strategist: "استراتيجي", voice: "صوت", presence: "حضور",
};
export function tierAr(t: string | null): string | null {
  if (!t) return null;
  const k = t.toLowerCase();
  for (const [en, a] of Object.entries(TIER_AR)) if (k.includes(en)) return a;
  return null;
}
// {cardName} — acf.aria «بطاقة KnownBy»; {storyTab} — frame.nav.tab.identity «هويتي».
const CARD_AR = "بطاقة KnownBy";
const STORY_TAB_AR = "هويتي";

export interface BuiltEmail { subject: string; preheader: string; html: string; text?: string }

// ══ A. send-lifecycle-email ═══════════════════════════════════════════════
const APP_URL = "https://aura-intel.org";

export type LifecycleType = "day1" | "day3" | "day7" | "inactive" | "silence" | "post_ready" | "aura_card_ready" | "aura_card_nudge" | "aura_card_monthly";

export interface LifecycleCtx {
  firstName: string;
  sectorFocus: string | null;
  level: string | null;
  entriesCount: number;
  topSignals: { id?: string; signal_title: string; confidence: number }[];
  score: number | null;
  tier: string | null;
  signalCount: number;
  fadingSignals: { signal_title: string; confidence: number; velocity_status: string | null }[];
  fadingCount: number;
  publishedCount: number;
  recentTrend: { headline: string; source: string } | null;
  postTitle?: string;
  postPreview?: string;
  postId?: string;
  missingGates?: string[];
  monthName?: string;
}

function ctaButton(label: string, href: string, lang: EmailLang = "en") {
  const font = lang === "ar" ? `${ARABIC};letter-spacing:0` : BODY;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;"><tr>
    <td align="center" bgcolor="${ACCENT}" style="border-radius:8px;">
      <a href="${href}" style="display:inline-block;padding:0 30px;height:48px;line-height:48px;font-family:${font};font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:8px;">${label}</a>
    </td>
  </tr></table>`;
}

const P = (t: string, mb = 18) => `<p style="margin:0 0 ${mb}px;">${t}</p>`;
const PA = (t: string, mb = 18) => `<p style="margin:0 0 ${mb}px;${AR_P}font-size:16px;line-height:1.9;color:${INK_SOFT};">${t}</p>`;

export function lifecycleEmail(type: LifecycleType, ctx: LifecycleCtx, lang: EmailLang = "en"): BuiltEmail {
  const r = lang === "ar" ? lifecycleAr(type, ctx) : lifecycleEn(type, ctx);
  return { ...r, preheader: r.subject };
}

function lifecycleEn(type: LifecycleType, ctx: LifecycleCtx): { subject: string; html: string } {
  const { firstName, sectorFocus, topSignals, score, tier, signalCount, fadingSignals, fadingCount, publishedCount, recentTrend, postTitle, postPreview, postId, missingGates, monthName } = ctx;
  const name = firstName || "there";
  const focus = sectorFocus && sectorFocus.trim() ? sectorFocus.trim() : "your sector";
  const shell = (body: string, preheader: string) => renderEmail({ preheader, body });
  const heading = (t: string) => h1(t);
  const signoff = () => signature();
  const tierMessage = (() => {
    const t = (tier || "").toLowerCase();
    if (t.includes("presence")) return "You're in the top tier. Maintain your edge.";
    if (t.includes("strategist")) return "You're tracking the market — patterns are forming.";
    return "You're building your intelligence foundation.";
  })();

  if (type === "day1") {
    const subject = "Your first signals are forming";
    const top = topSignals[0];
    const body = top
      ? `
        ${heading(`${name}, your signal graph is forming.`)}
        <p style="margin:0 0 18px;">KnownBy detected ${signalCount} ${countNoun(signalCount, "signal")} from your captures. Your strongest right now: <strong>${top.signal_title}</strong>.</p>
        <p style="margin:0 0 18px;">This is where your intelligence runs deepest. One more capture strengthens the signal. Two more and KnownBy can generate a post that sounds like you wrote it.</p>
        ${ctaButton("See your signals", `${APP_URL}/dashboard?tab=intelligence`)}
        ${signoff()}`
      : `
        ${heading(`${name}, your signal graph is waiting.`)}
        <p style="margin:0 0 18px;">The captures you've made are being analyzed. A signal forms when the same idea shows up across several of your captures.</p>
        <p style="margin:0 0 18px;">Feed it one more article. That's all it takes to start the pattern.</p>
        ${ctaButton("Capture something", `${APP_URL}/dashboard`)}
        ${signoff()}`;
    return { subject, html: shell(body, subject) };
  }

  if (type === "day3") {
    const subject = "The market moved this week — here's what matters to you";
    const trendLine = recentTrend
      ? `The market conversation in ${focus} shifted — '<strong>${recentTrend.headline}</strong>' (via ${recentTrend.source}). You have ${signalCount} live ${countNoun(signalCount, "signal")} tracking this space.`
      : `KnownBy is watching ${focus} for fresh market movement. You have ${signalCount} live ${countNoun(signalCount, "signal")} ready to anchor your next post.`;
    const body = `
      ${heading(`${name}, your Imprint is ${score ?? 0}.`)}
      <p style="margin:0 0 18px;">${tierMessage}</p>
      <p style="margin:0 0 18px;">${trendLine}</p>
      <p style="margin:0 0 18px;">Publishing from your strongest signal builds presence fastest. Your signals are ready.</p>
      ${ctaButton("Generate your first post", day3Href(topSignals))}
      ${signoff()}`;
    return { subject, html: shell(body, subject) };
  }

  if (type === "day7") {
    const subject = "Your KnownBy brief";
    const top = topSignals[0];
    const topLine = top
      ? `Your strongest right now: <strong>${top.signal_title}</strong>.`
      : "No leading signal yet — a few more captures and signals start to form.";
    const fadingLine = fadingCount > 0
      ? `${fadingCount} ${countNoun(fadingCount, "signal")} fading — they need fresh evidence.`
      : "No signals fading.";
    const trendLine = recentTrend ? `<strong>${recentTrend.headline}</strong> (${recentTrend.source}).` : "Quiet in your tracked sources.";
    const body = `
      ${heading("Your brief")}
      <p style="margin:0 0 14px;">${signalCount} live ${countNoun(signalCount, "signal")}. ${topLine} ${fadingLine} ${publishedCount} ${countNoun(publishedCount, "post")} on LinkedIn.</p>
      <p style="margin:0 0 14px;">Imprint: <strong>${score ?? 0}</strong>${tier ? ` (${tier})` : ""}.</p>
      <p style="margin:0 0 18px;">Recent market movement: ${trendLine}</p>
      <p style="margin:0 0 18px;">Your signals are ready to publish from.</p>
      ${ctaButton("Open your weekly brief", `${APP_URL}/dashboard?tab=intelligence`)}
      ${signoff()}`;
    return { subject, html: shell(body, subject) };
  }

  if (type === "post_ready") {
    const title = postTitle || "your latest insight";
    const preview = (postPreview || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const subject = `Your post about ${title} is ready to publish`;
    const body = `
      ${heading(`${name}, your post is waiting.`)}
      <p style="margin:0 0 18px;">You generated a LinkedIn post yesterday — and it's still waiting.</p>
      <p style="margin:0 0 18px;padding:16px 20px;background:${CANVAS};border-left:2px solid ${ACCENT};font-style:italic;color:${INK_SOFT};">"${preview}${preview.length >= 120 ? "..." : ""}"</p>
      <p style="margin:0 0 18px;">One tap and it is live.</p>
      ${ctaButton("Open your draft", postReadyHref(postId))}
      ${signoff()}`;
    return { subject, html: shell(body, subject) };
  }

  if (type === "aura_card_ready") {
    const subject = "Your KnownBy Card is ready";
    const body = `
      ${heading(`${name}, your KnownBy Card is ready.`)}
      <p style="margin:0 0 18px;">You finished the four steps — the questions, your strengths, your photo, and where you work. KnownBy now has enough to render a shareable read of who you are, in one card.</p>
      <p style="margin:0 0 18px;">Open My Story to preview it, download the PNG, or share it to LinkedIn.</p>
      ${ctaButton("See your card", `${APP_URL}/dashboard?tab=identity`)}
      ${signoff()}`;
    return { subject, html: shell(body, subject) };
  }

  if (type === "aura_card_nudge") {
    const gates = (missingGates && missingGates.length > 0) ? missingGates : ["assessment"];
    const n = gates.length;
    const subject = `You're ${n} step${n === 1 ? "" : "s"} from your KnownBy Card`;
    const labelFor = (g: string) => {
      const k = g.toLowerCase();
      if (k === "photo") return "Add a profile photo";
      if (k === "country") return "Set your country";
      if (k === "assessment") return "Finish the few questions";
      if (k === "radar" || k === "skills") return "Fill in your skills radar";
      return g;
    };
    const bullets = gates.map((g) => `<li style="margin:0 0 8px;">${labelFor(g)}</li>`).join("");
    const body = `
      ${heading(`${name}, you're ${n} step${n === 1 ? "" : "s"} away.`)}
      <p style="margin:0 0 14px;">Your KnownBy Card renders as soon as these are done:</p>
      <ul style="margin:0 0 18px;padding-left:20px;color:${INK_SOFT};font-family:${BODY};font-size:15px;line-height:1.65;">${bullets}</ul>
      <p style="margin:0 0 18px;">A few minutes and the card is yours to preview, download, and share.</p>
      ${ctaButton("Finish and see your card", `${APP_URL}/dashboard?tab=identity`)}
      ${signoff()}`;
    return { subject, html: shell(body, subject) };
  }

  if (type === "aura_card_monthly") {
    const month = monthName || new Date().toLocaleString("en-US", { month: "long" });
    const subject = `Your ${month} KnownBy Card`;
    const body = `
      ${heading(`${name}, your ${month} card is ready.`)}
      <p style="margin:0 0 18px;">A fresh read of who you are this month — your practice, your skills, your point of view. One card, made from your own signals.</p>
      <p style="margin:0 0 18px;">Open it, download the PNG, or share it to LinkedIn.</p>
      ${ctaButton("View this month's card", `${APP_URL}/dashboard?tab=identity`)}
      ${signoff()}`;
    return { subject, html: shell(body, subject) };
  }

  const f1 = fadingSignals[0];
  const f2 = fadingSignals[1];
  const topFadingTitle = f1?.signal_title || "leading";
  const subject = `Your ${topFadingTitle} signal is decaying`; // vocab-ok: one named signal, not a count
  const f1Line = f1
    ? `Your strongest right now: <strong>${f1.signal_title}</strong>. It needs fresh evidence.`
    : "Your strongest signals are losing freshness.";
  const f2Line = f2
    ? ` ${f2.signal_title} is now <strong>${f2.velocity_status || "fading"}</strong>.`
    : "";
  const trendLine = recentTrend
    ? `Meanwhile, ${recentTrend.source} published on '<strong>${recentTrend.headline}</strong>' — your territory.`
    : `Meanwhile, the market in ${focus} keeps moving — your territory.`;
  const body = `
    ${heading(`${name}, while you were away:`)}
    <p style="margin:0 0 18px;">${f1Line}${f2Line}</p>
    <p style="margin:0 0 18px;">${trendLine}</p>
    <p style="margin:0 0 18px;">One capture brings them back. Consistency matters more than volume here.</p>
    ${ctaButton("Capture now", `${APP_URL}/dashboard`)}
    ${signoff()}`;
  return { subject, html: shell(body, subject) };
}

function day3Href(topSignals: LifecycleCtx["topSignals"]) {
  const d3 = topSignals[0];
  return d3?.id
    ? `${APP_URL}/dashboard?tab=authority&signal=${encodeURIComponent(d3.id)}`
    : `${APP_URL}/dashboard?tab=authority`;
}
function postReadyHref(postId?: string) {
  return postId
    ? `${APP_URL}/home?tab=authority&draft=${encodeURIComponent(postId)}&src=linkedin_posts&from=post_ready`
    : `${APP_URL}/home?tab=authority&from=post_ready`;
}

function lifecycleAr(type: LifecycleType, ctx: LifecycleCtx): { subject: string; html: string } {
  const { firstName, sectorFocus, topSignals, score, tier, signalCount, fadingSignals, fadingCount, publishedCount, recentTrend, postTitle, postPreview, postId, missingGates, monthName } = ctx;
  const L: EmailLang = "ar";
  const nm = nameLead(firstName);
  const focus = sectorFocus && sectorFocus.trim() ? auto(sectorFocus.trim()) : "قطاعك";
  const shell = (body: string, preheader: string) => renderEmail({ lang: L, preheader, body });
  const H = (t: string) => h1(t, L);
  const sign = signature(undefined, L);
  const btn = (t: string, href: string) => ctaButton(t, href, L);
  const strong = (s: unknown) => `<strong>${auto(s)}</strong>`;

  if (type === "day1") {
    const subject = "إشاراتك الأولى بدأت تتشكل";
    const top = topSignals[0];
    const body = top
      ? H(ar(`${nm}إشاراتك بدأت تتشكل.`))
        + PA(ar("رصد KnownBy إشارات مما حفظته، وعددها: {n}. أقواها الآن: {t}.", { n: signalCount, t: strong(top.signal_title) }))
        + PA(ar("هنا أعمق ما تعرفه. مادة واحدة أخرى تقوّي الإشارة. ومادتان تكفيان ليكتب KnownBy منشوراً كأنك كتبته."))
        + btn("شاهد إشاراتك", `${APP_URL}/dashboard?tab=intelligence`) + sign
      : H(`${nm}إشاراتك بانتظار مادة أخرى.`)
        + PA("ما حفظته قيد التحليل. الإشارة تتشكل حين تتكرر الفكرة نفسها في أكثر من مادة حفظتها.")
        + PA("احفظ مقالاً واحداً آخر. هذا يكفي ليبدأ النمط.")
        + btn("احفظ مادة", `${APP_URL}/dashboard`) + sign;
    return { subject, html: shell(body, subject) };
  }

  if (type === "day3") {
    const subject = "تحرّك السوق هذا الأسبوع، وهذا ما يهمّك";
    const t = (tier || "").toLowerCase();
    const tierLine = t.includes("presence") ? "أنت في الفئة العليا. حافظ على تقدّمك."
      : t.includes("strategist") ? "أنت تتابع السوق، والأنماط تتشكل." : "أنت تبني الأساس.";
    const trendLine = recentTrend
      ? ar("تغيّر الحديث في {f}: «{h}» (عن {s}). إشاراتك النشطة في هذا المجال: {n}.", { f: focus, h: strong(recentTrend.headline), s: auto(recentTrend.source), n: signalCount })
      : ar("KnownBy يتابع {f} ويرصد أي حركة جديدة. إشاراتك النشطة الجاهزة لمنشورك القادم: {n}.", { f: focus, n: signalCount });
    const body = H(ar(`${nm}رقمك في Imprint هو {s}.`, { s: score ?? 0 }))
      + PA(tierLine) + PA(trendLine)
      + PA("النشر من أقوى إشاراتك أسرع طريق ليعرفك السوق. إشاراتك جاهزة.")
      + btn("اكتب منشورك الأول", day3Href(topSignals)) + sign;
    return { subject, html: shell(body, subject) };
  }

  if (type === "day7") {
    const subject = ar("موجزك من KnownBy").replace(/<[^>]+>/g, "");
    const top = topSignals[0];
    const topLine = top ? ar("أقواها الآن: {t}.", { t: strong(top.signal_title) }) : "لا إشارة متقدمة بعد. بضع مواد أخرى وتبدأ الإشارات بالتشكل.";
    const fadingLine = fadingCount > 0 ? ar("إشارات تضعف وتحتاج دليلاً جديداً: {n}.", { n: fadingCount }) : "لا إشارات تضعف.";
    const ta = tierAr(tier);
    const tierPart = tier ? ` (${ta ?? auto(tier)})` : "";
    const trendLine = recentTrend
      ? ar("آخر حركة في السوق: {h} ({s}).", { h: strong(recentTrend.headline), s: auto(recentTrend.source) })
      : "آخر حركة في السوق: هدوء في مصادرك.";
    const body = H("موجزك")
      + PA(`${ar("الإشارات النشطة: {n}.", { n: signalCount })} ${topLine} ${fadingLine} ${ar("منشوراتك على LinkedIn: {n}.", { n: publishedCount })}`, 14)
      + PA(ar("Imprint: <strong>{s}</strong>{t}.", { s: score ?? 0, t: tierPart }), 14)
      + PA(trendLine) + PA("إشاراتك جاهزة للنشر.")
      + btn("افتح موجزك الأسبوعي", `${APP_URL}/dashboard?tab=intelligence`) + sign;
    return { subject, html: shell(body, subject) };
  }

  if (type === "post_ready") {
    const subject = `منشورك عن ${postTitle || "آخر ما لاحظته"} جاهز للنشر`;
    const preview = esc(postPreview || "");
    const body = H(`${nm}منشورك بانتظارك.`)
      + PA(ar("كتبت أمس منشوراً لـLinkedIn، وما زال ينتظر.").replace("لـ<span", "لـ&#8203;<span"))
      + `<p dir="auto" style="margin:0 0 18px;padding:16px 20px;background:${CANVAS};border-right:2px solid ${ACCENT};font-family:${ARABIC};letter-spacing:0;font-size:15px;line-height:1.9;color:${INK_SOFT};">${preview}${preview.length >= 120 ? "…" : ""}</p>`
      + PA("ضغطة واحدة ويُنشر.")
      + btn("افتح مسودتك", postReadyHref(postId)) + sign;
    return { subject, html: shell(body, subject) };
  }

  if (type === "aura_card_ready") {
    const subject = `${CARD_AR} جاهزة`;
    const body = H(ar(`${nm}${CARD_AR} جاهزة.`))
      + PA(ar("أكملت الخطوات الأربع: الأسئلة، ونقاط قوتك، وصورتك، ومكان عملك. صار عند KnownBy ما يكفي ليرسم قراءة لك في بطاقة واحدة تشاركها."))
      + PA(ar(`افتح «${STORY_TAB_AR}» لتراها، أو تنزّلها صورة، أو تشاركها على LinkedIn.`))
      + btn("شاهد بطاقتك", `${APP_URL}/dashboard?tab=identity`) + sign;
    return { subject, html: shell(body, subject) };
  }

  if (type === "aura_card_nudge") {
    const gates = (missingGates && missingGates.length > 0) ? missingGates : ["assessment"];
    const labelFor = (g: string) => {
      const k = g.toLowerCase();
      if (k === "photo") return "أضف صورتك";
      if (k === "country") return "حدّد بلدك";
      if (k === "assessment") return "أكمل الأسئلة القليلة";
      if (k === "radar" || k === "skills") return "املأ خريطة مهاراتك";
      return auto(g);
    };
    const bullets = gates.map((g) => `<li style="margin:0 0 8px;">${labelFor(g)}</li>`).join("");
    const subject = "خطوات قليلة تفصلك عن بطاقتك";
    const body = H(`${nm}الخطوات الباقية: ${gates.length}.`)
      + PA("بطاقتك تظهر فور إكمال هذه:", 14)
      + `<ul dir="rtl" style="margin:0 0 18px;padding-right:20px;padding-left:0;color:${INK_SOFT};${AR_P}font-size:16px;line-height:1.9;">${bullets}</ul>`
      + PA("دقائق قليلة وتصير البطاقة لك: تراها، وتنزّلها، وتشاركها.")
      + btn("أكمل وشاهد بطاقتك", `${APP_URL}/dashboard?tab=identity`) + sign;
    return { subject, html: shell(body, subject) };
  }

  if (type === "aura_card_monthly") {
    const month = monthAr(monthName || MONTHS_EN[new Date().getUTCMonth()]);
    const subject = `بطاقتك لشهر ${month}`;
    const body = H(`${nm}بطاقة ${month} جاهزة.`)
      + PA("قراءة جديدة لك هذا الشهر: عملك، ومهاراتك، ورأيك. بطاقة واحدة من إشاراتك أنت.")
      + PA(ar("افتحها، أو نزّلها صورة، أو شاركها على LinkedIn."))
      + btn("شاهد بطاقة هذا الشهر", `${APP_URL}/dashboard?tab=identity`) + sign;
    return { subject, html: shell(body, subject) };
  }

  const f1 = fadingSignals[0];
  const f2 = fadingSignals[1];
  const subject = f1?.signal_title ? `إشارتك «${f1.signal_title}» تضعف` : "أقوى إشاراتك تضعف";
  const f1Line = f1 ? ar("أقوى إشاراتك الآن: {t}. وتحتاج دليلاً جديداً.", { t: strong(f1.signal_title) }) : "أقوى إشاراتك تفقد حداثتها.";
  const f2Line = f2
    ? ` وإشارة «${auto(f2.signal_title)}» صارت <strong>${f2.velocity_status === "dormant" ? "خاملة" : "ضعيفة"}</strong>.`
    : "";
  const trendLine = recentTrend
    ? `وفي الأثناء نشر ${auto(recentTrend.source)} عن «${strong(recentTrend.headline)}»، وهذا مجالك.`
    : `وفي الأثناء السوق في ${focus} يتحرك، وهذا مجالك.`;
  const body = H(`${nm}في غيابك:`)
    + PA(f1Line + f2Line) + PA(trendLine)
    + PA("مادة واحدة تعيدها. الانتظام هنا أهم من الكثرة.")
    + btn("احفظ الآن", `${APP_URL}/dashboard`) + sign;
  return { subject, html: shell(body, subject) };
}

// ══ B. lifecycle-emails (M1 / M3 / M4) ════════════════════════════════════
export const LC_DASHBOARD_URL = "https://www.aura-intel.org/dashboard";
export const LC_INTELLIGENCE_URL = "https://www.aura-intel.org/dashboard?tab=intelligence";
const LC_NOTIF_URL = "https://www.aura-intel.org/dashboard?settings=notifications";
export type LifecycleKey = "M1" | "M3" | "M4";

interface Msg { subject: string; cta: { href: string; label: string }; render: (c: { firstName: string; signalTitle?: string }) => string }

const LC_EN: Record<LifecycleKey, Msg> = {
  M1: {
    subject: "There's a signal waiting in what you already read",
    cta: { href: LC_DASHBOARD_URL, label: "Start with this →" },
    render: ({ firstName }) => `
      <p style="font-family:${BODY};font-size:15px;line-height:1.7;color:${INK};font-weight:600;margin:0 0 18px;">${firstName ? `Hi ${esc(firstName)},` : "Hi there,"}</p>
      <p style="font-family:${BODY};font-size:15px;line-height:1.75;color:${INK_SOFT};margin:0 0 16px;">You already read what matters in your field. That's the hard part — and you've done it for years.</p>
      <p style="font-family:${BODY};font-size:15px;line-height:1.75;color:${INK_SOFT};margin:0 0 16px;">KnownBy's job is the part you never had time for: turning what you save into presence, without adding a task to your week.</p>
      <p style="font-family:${BODY};font-size:15px;line-height:1.75;color:${INK_SOFT};margin:0 0 22px;">It just needs one capture to begin. Here's one from your field to start with — capture it, and watch your radar come alive.</p>
      <p style="font-family:${MONO};font-size:11px;color:${INK_FAINT};margin:0 0 8px;">Takes 20 seconds. The first one is the only one that feels like effort.</p>
    `,
  },
  M3: {
    subject: "You're one step from the moment KnownBy earns its place",
    cta: { href: LC_DASHBOARD_URL, label: "Add a capture →" },
    render: ({ firstName }) => `
      <p style="font-family:${BODY};font-size:15px;line-height:1.7;color:${INK};font-weight:600;margin:0 0 18px;">${firstName ? `Hi ${esc(firstName)},` : "Hi there,"}</p>
      <p style="font-family:${BODY};font-size:15px;line-height:1.75;color:${INK_SOFT};margin:0 0 16px;">You've started — and KnownBy is already processing your captures.</p>
      <p style="font-family:${BODY};font-size:15px;line-height:1.75;color:${INK_SOFT};margin:0 0 16px;">Right now it's holding a pattern it can almost name. Two more captures this week and it surfaces your first signal: a piece of your own thinking, made visible.</p>
      <p style="font-family:${BODY};font-size:15px;line-height:1.75;color:${INK_SOFT};margin:0 0 22px;">Most people never see this part. The ones who do tend to keep going — because that's the moment it stops being an app and starts being yours.</p>
    `,
  },
  M4: {
    subject: "KnownBy just found something in how you think",
    cta: { href: LC_INTELLIGENCE_URL, label: "See your signal →" },
    render: ({ firstName, signalTitle }) => `
      <p style="font-family:${BODY};font-size:15px;line-height:1.7;color:${INK};font-weight:600;margin:0 0 18px;">${firstName ? `Hi ${esc(firstName)},` : "Hi there,"}</p>
      <p style="font-family:${BODY};font-size:15px;line-height:1.75;color:${INK_SOFT};margin:0 0 14px;">Here it is — the first pattern KnownBy pulled from your own captures:</p>
      ${quote(`"${esc(signalTitle || "your first signal")}"`)}
      <p style="font-family:${BODY};font-size:15px;line-height:1.75;color:${INK_SOFT};margin:0 0 16px;">Here is the point: you already knew it. You'd just never said it out loud, in public, where it builds your standing. KnownBy did the noticing so you don't have to.</p>
      <p style="font-family:${BODY};font-size:15px;line-height:1.75;color:${INK_SOFT};margin:0 0 22px;">Your next move is the satisfying one — a post drawn from this signal, in your voice, ready in a minute.</p>
      <p style="font-family:${MONO};font-size:11px;color:${INK_FAINT};margin:0 0 8px;">This is what every week can feel like now.</p>
    `,
  },
};

const g = (n: string) => paragraph(`<strong style="color:${INK};">${greetingAr(n ? esc(n) : "")}</strong>`, false, "ar");
const LC_AR: Record<LifecycleKey, Msg> = {
  M1: {
    subject: "في ما تقرؤه أصلاً إشارة تنتظرك",
    cta: { href: LC_DASHBOARD_URL, label: "ابدأ بهذه" },
    render: ({ firstName }) => g(firstName)
      + paragraph("أنت تقرأ المهم في مجالك أصلاً. هذا هو الجزء الصعب، وتفعله منذ سنوات.", true, "ar")
      + paragraph(isoAr("دور KnownBy هو الجزء الذي لم تجد له وقتاً: أن يحوّل ما تحفظه إلى مكانة في سوقك، دون مهمة جديدة في أسبوعك."), true, "ar")
      + paragraph("يكفيه أن تحفظ مادة واحدة ليبدأ. هذه مادة من مجالك تبدأ بها.", true, "ar")
      + note("20 ثانية. والأولى وحدها هي التي تحتاج جهداً.", "ar"),
  },
  M3: {
    subject: "خطوة واحدة تفصلك عن أول إشارة لك",
    cta: { href: LC_DASHBOARD_URL, label: "احفظ مادة" },
    render: ({ firstName }) => g(firstName)
      + paragraph(isoAr("بدأت، وKnownBy يعالج ما حفظته.").replace("و<span", "و&#8203;<span"), true, "ar")
      + paragraph("عنده الآن نمط يكاد يسمّيه. مادتان أخريان هذا الأسبوع وتظهر أول إشارة لك: شيء من تفكيرك أنت، صار يُرى.", true, "ar")
      + paragraph("أغلب الناس لا يصلون إلى هذه اللحظة. ومن يصل يكمل غالباً، لأنه يشعر عندها أن الأداة صارت له.", true, "ar"),
  },
  M4: {
    subject: "KnownBy وجد شيئاً في طريقة تفكيرك",
    cta: { href: LC_INTELLIGENCE_URL, label: "شاهد إشارتك" },
    render: ({ firstName, signalTitle }) => g(firstName)
      + paragraph(isoAr("هذا أول نمط استخرجه KnownBy مما حفظته:"), true, "ar")
      + quote(signalTitle ? auto(signalTitle) : "إشارتك الأولى", "ar")
      + paragraph(isoAr("والمهم: أنت تعرفه أصلاً. لكنك لم تقله علناً، حيث يبني مكانتك. KnownBy لاحظه عنك."), true, "ar")
      + paragraph("خطوتك التالية هي الأمتع: منشور من هذه الإشارة، بصوتك، جاهز في دقيقة.", true, "ar")
      + note("هكذا يمكن أن يكون كل أسبوع.", "ar"),
  },
};

function lcFooter(lang: EmailLang): string {
  if (lang === "ar") {
    return `${divider()}<p style="margin:0;${AR_P}font-size:13px;line-height:1.9;color:${INK_FAINT};"><a href="${LC_NOTIF_URL}" style="color:${INK_FAINT};text-decoration:underline;">أوقف هذه الرسائل متى شئت.</a></p>`;
  }
  return `
    ${divider()}
    <p style="font-family:${BODY};font-size:12px;line-height:1.6;color:${INK_FAINT};margin:0;">
      <a href="${LC_NOTIF_URL}" style="color:${INK_FAINT};text-decoration:underline;">You can turn these off anytime.</a>
    </p>
    <p style="font-family:${BODY};font-size:13px;color:${INK};margin:18px 0 0;">— KnownBy</p>
  `;
}

export function lifecycleMessage(lang: EmailLang, key: LifecycleKey, firstName: string, signalTitle?: string, ctaHrefOverride?: string): BuiltEmail {
  const msg = (lang === "ar" ? LC_AR : LC_EN)[key];
  const cta = ctaHrefOverride ? { ...msg.cta, href: ctaHrefOverride } : msg.cta;
  return {
    subject: msg.subject,
    preheader: msg.subject,
    html: renderEmail({
      preheader: msg.subject,
      body: msg.render({ firstName, signalTitle }) + lcFooter(lang),
      cta: lang === "ar" ? { ...cta, label: isoAr(cta.label) } : cta,
      lang,
      prefsHref: LC_NOTIF_URL,
    }),
  };
}

// ══ C. draft-ready-email ══════════════════════════════════════════════════
export const DRAFT_TOPIC_FALLBACK_EN = "a finding you kept";
function stripTrailingPunct(s: string): string {
  return (s || "").replace(/[\s.,;:]+$/g, "").trim();
}
function clampForSubject(shortTopic: string): string {
  const MAX = 38;
  if (shortTopic.length <= MAX) return shortTopic;
  return shortTopic.slice(0, MAX - 1).replace(/[\s,;:.\-–—]+$/g, "") + "…";
}
function whenKey(iso: string | null): "this" | "last" | "" {
  if (!iso) return "";
  const ageDays = (Date.now() - new Date(iso).getTime()) / 86400000;
  if (ageDays < 4) return "this";
  if (ageDays >= 4 && ageDays <= 10) return "last";
  return "";
}

export interface DraftReadyOpts {
  firstName: string | null; shortTopic: string; fullTopic: string; excerpt: string;
  nReadings: number | null; nSources: number | null; newestFragmentIso: string | null;
  velocityStatus: string | null; ctaUrl: string;
}

export function draftReadyEmail(opts: DraftReadyOpts, lang: EmailLang = "en"): BuiltEmail {
  const { firstName, shortTopic, fullTopic, excerpt, nReadings, nSources, newestFragmentIso, velocityStatus, ctaUrl } = opts;
  const haveCounts = typeof nReadings === "number" && nReadings > 0 && typeof nSources === "number" && nSources > 0;
  const shortTopicClean = stripTrailingPunct(shortTopic || fullTopic);
  const wk = whenKey(newestFragmentIso);
  const excerptClean = esc(excerpt.slice(0, 140)) + (excerpt.length > 140 ? "…" : "");

  if (lang === "ar") {
    const isFb = (s: string) => !s || s === DRAFT_TOPIC_FALLBACK_EN;
    const topicTxt = isFb(shortTopicClean) ? "ملاحظة حفظتها" : shortTopicClean;
    const topicHtml = isFb(shortTopicClean) ? "ملاحظة حفظتها" : auto(shortTopicClean);
    const subjTopic = isFb(stripTrailingPunct(shortTopic || fullTopic)) ? "ملاحظة حفظتها" : clampForSubject(shortTopicClean);
    const subject = `منشورك عن ${subjTopic} جاهز`;
    const preheader = haveCounts ? `أدلة استخرجها KnownBy مما حفظته: ${nReadings}. منشور واحد. أربع دقائق.` : "منشور واحد. أربع دقائق.";
    const nm = nameLead(firstName);
    const when = wk === "this" ? " هذا الأسبوع" : wk === "last" ? " الأسبوع الماضي" : "";
    const line1 = haveCounts
      ? ar(`${nm}استخرج KnownBy مما حفظته عن {t}{w} أدلة عددها: {n}.`, { t: topicHtml, w: when, n: nReadings! })
      : `${nm}حفظت ملاحظة عن ${topicHtml}.`;
    const B = (t: string, mb = 14) => paragraph(t, true, "ar").replace("margin:0 0 16px", `margin:0 0 ${mb}px`);
    const ps = velocityStatus === "accelerating"
      ? note(`ملاحظة: ${auto(topicTxt)} يتحرك الآن. من ينتبه هذا الأسبوع سيتذكر من قالها أولاً.`, "ar")
      : "";
    const body = h1("هذا رأيك، وقد قلته من قبل.", "ar")
      + B(line1) + B("لم يطلب منك أحد ذلك. كان تقديرك أنت، لا تقدير خوارزمية.")
      + B(isoAr("KnownBy وضع هذا التقدير في منشور مكتوب بأسلوبك."))
      + quote(`<span dir="auto">${excerptClean}</span>`, "ar")
      + B("لا يكتمل حتى تجادله.", 8) + B("احذف ما ليس منك. وقوِّ ما هو منك.", 8) + B("ثم هو لك: تنشره أو لا تنشره.", 20)
      + note("أربع دقائق. ولا شيء يخرج دون موافقتك.", "ar") + ps;
    return { subject, preheader, html: renderEmail({ lang, preheader: isoAr(preheader), body, cta: { href: ctaUrl, label: "افتح مسودتك" } }) };
  }

  const subject = `Your post on ${clampForSubject(shortTopicClean)} is ready`;
  const preheader = haveCounts
    ? `${nReadings} ${countNoun(nReadings!, "evidence")} KnownBy pulled from what you saved. One post. Four minutes.`
    : `One post. Four minutes.`;
  const namePrefix = firstName ? `${esc(firstName)} — you` : "You";
  const when = wk === "this" ? "this week" : wk === "last" ? "last week" : "";
  const whenSuffix = when ? ` ${when}` : "";
  const shortTopicEsc = esc(shortTopicClean);
  const lead = firstName ? `${esc(firstName)} — KnownBy` : "KnownBy";
  const line1 = haveCounts
    ? `${lead} pulled ${nReadings} ${countNoun(nReadings!, "evidence")} out of what you saved on ${shortTopicEsc}${whenSuffix}.`
    : `${namePrefix} kept a finding on ${shortTopicEsc}.`;
  const bodyLine = (t: string, mb = 14) =>
    `<p style="font-size:16px;line-height:1.65;margin:0 0 ${mb}px;color:${INK_SOFT};">${t}</p>`;
  let ps = "";
  if (velocityStatus === "accelerating") {
    ps = `<p style="font-size:13px;line-height:1.55;margin:22px 0 0;color:${INK_FAINT};">P.S. — ${esc(shortTopicClean)} is moving right now. The people paying attention this week are the ones who will remember who said it first.</p>`;
  }
  const body = `
    ${h1("You already made this argument.")}
    ${bodyLine(line1)}
    ${bodyLine(`Nobody asked you to. That was your judgment, not an algorithm's.`)}
    ${bodyLine(`KnownBy put that judgment into a post, written the way you write.`)}
    ${quote(excerptClean)}
    ${bodyLine(`It isn't finished until you've argued with it.`, 8)}
    ${bodyLine(`Cut what isn't you. Sharpen what is.`, 8)}
    ${bodyLine(`Then it's yours to publish — or not.`, 20)}
  `;
  const tail = `
    <p style="font-size:12px;line-height:1.5;margin:16px 0 0;color:${INK_FAINT};">Four minutes. Nothing goes out without you.</p>
    ${ps}
  `;
  return { subject, preheader, html: renderEmail({ preheader, body: body + tail, cta: { href: ctaUrl, label: "Open your draft" } }) };
}

// ══ D. send-morning-signal ════════════════════════════════════════════════
export type Finding = {
  id: string; user_id: string; url: string | null; title: string | null; source: string | null;
  relevance_score: number | null; implication: string | null; created_at: string; themes: string[] | null;
};
const MS_BASE_CTA_URL = "https://www.aura-intel.org/dashboard?tab=overnight";
const MS_PAUSE_URL = "https://www.aura-intel.org/dashboard?settings=notifications";
function riyadhHHMM(iso: string): string {
  return new Date(new Date(iso).getTime() + 3 * 3600 * 1000).toISOString().slice(11, 16);
}
function firstTheme(f: Finding): string | null {
  const t = Array.isArray(f.themes) ? f.themes.find((x) => !!x && String(x).trim()) : null;
  return t ? String(t).trim() : null;
}
function provenanceParts(f: Finding): string[] {
  const parts: string[] = [];
  if (f.source && String(f.source).trim()) parts.push(String(f.source).trim());
  const theme = firstTheme(f);
  if (theme) parts.push(theme);
  return parts;
}

export function morningSignalEmail(lead: Finding | null, others: Finding[], lang: EmailLang = "en"): BuiltEmail & { text: string } {
  const A = lang === "ar";
  const theme = lead ? firstTheme(lead) : null;
  const src = lead ? (lead.source || "").trim() : "";
  const subject = A
    ? (theme ? `KnownBy وجد شيئاً عن ${theme} وأنت نائم` : src ? `KnownBy وجد شيئاً في ${src} وأنت نائم` : "KnownBy وجد شيئاً وأنت نائم")
    : (theme ? `KnownBy found something on ${theme} while you slept` : src ? `KnownBy found something in ${src} while you slept` : `KnownBy found something while you slept`);
  const kicker = A
    ? (lead ? `حصيلة الليل · ${riyadhHHMM(lead.created_at)}` : "حصيلة الليل")
    : (lead ? `THE OVERNIGHT · ${riyadhHHMM(lead.created_at)}` : "THE OVERNIGHT");
  const headline = lead ? ((lead.title || "").trim() || (lead.url || "").trim()) : "";
  const prov = lead ? provenanceParts(lead) : [];
  const extras = others.slice(0, 3);
  const leadUrl = lead ? `https://www.aura-intel.org/dashboard?desk=1&finding=${lead.id}` : MS_BASE_CTA_URL;
  const openLabel = A ? "افتحها في KnownBy" : "Open it in KnownBy";
  const quietLine = A ? "أرسلناها لأن الليلة الماضية جاءت بشيء. الليالي الهادئة لا ترسل شيئاً." : "Sent because last night produced something. Quiet nights send nothing.";

  const implicationHtml = lead && (lead.implication || "").trim()
    ? (A ? quote(auto(lead.implication!.trim()), "ar") : quote(esc(lead.implication!.trim())))
    : "";
  const provHtml = prov.length
    ? (A
      ? `<p dir="auto" style="margin:0 0 6px;font-family:${ARABIC};letter-spacing:0;font-size:13px;line-height:1.9;color:${INK_FAINT};">${esc(prov.join(" · "))}</p>`
      : `<p style="margin:0 0 6px;font-family:${MONO};font-size:11px;line-height:1.6;letter-spacing:.08em;color:${INK_FAINT};">${esc(prov.join(" · "))}</p>`)
    : "";
  const extrasHtml = extras.length
    ? divider() + extras.map((e) => A
      ? `<p dir="auto" style="margin:0 0 8px;font-family:${ARABIC};letter-spacing:0;font-size:14px;line-height:1.9;"><a href="${esc(e.url || MS_BASE_CTA_URL)}" style="color:${INK_SOFT};text-decoration:underline;">${esc((e.title || e.url || "").trim())}</a></p>`
      : `<p style="margin:0 0 8px;font-family:${BODY};font-size:13px;line-height:1.5;">` +
        `<a href="${esc(e.url || MS_BASE_CTA_URL)}" style="color:${INK_SOFT};text-decoration:underline;">${esc((e.title || e.url || "").trim())}</a></p>`).join("")
    : "";
  const kickerHtml = A
    ? `<p style="margin:0 0 14px;${AR_P}font-size:13px;line-height:1.9;font-weight:600;color:${INK_FAINT};">${esc(kicker)}</p>`
    : `<p style="margin:0 0 14px;font-family:${MONO};font-size:11px;line-height:1.4;letter-spacing:.16em;text-transform:uppercase;color:${INK_FAINT};">${esc(kicker)}</p>`;
  const headHtml = lead ? (A ? h1(auto(headline), "ar") : h1(esc(headline))) : "";

  const html = renderEmail({
    lang,
    preheader: headline || subject,
    prefsHref: MS_PAUSE_URL,
    prefsLabel: A ? "أوقف هذه الرسائل" : "Pause these emails",
    cta: lead ? { href: leadUrl, label: A ? isoAr(openLabel) : openLabel } : undefined,
    body: `
      ${kickerHtml}
      ${headHtml}
      ${implicationHtml}
      ${provHtml}
      ${extrasHtml}
      ${divider()}
      ${paragraph(quietLine, true, lang)}
    `,
  });

  const textLines = [kicker, ""];
  if (lead) {
    textLines.push(headline);
    if ((lead.implication || "").trim()) textLines.push("", lead.implication!.trim());
    if (prov.length) textLines.push("", prov.join(" · "));
    textLines.push("", `${openLabel}: ${leadUrl}`);
  }
  if (extras.length) {
    textLines.push("", A ? "ومن الليلة الماضية أيضاً:" : "Also last night:");
    for (const e of extras) textLines.push(`- ${(e.title || e.url || "").trim()}${e.url ? ` (${e.url})` : ""}`);
  }
  textLines.push("", quietLine, `${A ? "أوقف هذه الرسائل" : "Pause these emails"}: ${MS_PAUSE_URL}`);
  return { subject, preheader: headline || subject, html, text: textLines.join("\n") };
}

// ══ E. send-weekly-brief ══════════════════════════════════════════════════
const WB_APP = "https://www.aura-intel.org";
const WB_PREFS = `${WB_APP}/dashboard?settings=notifications`;
const GOOD = "#12805C";
const BAD = "#C0392B";

export function appendParams(url: string, params: Record<string, string | undefined>): string {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
  return u.toString();
}

export interface WeeklyOpts {
  firstName: string;
  dayDate: string;
  topSignals: Array<{ id: string; title: string; currentPct: number; deltaPct: number; whyNow?: string }>;
  postsThisWeek: number;
  postsLastWeek: number;
  activeWeeks: number;
  emailParam: string;
  marketPulse: { headline: string; url: string | null; isExternal: boolean } | null;
  worthReading: { title: string; url: string; author: string | null; readMinutes: number; why: string | null } | null;
  readyPost: { id: string; body: string } | null;
}

/** Subject + full HTML. All the words decided here, in the reader's language. */
export function weeklyBriefEmail(o: WeeklyOpts, lang: EmailLang = "en"): BuiltEmail {
  const A = lang === "ar";
  const { firstName, dayDate, topSignals, postsThisWeek, postsLastWeek, activeWeeks, emailParam, marketPulse, worthReading, readyPost } = o;
  const nm = A ? nameLead(firstName) : "";
  const headline = A
    ? (postsLastWeek > 0 ? `${nm}تقدّمك يزداد.` : topSignals.length > 0 ? `${nm}خطوة واحدة هذا الأسبوع تحفظ تقدّمك.` : `${nm}ما تعرفه بانتظارك.`)
    : (postsLastWeek > 0 ? `${firstName}, your momentum is building.` : topSignals.length > 0 ? `${firstName}, one move this week keeps your momentum.` : `${firstName}, your intelligence is waiting.`);
  const yourMove = postsLastWeek > 0
    ? { copy: A ? "نشرت الأسبوع الماضي. لنرَ كيف وصل منشورك، وأين تبني عليه." : "You published last week — let's see how it landed and where to compound next.",
        ctaLabel: A ? "شاهد أثرك" : "See your impact →", ctaHref: appendParams(`${WB_APP}/home`, { tab: "momentum", email: emailParam }) }
    : topSignals.length > 0
      ? { copy: A ? "أقوى إشاراتك جاهزة للنشر. منشور واحد يحوّل ما تعرفه عن السوق إلى شيء يراه الناس." : `Your strongest signal is ready to publish. One post turns market intelligence into visible presence.`,
          ctaLabel: A ? "اكتب منشورك" : "Draft your post →", ctaHref: appendParams(`${WB_APP}/home`, { tab: "publish", signal: topSignals[0].id, email: emailParam }) }
      : { copy: A ? "احفظ مقالاً واحداً من قطاعك هذا الأسبوع. هكذا يبدأ KnownBy بإظهار إشارات تنشر منها." : "Capture one article from your sector this week — that's how KnownBy starts surfacing signals you can publish from.",
          ctaLabel: A ? "احفظ مقالاً" : "Capture an article →", ctaHref: appendParams(`${WB_APP}/home`, { email: emailParam }) };
  const rhythmCopy = postsThisWeek > 0
    ? (A ? "انتظام جيد. هكذا تتراكم مكانتك." : "Active rhythm. This is how presence compounds.")
    : activeWeeks > 0
      ? (A ? "أنت تحفظ بانتظام. النشر هو الخطوة التالية." : "You're capturing consistently. Publishing is the next step.")
      : (A ? "منشورك الأول يحوّل الإشارات إلى مكانة. ابدأ هذا الأسبوع." : "Your first post turns signals into presence. Start this week.");
  const subject = A
    ? (topSignals.length > 0 ? `إشاراتك تحركت، وهذا ما يميّزك · ${dayDate}` : `أسبوعك القادم · ${dayDate}`)
    : (topSignals.length > 0 ? `Your signals shifted — here's your edge · ${dayDate}` : `Your week ahead · ${dayDate}`);
  const preheader = A ? "موجزك الأسبوعي من KnownBy: ما تغيّر في مكانتك هذا الأسبوع." : `Your weekly KnownBy intelligence brief — what shifted in your standing this week.`;

  const FONT = A ? `${ARABIC};letter-spacing:0` : BODY;
  const LH = A ? "1.9" : "1.6";
  const row = (inner: string) => `<tr><td style="padding:0 0 24px;">${inner}</td></tr>`;
  const panel = (inner: string, accent?: string) =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CANVAS};border-radius:8px;${accent ? `border-${A ? "right" : "left"}:3px solid ${accent};` : ""}"><tr><td${A ? ' dir="rtl" align="right"' : ""} style="padding:14px 16px;">${inner}</td></tr></table>`;
  const body14 = (text: string, color = INK) =>
    `<p style="margin:0;font-family:${FONT};font-size:${A ? 15 : 14}px;line-height:${LH};color:${color};${A ? "text-align:right;" : ""}">${text}</p>`;
  const link = (href: string, t: string, extra = "") =>
    `<a href="${esc(href)}" style="font-family:${FONT};font-size:14px;font-weight:600;color:${ACCENT};text-decoration:none;${extra}">${t}</a>`;
  const lbl = (en: string, a: string) => label(A ? isoAr(a) : en, lang);
  const story = (s: string) => (A ? auto(s) : esc(s));

  const rows: string[] = [];
  rows.push(row(`${lbl("KnownBy · Weekly brief", "KnownBy · الموجز الأسبوعي")}${h1(A ? headline : esc(headline), lang)}${note(esc(dayDate), lang)}`));

  if (marketPulse) {
    rows.push(row(`
      ${lbl("Market pulse", "نبض السوق")}
      ${panel(marketPulse.isExternal
        ? body14(`${story(marketPulse.headline)}${marketPulse.url ? ` &nbsp;<a href="${esc(marketPulse.url)}" style="color:${ACCENT};font-weight:600;text-decoration:none;">${A ? "اقرأ" : "Read &rarr;"}</a>` : ""}`)
        : body14(`<span style="color:${INK_SOFT};font-weight:600;">${A ? "في قطاعك هذا الأسبوع:" : "In your sector this week:"}</span> ${story(marketPulse.headline)}`))}
    `));
  }

  rows.push(row(`
    ${lbl("Your move this week", "خطوتك هذا الأسبوع")}
    ${panel(`
      ${body14(A ? isoAr(yourMove.copy) : esc(yourMove.copy))}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 0;"><tr>
        <td align="center" bgcolor="${ACCENT}" style="border-radius:8px;">
          <a href="${esc(yourMove.ctaHref)}" style="display:inline-block;padding:0 26px;height:44px;line-height:44px;font-family:${FONT};font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:8px;">${esc(yourMove.ctaLabel)}</a>
        </td></tr></table>
    `)}
  `));

  if (readyPost) {
    const readyHref = appendParams(`${WB_APP}/home`, { tab: "authority", draft: readyPost.id, src: "content_items", email: emailParam, from: "weekly_brief" });
    rows.push(row(`
      ${lbl("Your post is ready", "منشورك جاهز")}
      ${panel(`
        <p${A ? ' dir="auto"' : ""} style="margin:0 0 14px;font-family:${FONT};font-size:14px;line-height:${A ? "1.9" : "1.75"};color:${INK};white-space:pre-line;">${esc(readyPost.body)}</p>
        ${link(readyHref, A ? "افتح مسودتك" : "Open your draft &rarr;")}
      `, ACCENT)}
    `));
  }

  if (topSignals.length === 0) {
    const captureHref = appendParams(`${WB_APP}/home`, { email: emailParam });
    rows.push(row(`
      ${lbl("Signal pulse", "نبض الإشارات")}
      ${panel(`
        ${body14(A ? "لا إشارات نشطة بعد. احفظ مقالين أو ثلاثة من قطاعك لتبدأ إشارتك الأولى." : "No active signals yet. Capture 2-3 articles from your sector to seed your first signal.", INK_SOFT)}
        <p style="margin:10px 0 0;">${link(captureHref, A ? "احفظ مقالاً" : "Capture an article &rarr;")}</p>
      `)}
    `));
  } else {
    const meta = A
      ? `margin:0;font-family:${ARABIC};font-size:13px;line-height:1.9;letter-spacing:0;color:${INK_SOFT};`
      : `margin:0;font-family:${MONO};font-size:11px;line-height:1.5;letter-spacing:.06em;color:${INK_SOFT};`;
    const cards = topSignals.slice(0, 2).map((s, idx) => {
      const movement = A
        ? (s.deltaPct > 0 ? `<span style="color:${GOOD};">تقوى</span> · زادت هذا الأسبوع: ${s.deltaPct}`
          : s.deltaPct < 0 ? `<span style="color:${BAD};">تضعف، وتستحق مادة واحدة</span>` : "ثابتة")
        : (s.deltaPct > 0 ? `<span style="color:${GOOD};">Strengthening</span> · gained ${s.deltaPct} this week`
          : s.deltaPct < 0 ? `<span style="color:${BAD};">Fading</span> — worth one capture` : "Holding steady");
      const href = appendParams(`${WB_APP}/home`, { tab: "intelligence", signal: s.id, email: emailParam });
      const why = idx === 0 && s.whyNow
        ? `<p style="margin:8px 0 0;font-family:${FONT};font-size:13px;line-height:${A ? "1.9" : "1.55"};color:${INK_SOFT};"><span style="color:${INK_FAINT};font-weight:600;">${A ? "لماذا الآن:" : "Why now:"}</span> ${story(s.whyNow)}</p>`
        : "";
      return panel(`
        <a href="${esc(href)}"${A ? ' dir="auto"' : ""} style="display:block;font-family:${FONT};font-size:14px;font-weight:600;color:${ACCENT};text-decoration:none;margin:0 0 6px;">${esc(s.title)}</a>
        <p style="${meta}">${movement}</p>
        ${why}
      `, idx === 0 ? ACCENT : BORDER);
    }).map((c) => `<div style="margin:0 0 10px;">${c}</div>`).join("");
    rows.push(row(`${lbl("Signal pulse", "نبض الإشارات")}${cards}`));
  }

  if (worthReading) {
    const why = worthReading.why || (A ? isoAr("اختارها KnownBy لك.") : "KnownBy picked this for you.");
    rows.push(row(`
      ${lbl("Worth reading", "يستحق القراءة")}
      ${panel(A ? `
        <p dir="auto" style="margin:0 0 6px;font-family:${FONT};font-size:14px;line-height:1.9;">
          <a href="${esc(worthReading.url)}" style="color:${ACCENT};font-weight:600;text-decoration:none;">${esc(worthReading.title)}</a>
        </p>
        <p style="margin:0 0 8px;font-family:${FONT};font-size:13px;line-height:1.9;color:${INK_FAINT};">${worthReading.author ? `${auto(worthReading.author)} · ` : ""}قراءة ${worthReading.readMinutes} دقائق</p>
        ${body14(worthReading.why ? auto(why) : why, INK_SOFT)}
      ` : `
        <p style="margin:0 0 6px;font-family:${BODY};font-size:14px;line-height:1.5;">
          <a href="${esc(worthReading.url)}" style="color:${ACCENT};font-weight:600;text-decoration:none;">${esc(worthReading.title)}</a>
        </p>
        <p style="margin:0 0 8px;font-family:${MONO};font-size:11px;line-height:1.5;letter-spacing:.06em;color:${INK_FAINT};">${esc(worthReading.author || "")}${worthReading.author ? " · " : ""}${worthReading.readMinutes} min read</p>
        ${body14(esc(why), INK_SOFT)}
      `)}
    `));
  }

  rows.push(row(`
    ${lbl("Your rhythm", "انتظامك")}
    ${panel(`
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"${A ? ' dir="rtl"' : ""}><tr>
        <td width="50%" valign="top" style="padding-${A ? "left" : "right"}:8px;">${stat(postsThisWeek, A ? "منشورات هذا الأسبوع" : `Post${postsThisWeek === 1 ? "" : "s"} this week`, lang)}</td>
        <td width="50%" valign="top" style="padding-${A ? "right" : "left"}:8px;">${stat(A ? `<span dir="rtl" style="white-space:nowrap">${activeWeeks} من 12</span>` : `${activeWeeks} of 12`, A ? "أسابيع نشطة" : "Weeks active", lang)}</td>
      </tr></table>
      ${body14(esc(rhythmCopy), INK_SOFT)}
    `)}
  `));

  return {
    subject, preheader,
    html: renderEmail({
      lang,
      preheader: A ? isoAr(preheader) : preheader,
      prefsHref: WB_PREFS,
      body: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"${A ? ' dir="rtl"' : ""}>${rows.join("")}</table>`,
    }),
  };
}
