// The ten person-triggered emails, in both languages. Pure builders: no I/O,
// so the exact HTML can be rendered from fixtures in tests. English output is
// the wording each function sent before; Arabic is the founder's copy.
import {
  renderEmail, heading, paragraph, note, label, quote, divider, signature,
  escapeHtml as esc, isoAr, greetingAr, INK, INK_SOFT, ARABIC,
  type EmailLang,
} from "./emailTemplate.ts";

export interface BuiltEmail { subject: string; preheader: string; html: string }

const AR_AUTO = `font-family:${ARABIC};letter-spacing:0;text-transform:none;`;
/** A block of passed-in text (model or member written): its own direction. */
const autoBlock = (tag: string, text: string, size: number, color: string, weight = 400, lh = 1.9) =>
  `<${tag} dir="auto" style="margin:0 0 16px;${AR_AUTO}font-size:${size}px;line-height:${lh};font-weight:${weight};color:${color};">${text}</${tag}>`;

// 1. auth-signup · welcome ------------------------------------------------
export function welcomeEmail(lang: EmailLang, href: string): BuiltEmail {
  if (lang === "ar") {
    const preheader = "حسابك جاهز، وملفك يُكتب الآن.";
    return {
      subject: "أهلاً بك في KnownBy",
      preheader,
      html: renderEmail({
        lang, preheader,
        body: [heading("حسابك جاهز.", lang), paragraph("كل ما أجبت عنه محفوظ فيه. وملفك يُكتب الآن.", true, lang)].join(""),
        cta: { href, label: "افتح ملفك" },
      }),
    };
  }
  const preheader = "Your account is open. Your read is being written now.";
  return {
    subject: "Welcome to KnownBy",
    preheader,
    html: renderEmail({
      preheader,
      body: [
        heading("Your account is open."),
        paragraph("Everything you just answered is saved to it. Your read is being written now."),
      ].join(""),
      cta: { href, label: "Open your read" },
    }),
  };
}

// 2. send-read-email ----------------------------------------------------------
export interface ReadEmailData { archetype: string; marketRead: string; subjects: string[]; thin: string[] }
export function readEmail(lang: EmailLang, d: ReadEmailData): BuiltEmail {
  const { archetype, marketRead, subjects, thin } = d;
  if (lang === "ar") {
    const list = (items: string[]) =>
      `<ul dir="rtl" style="margin:8px 0 0;padding-inline-start:20px;padding-right:20px;padding-left:0;${AR_AUTO}color:#5B6673;font-size:16px;line-height:1.9">
        ${items.map((i) => `<li><span dir="auto">${esc(i)}</span></li>`).join("")}</ul>`;
    const lbl = (t: string) => `<p style="${AR_AUTO}font-size:14px;line-height:1.9;color:${INK_SOFT};margin:22px 0 0;text-align:right">${t}</p>`;
    const preheader = "ملفك من KnownBy";
    return {
      subject: preheader,
      preheader,
      html: renderEmail({
        lang, preheader,
        body: [
          heading("كيف يراك الناس", lang),
          archetype ? autoBlock("p", esc(archetype), 20, INK, 700, 1.5) : "",
          marketRead ? autoBlock("p", esc(marketRead), 16, INK_SOFT) : "",
          subjects.length ? `${lbl("المجالات التي تُعرف بها")}${list(subjects)}` : "",
          thin.length ? `${lbl("حيث يقلّ ما يظهر منك")}${list(thin)}` : "",
          `<p style="${AR_AUTO}font-size:14px;line-height:1.9;color:${INK_SOFT};margin:24px 0 0;text-align:right">هذا ملف يقرؤك، لا حكم عليك. إن أخطأ في شيء فردّ على هذه الرسالة وأخبرني بما فاته. أقرأ كل رد بنفسي، والملف يتغيّر.</p>`,
        ].join(""),
        cta: { href: "https://www.aura-intel.org/home", label: "افتح KnownBy" },
      }),
    };
  }
  const list = (items: string[]) =>
    `<ul style="margin:8px 0 0;padding-inline-start:20px;color:#5B6673;font-size:15px;line-height:1.65">
        ${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
  return {
    subject: "Your read from KnownBy",
    preheader: "Your read from KnownBy",
    html: renderEmail({
      preheader: "Your read from KnownBy",
      body: [
        heading("How people see you"),
        archetype ? `<p style="font-size:20px;font-weight:700;color:${INK};margin:0 0 12px">${esc(archetype)}</p>` : "",
        marketRead ? `<p style="font-size:15px;line-height:1.7;color:${INK_SOFT}">${esc(marketRead)}</p>` : "",
        subjects.length ? `<p style="font-size:13px;color:${INK_SOFT};margin:22px 0 0">The subjects you own</p>${list(subjects)}` : "",
        thin.length ? `<p style="font-size:13px;color:${INK_SOFT};margin:22px 0 0">Where you're thinnest</p>${list(thin)}` : "",
        `<p style="font-size:13px;line-height:1.6;color:${INK_SOFT};margin:24px 0 0">This is a read, not a verdict. If it got you wrong, reply to this email and tell me what it missed — I read every reply myself, and the read changes.</p>`,
      ].join(""),
      cta: { href: "https://www.aura-intel.org/home", label: "Open KnownBy" },
    }),
  };
}

// 3. send-resume-email ------------------------------------------------------
export function resumeEmail(lang: EmailLang, stage: number): BuiltEmail {
  const href = "https://www.aura-intel.org/onboarding";
  if (lang === "ar") {
    const t = "أكمل من حيث توقفت";
    const line = stage ? `توقفت عند الخطوة ${stage} من 5. كل ما أجبت عنه محفوظ.` : "كل ما أجبت عنه محفوظ.";
    return {
      subject: t, preheader: t,
      html: renderEmail({ lang, preheader: t, body: [heading(t, lang), paragraph(line, true, lang)].join(""), cta: { href, label: t } }),
    };
  }
  const line = stage
    ? `You stopped at step ${stage} of 5. Everything you answered is saved.`
    : `Everything you answered is saved.`;
  return {
    subject: "Pick up where you left off",
    preheader: "Pick up where you left off",
    html: renderEmail({
      preheader: "Pick up where you left off",
      body: [
        heading("Pick up where you left off"),
        `<p style="font-size:15px;line-height:1.7;color:${INK_SOFT}">${line}</p>`,
      ].join(""),
      cta: { href, label: "Pick up where I left off" },
    }),
  };
}

// 4. send-password-reset ------------------------------------------------------
export function passwordResetEmail(lang: EmailLang, firstName: string | null, resetUrl: string): BuiltEmail {
  if (lang === "ar") {
    const t = "إعادة تعيين كلمة المرور في KnownBy";
    const g = greetingAr(firstName ? esc(firstName) : null);
    return {
      subject: t, preheader: t,
      html: renderEmail({
        lang, preheader: t,
        body: `
      ${heading("إعادة تعيين كلمة المرور", lang)}
      ${paragraph(isoAr(`${g} وصلنا طلب لإعادة تعيين كلمة المرور لحسابك في KnownBy. اضغط الزر لتعيين كلمة جديدة.`), true, lang)}
      ${note("الرابط صالح 24 ساعة. إن لم تطلب ذلك فتجاهل هذه الرسالة.", lang)}
    `,
        cta: { href: resetUrl, label: "عيّن كلمة مرور جديدة" },
      }),
    };
  }
  const name = firstName || "there";
  const body = `
      ${heading("Reset your password")}
      ${paragraph(`Hi ${name}, we received a request to reset the password on your KnownBy account. Use the button below to set a new one.`)}
      ${note("The link expires in 24 hours. If you didn't ask for this, you can ignore this email.")}
    `;
  return {
    subject: "Reset your KnownBy password",
    preheader: "Reset your KnownBy password",
    html: renderEmail({ preheader: "Reset your KnownBy password", body, cta: { href: resetUrl, label: "Set a new password" } }),
  };
}

// 5. send-account-notification -----------------------------------------------
export type AccountNoticeType = "password_set" | "password_changed";
export function accountNotificationEmail(lang: EmailLang, type: string, firstName: string | null): BuiltEmail | null {
  if (type !== "password_set" && type !== "password_changed") return null;
  if (lang === "ar") {
    const g = greetingAr(firstName ? esc(firstName) : null);
    let subject: string, h: string, msg: string, warn = "";
    let cta: { href: string; label: string } | undefined;
    if (type === "password_set") {
      subject = "كلمة المرور لحسابك في KnownBy جاهزة";
      h = "كل شيء جاهز.";
      msg = `${g} أُنشئت كلمة المرور لحسابك في KnownBy. ادخل متى شئت من aura-intel.org.`;
      cta = { href: "https://aura-intel.org/auth", label: "افتح KnownBy" };
    } else {
      subject = "تغيّرت كلمة المرور لحسابك في KnownBy";
      h = "حُدّثت كلمة المرور.";
      msg = `${g} تغيّرت كلمة المرور لحسابك في KnownBy قبل قليل. إن كنت أنت من غيّرها فلا شيء مطلوب.`;
      warn = note(isoAr("إن لم تكن أنت، فأعد تعيين كلمة المرور الآن من aura-intel.org/auth."), lang);
    }
    const bodyHtml = `
      ${heading(h, lang)}
      ${paragraph(isoAr(msg), true, lang)}
      ${warn}
    `;
    return { subject, preheader: subject, html: renderEmail({ lang, preheader: subject, body: bodyHtml, cta }) };
  }
  const name = firstName || "there";
  let subject = "", h = "", message = "", warningBlock = "";
  let cta: { href: string; label: string } | undefined;
  if (type === "password_set") {
    subject = "Your KnownBy password is set";
    h = "You're all set.";
    message = `Hi ${name}, your KnownBy password has been created. You can log in any time at aura-intel.org.`;
    cta = { href: "https://aura-intel.org/auth", label: "Open KnownBy" };
  } else {
    subject = "Your KnownBy password was changed";
    h = "Password updated.";
    message = `Hi ${name}, your KnownBy password was just changed. If this was you, nothing else is needed.`;
    warningBlock = note("If you didn't make this change, reset your password now at aura-intel.org/auth.");
  }
  const bodyHtml = `
      ${heading(h)}
      ${paragraph(message)}
      ${warningBlock}
    `;
  return { subject, preheader: subject, html: renderEmail({ preheader: subject, body: bodyHtml, cta }) };
}

// 6. submit-waitlist ----------------------------------------------------------
export function waitlistEmail(lang: EmailLang, name: string): BuiltEmail {
  const safeName = esc(name);
  if (lang === "ar") {
    const body = `
          ${heading(`${safeName}، وصل طلبك.`, lang)}
          ${paragraph(isoAr("طلبك عندي. KnownBy في نسخة تجريبية مغلقة لأقل من 50 شخصاً، وأقرأ كل طلب بنفسي."), true, lang)}
          ${paragraph(isoAr("أرد عليك خلال 24 ساعة. وإن كان KnownBy مناسباً لك، فستجد دعوتك في الرد."), true, lang)}
          ${signature(undefined, lang)}
        `;
    return {
      subject: `${name}، وصل طلبك`.replace(/[\r\n]/g, " "),
      preheader: "وصل طلبك",
      html: renderEmail({ lang, preheader: "وصل طلبك", body }),
    };
  }
  const body = `
          ${heading(`${safeName}, you're on the list.`)}
          ${paragraph("We have your request. KnownBy is in private beta with fewer than 50 people, and I read every application myself.")}
          ${paragraph("You'll hear back from me within 24 hours. If KnownBy is right for you, that reply will include your invitation.")}
          ${signature()}
        `;
  return {
    subject: `You're on the list, ${name}`.replace(/[\r\n]/g, " "),
    preheader: "You're on the list",
    html: renderEmail({ preheader: "You're on the list", body }),
  };
}

// 7. send-invite ---------------------------------------------------------------
export interface InviteData { firstName: string; inviterFirst: string; inviterNote: string; url: string }
export function inviteEmail(lang: EmailLang, d: InviteData): BuiltEmail {
  const ar = lang === "ar";
  const step = (n: string, title: string, desc: string) => ar ? `
    <tr>
      <td valign="top" width="26" dir="ltr" style="width:26px;padding:0 0 16px 12px;font-family:'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace;font-size:11px;letter-spacing:0;color:#98A2AE;line-height:1.9;text-align:right;">${n}</td>
      <td valign="top" style="padding:0 0 16px;text-align:right;">
        <div style="${AR_AUTO}font-size:15px;font-weight:600;color:#0F1519;margin:0 0 4px;line-height:1.5;">${title}</div>
        <div style="${AR_AUTO}font-size:14px;line-height:1.9;color:#5B6673;">${desc}</div>
      </td>
    </tr>` : `
    <tr>
      <td valign="top" width="26" style="width:26px;padding:0 12px 16px 0;font-family:'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace;font-size:11px;letter-spacing:.16em;color:#98A2AE;line-height:1.6;">${n}</td>
      <td valign="top" style="padding:0 0 16px;">
        <div style="font-family:'Inter', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif;font-size:14px;font-weight:600;color:#0F1519;margin:0 0 4px;">${title}</div>
        <div style="font-family:'Inter', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif;font-size:13px;line-height:1.6;color:#5B6673;">${desc}</div>
      </td>
    </tr>`;

  const first = d.firstName ? esc(d.firstName) : "";
  const inviterFirst = (d.inviterFirst || "").trim();

  if (ar) {
    const inviterLine = inviterFirst ? paragraph(`${esc(inviterFirst)} رأى أن هذا يناسبك.`, false, lang) : "";
    const noteBlock = d.inviterNote ? quote(`<span dir="auto">${esc(d.inviterNote)}</span>`, lang) : "";
    const body = `
    ${label("دعوة خاصة", lang)}
    ${heading(first ? `${first}، دعوتك جاهزة.` : "أهلاً، دعوتك جاهزة.", lang)}
    ${paragraph(isoAr("بنيت KnownBy لأن أقدر من أعرفهم لا يراهم أحد. لا تنقصهم الخبرة. ينقصهم طريق يحوّل ما يقرؤونه ويفكرون فيه إلى شيء يراه السوق."), true, lang)}
    ${paragraph(isoAr("KnownBy يقرأ ما تقرؤه، ويجد النمط فيه، ويكتب مسودة منشور بصوتك. وأنت توافق. هذه هي الدورة كلها."), true, lang)}
    ${inviterLine}
    ${noteBlock}
    ${divider()}
    ${label("أول ربع ساعة", lang)}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" dir="rtl" style="margin:0 0 8px;">
      ${step("01", isoAr("KnownBy يقرأ صفحتك على LinkedIn"), "تعطيه الرابط فقط. بلا نماذج تملؤها.")}
      ${step("02", "يقارنها بسيرتك الذاتية", "ليرى ما تعرفه ولا يظهر.")}
      ${step("03", "تجيب عن تسعة أسئلة", "قصيرة، وعن عملك أنت.")}
      ${step("04", "يصلك ملفك", "قراءة صريحة لمكانتك في سوقك.")}
    </table>
    ${divider()}
    ${paragraph("أقل من 50 شخصاً لديهم دخول الآن. وقرأت صفحتك بنفسي قبل أن أرسل هذه الدعوة.", true, lang)}
    ${note("هذا الرابط يُستخدم مرة واحدة. إن توقف عن العمل فردّ على هذه الرسالة وأرسل لك غيره.", lang)}
    ${signature(undefined, lang)}
  `;
    const preheader = "دعوة خاصة. أقل من 50 شخصاً لديهم دخول.";
    return {
      subject: d.firstName ? `${d.firstName}، دعوتك إلى KnownBy جاهزة` : "دعوتك إلى KnownBy جاهزة",
      preheader,
      html: renderEmail({ lang, preheader, body, cta: { href: d.url, label: "افتح دعوتي" } }),
    };
  }

  const inviterLine = inviterFirst ? paragraph(`${esc(inviterFirst)} thought you should have this.`, false) : "";
  const noteBlock = d.inviterNote ? quote(esc(d.inviterNote)) : "";
  const greeting = first ? `${first},` : "Hi there,";
  const body = `
    ${label("A private invitation")}
    ${heading(`${greeting} your KnownBy is ready.`)}
    ${paragraph("I built KnownBy because the smartest people I know stay invisible. Not for lack of expertise — for lack of a way to turn what they already read and think into something the market can see.")}
    ${paragraph("KnownBy reads what you read, finds the pattern in it, and drafts a post in your own voice. You approve it. That's the whole loop.")}
    ${inviterLine}
    ${noteBlock}
    ${divider()}
    ${label("Your first ten minutes")}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 8px;">
      ${step("01", "Give KnownBy one thing you read", "A link. KnownBy reads it and shows you what it found, before it asks you anything.")}
      ${step("02", "Tell KnownBy who you are", "Paste your LinkedIn headline. No forms.")}
      ${step("03", "Rate your strengths", "Ten sliders, your own read. KnownBy corrects it from there.")}
      ${step("04", "See how the market reads you", "The first thing KnownBy gives back.")}
    </table>
    ${divider()}
    ${paragraph("Fewer than 50 people have access right now. I read your profile myself before sending this.")}
    ${note("This link is single-use. If it stops working, reply to this email and I'll send another.")}
    ${signature()}
  `;
  const preheader = "A private invitation. Fewer than 50 people have access.";
  return {
    subject: d.firstName ? `Your KnownBy is ready, ${d.firstName}` : "Your KnownBy is ready",
    preheader,
    html: renderEmail({ preheader, body, cta: { href: d.url, label: "Open my KnownBy" } }),
  };
}

// 8. send-decline-email ---------------------------------------------------------
export function declineEmail(lang: EmailLang, firstName: string): BuiltEmail {
  if (lang === "ar") {
    const t = "جديد طلبك في KnownBy";
    const preheader = "تحديث عن طلبك في KnownBy";
    return {
      subject: t, preheader,
      html: renderEmail({
        lang, preheader,
        body: `
      ${heading(isoAr(t), lang)}
      ${paragraph(greetingAr(firstName ? esc(firstName) : null), true, lang)}
      ${paragraph(isoAr("شكراً لاهتمامك بـKnownBy."), true, lang)}
      ${paragraph(isoAr("راجعت طلبك، ورأيت أن KnownBy لا يناسب ملفك في هذه المرحلة. نركّز الآن على فئة محددة جداً من المهنيين، ونريد أن يأخذ كل عضو أكبر فائدة منه."), true, lang)}
      ${paragraph(isoAr("هذا ليس قراراً نهائياً. مع توسّع KnownBy إلى قطاعات ومستويات جديدة قد نتواصل معك من جديد."), true, lang)}
      ${signature(undefined, lang)}
    `,
      }),
    };
  }
  const greeting = firstName ? esc(firstName) : "there";
  return {
    subject: "Update on your KnownBy application",
    preheader: "An update on your KnownBy application",
    html: renderEmail({
      preheader: "An update on your KnownBy application",
      body: `
      ${heading("Update on your KnownBy application")}
      ${paragraph(`${greeting},`)}
      ${paragraph("Thank you for your interest in KnownBy.")}
      ${paragraph("After reviewing your application, we've decided that KnownBy isn't the right fit for your profile at this stage. We're focused on a very specific cohort of professionals right now, and we want to make sure every user gets the most value from the platform.")}
      ${paragraph("This isn't permanent. As KnownBy expands to new sectors and levels, we may reach out again.")}
      ${signature()}
    `,
    }),
  };
}

// 9. colleague-invite (the referral) --------------------------------------------
export function colleagueReferralEmail(lang: EmailLang, inviterName: string, note: string): BuiltEmail {
  if (lang === "ar") {
    const who = esc(inviterName || "زميل لك");
    const noteBlock = note ? quote(`${who} أضاف: «<span dir="auto">${esc(note)}</span>»`, lang) : "";
    const preheader = `${who} رشّحك لـKnownBy`;
    return {
      subject: `${inviterName || "زميل لك"} يرى أن هذا يستحق نظرتك`.replace(/[\r\n]/g, " "),
      preheader,
      html: renderEmail({
        lang, preheader,
        body: `
          ${heading(isoAr("أحد معارفك رشّحك لـKnownBy."), lang)}
          ${paragraph(`${who} يرى أن <span dir="ltr">KnownBy</span> يستحق وقتك.`, true, lang)}
          ${paragraph(isoAr("KnownBy يقرأ ما تقرؤه أصلاً، ويجد الأنماط في قطاعك، ويكتب منشورات بصوتك أنت. لا قوالب، ولا ذكاء اصطناعي عام."), true, lang)}
          ${noteBlock}
          ${paragraph("أقرأ كل ترشيح بنفسي وأرد خلال 24 ساعة.", true, lang)}
          ${signature(undefined, lang)}
        `,
        cta: { href: "https://aura-intel.org", label: "تعرّف على KnownBy" },
      }),
    };
  }
  const displayInviter = esc(inviterName || "A colleague");
  const noteBlock = note ? quote(`${displayInviter} added: &ldquo;${esc(note)}&rdquo;`) : "";
  return {
    subject: `${inviterName || "A colleague"} thinks you should see this`.replace(/[\r\n]/g, " "),
    preheader: `${displayInviter} referred you to KnownBy`,
    html: renderEmail({
      preheader: `${displayInviter} referred you to KnownBy`,
      body: `
          ${heading("Someone in your circle referred you to KnownBy.")}
          ${paragraph(`${displayInviter} thinks KnownBy is worth your time.`)}
          ${paragraph("KnownBy reads what you already read, finds the patterns in your sector, and drafts posts in your own voice. Not templates, not generic AI.")}
          ${noteBlock}
          ${paragraph("I read every referral myself and reply within 24 hours.")}
          ${signature()}
        `,
      cta: { href: "https://aura-intel.org", label: "See what KnownBy is" },
    }),
  };
}

// 10. send-mirror-read ---------------------------------------------------------
const ARABIC_RE = /[\u0600-\u06FF]/;
export type MirrorRead = Record<string, string | undefined>;
/** `read` is the text to show: the caller picks read_ar when it exists and the reader is Arabic. */
export function mirrorReadEmail(lang: EmailLang, read: MirrorRead): BuiltEmail {
  const parts: string[] = [];
  if (lang === "ar") {
    if (read.archetype) parts.push(autoBlock("h1", esc(read.archetype), 26, INK, 700, 1.5));
    if (read.market_read) parts.push(autoBlock("p", esc(read.market_read), 16, INK));
    if (read.uncontested_space) {
      parts.push(`<p style="margin:0 0 4px;${AR_AUTO}font-size:16px;line-height:1.9;color:${INK};font-weight:700;text-align:right;">المساحة التي لم يأخذها أحد</p>`);
      parts.push(autoBlock("p", esc(read.uncontested_space), 16, INK_SOFT));
    }
    if (read.honest_gap) {
      parts.push(`<p style="margin:0 0 4px;${AR_AUTO}font-size:16px;line-height:1.9;color:${INK};font-weight:700;text-align:right;">فجوة نصارحك بها</p>`);
      parts.push(autoBlock("p", esc(read.honest_gap), 16, INK_SOFT));
    }
    if (read.own_words_quote) {
      parts.push(autoBlock("p", `«${esc(read.own_words_quote)}»`, 16, INK));
      if (read.own_words_read) parts.push(autoBlock("p", esc(read.own_words_read), 16, INK_SOFT));
    }
    parts.push(paragraph(isoAr("هذا ما يراه الجميع. أما أعضاء KnownBy فيصلهم ما لا يراه غيرهم. إن أردت مقعد مؤسس فردّ على هذه الرسالة وسأقرؤها بنفسي."), true, lang));
    parts.push(signature(undefined, lang));
    const t = "كيف يراك مجالك";
    return { subject: t, preheader: t, html: renderEmail({ lang, preheader: t, body: parts.join("\n") }) };
  }
  if (read.archetype) parts.push(heading(esc(read.archetype)));
  if (read.market_read) parts.push(paragraph(esc(read.market_read), false));
  if (read.uncontested_space) {
    parts.push(paragraph(`<strong>The space nobody has claimed</strong><br>${esc(read.uncontested_space)}`));
  }
  if (read.honest_gap) {
    parts.push(paragraph(`<strong>One honest gap</strong><br>${esc(read.honest_gap)}`));
  }
  if (read.own_words_quote) {
    const rtl = ARABIC_RE.test(read.own_words_quote);
    const style = rtl
      ? ' dir="rtl" style="margin:0 0 16px;font-family:Cairo,sans-serif;line-height:1.9;font-size:15px;color:#0F1519;text-align:right;"'
      : ' style="margin:0 0 16px;font-style:italic;font-size:15px;line-height:1.65;color:#0F1519;"';
    parts.push(`<p${style}>&ldquo;${esc(read.own_words_quote)}&rdquo;</p>`);
    if (read.own_words_read) parts.push(paragraph(esc(read.own_words_read)));
  }
  parts.push(paragraph(
    "This is what the world can see. KnownBy's members get the read on what only they can see. " +
    "If you want a founding seat, reply to this email and I will read it myself.",
  ));
  parts.push(signature());
  return {
    subject: "How your field sees you",
    preheader: "How your field sees you",
    html: renderEmail({ preheader: "How your field sees you", body: parts.join("\n") }),
  };
}
