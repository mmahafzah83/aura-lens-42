import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { withObserve } from "../_shared/observe.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  emailShell, sectionLabel, divider, button,
  CARD, RULE, INK, INK_BODY, INK_MUTE, AMBER, OXBLOOD,
  SERIF, BODY, MONO, ARABIC,
} from "../_shared/email-theme.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const ADMIN_USER_ID = "9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3";
const DASHBOARD_URL = "https://www.aura-intel.org/dashboard";
const INTELLIGENCE_URL = "https://www.aura-intel.org/dashboard?tab=intelligence";
const NOTIF_SETTINGS_URL = "https://www.aura-intel.org/dashboard?settings=notifications";

type Lang = "en" | "ar";
type MessageKey = "M1" | "M3" | "M4";

interface Msg {
  subject: string;
  render: (ctx: { firstName: string; signalTitle?: string }) => string;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
   .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// ── EN copy (verbatim) ───────────────────────────────────────────
const EN: Record<MessageKey, Msg> = {
  M1: {
    subject: "There's a signal waiting in what you already read",
    render: ({ firstName }) => `
      <p style="font-family:${BODY};font-size:15px;line-height:1.7;color:${INK};font-weight:600;margin:0 0 18px;">${firstName ? `Hi ${escapeHtml(firstName)},` : "Hi there,"}</p>
      <p style="font-family:${BODY};font-size:15px;line-height:1.75;color:${INK_BODY};margin:0 0 16px;">You already read the things that matter in your field. That's the hard part — and you've done it for years.</p>
      <p style="font-family:${BODY};font-size:15px;line-height:1.75;color:${INK_BODY};margin:0 0 16px;">Aura's job is the part you never had time for: turning that reading into presence, without adding a task to your week.</p>
      <p style="font-family:${BODY};font-size:15px;line-height:1.75;color:${INK_BODY};margin:0 0 22px;">It just needs one source to begin. Here's one from your field to start with — capture it, and watch your radar come alive.</p>
      <div style="margin:0 0 14px;">${button(DASHBOARD_URL, "Start with this →")}</div>
      <p style="font-family:${MONO};font-size:11px;color:${INK_MUTE};margin:0 0 8px;">Takes 20 seconds. The first one is the only one that feels like effort.</p>
    `,
  },
  M3: {
    subject: "You're one step from the moment Aura earns its place",
    render: ({ firstName }) => `
      <p style="font-family:${BODY};font-size:15px;line-height:1.7;color:${INK};font-weight:600;margin:0 0 18px;">${firstName ? `Hi ${escapeHtml(firstName)},` : "Hi there,"}</p>
      <p style="font-family:${BODY};font-size:15px;line-height:1.75;color:${INK_BODY};margin:0 0 16px;">You've started — and Aura's already reading you.</p>
      <p style="font-family:${BODY};font-size:15px;line-height:1.75;color:${INK_BODY};margin:0 0 16px;">Right now it's holding a pattern it can almost name. Two more sources this week and it surfaces your first signal: a piece of your own thinking, made visible.</p>
      <p style="font-family:${BODY};font-size:15px;line-height:1.75;color:${INK_BODY};margin:0 0 22px;">Most people never see this part. The ones who do tend to keep going — because that's the moment it stops being an app and starts being yours.</p>
      <div style="margin:0 0 14px;">${button(DASHBOARD_URL, "Add a source →")}</div>
    `,
  },
  M4: {
    subject: "Aura just found something in how you think",
    render: ({ firstName, signalTitle }) => `
      <p style="font-family:${BODY};font-size:15px;line-height:1.7;color:${INK};font-weight:600;margin:0 0 18px;">${firstName ? `Hi ${escapeHtml(firstName)},` : "Hi there,"}</p>
      <p style="font-family:${BODY};font-size:15px;line-height:1.75;color:${INK_BODY};margin:0 0 14px;">Here it is — the first pattern Aura pulled from your own reading:</p>
      <blockquote style="margin:14px 0 20px;padding:14px 18px;background:${CARD};border:1px solid ${RULE};border-left:3px solid ${AMBER};border-radius:4px;font-family:${SERIF};font-size:17px;line-height:1.5;color:${INK};font-style:italic;">"${escapeHtml(signalTitle || "your first signal")}"</blockquote>
      <p style="font-family:${BODY};font-size:15px;line-height:1.75;color:${INK_BODY};margin:0 0 16px;">This is the thing: you already knew it. You'd just never said it out loud, in public, where it builds your standing. Aura did the noticing so you don't have to.</p>
      <p style="font-family:${BODY};font-size:15px;line-height:1.75;color:${INK_BODY};margin:0 0 22px;">Your next move is the satisfying one — a post drawn from this signal, in your voice, ready in a minute.</p>
      <div style="margin:0 0 14px;">${button(INTELLIGENCE_URL, "See your signal →")}</div>
      <p style="font-family:${MONO};font-size:11px;color:${INK_MUTE};margin:0 0 8px;">This is what every week can feel like now.</p>
    `,
  },
};

// ── AR copy ──────────────────────────────────────────────────────
const AR: Record<MessageKey, Msg> = {
  M1: {
    subject: "في إشارة تنتظرك داخل ما تقرأه أصلاً",
    render: ({ firstName }) => `
      <div dir="rtl" lang="ar" style="font-family:${ARABIC};text-align:right;">
        <p style="font-size:15px;line-height:1.85;color:${INK};font-weight:600;margin:0 0 18px;">${firstName ? `أهلاً ${escapeHtml(firstName)}،` : "أهلاً بك،"}</p>
        <p style="font-size:15px;line-height:1.9;color:${INK_BODY};margin:0 0 16px;">أنت أصلاً تقرأ ما يهم في مجالك — وهذا هو الجزء الصعب، ومارسته لسنوات.</p>
        <p style="font-size:15px;line-height:1.9;color:${INK_BODY};margin:0 0 16px;">مهمة Aura هي الجزء الذي لم يسعفك الوقت له: تحويل هذه القراءة إلى حضور، دون أن تضيف مهمة جديدة إلى أسبوعك.</p>
        <p style="font-size:15px;line-height:1.9;color:${INK_BODY};margin:0 0 22px;">تحتاج فقط مصدراً واحداً للبداية. إليك واحداً من مجالك — التقطه، وسترى رادارك يبدأ بالنبض.</p>
        <div style="margin:0 0 14px;">${button(DASHBOARD_URL, "ابدأ من هنا ←")}</div>
        <p style="font-family:${MONO};font-size:11px;color:${INK_MUTE};margin:0 0 8px;">لا تستغرق أكثر من ٢٠ ثانية. الأول فقط هو الذي يحتاج جهداً.</p>
      </div>
    `,
  },
  M3: {
    subject: "خطوة واحدة تفصلك عن اللحظة التي تُثبت فيها Aura مكانتها",
    render: ({ firstName }) => `
      <div dir="rtl" lang="ar" style="font-family:${ARABIC};text-align:right;">
        <p style="font-size:15px;line-height:1.85;color:${INK};font-weight:600;margin:0 0 18px;">${firstName ? `أهلاً ${escapeHtml(firstName)}،` : "أهلاً بك،"}</p>
        <p style="font-size:15px;line-height:1.9;color:${INK_BODY};margin:0 0 16px;">لقد بدأت — و Aura تقرأك من الآن.</p>
        <p style="font-size:15px;line-height:1.9;color:${INK_BODY};margin:0 0 16px;">الآن هي تمسك بنمط تكاد تسميه. مصدران إضافيان هذا الأسبوع، وستُخرج لك أول إشارة: قطعة من تفكيرك أنت، تصبح مرئية.</p>
        <p style="font-size:15px;line-height:1.9;color:${INK_BODY};margin:0 0 22px;">أغلب الناس لا يصلون إلى هنا. ومن يصل، يكمل — لأن هذه اللحظة تتوقف فيها Aura عن كونها تطبيقاً وتصبح لك.</p>
        <div style="margin:0 0 14px;">${button(DASHBOARD_URL, "أضف مصدراً ←")}</div>
      </div>
    `,
  },
  M4: {
    subject: "Aura وجدت شيئاً في طريقة تفكيرك",
    render: ({ firstName, signalTitle }) => `
      <div dir="rtl" lang="ar" style="font-family:${ARABIC};text-align:right;">
        <p style="font-size:15px;line-height:1.85;color:${INK};font-weight:600;margin:0 0 18px;">${firstName ? `أهلاً ${escapeHtml(firstName)}،` : "أهلاً بك،"}</p>
        <p style="font-size:15px;line-height:1.9;color:${INK_BODY};margin:0 0 14px;">ها هو — أول نمط استخرجته Aura من قراءتك:</p>
        <blockquote style="margin:14px 0 20px;padding:14px 18px;background:${CARD};border:1px solid ${RULE};border-right:3px solid ${AMBER};border-radius:4px;font-family:${SERIF};font-size:17px;line-height:1.6;color:${INK};font-style:italic;">"${escapeHtml(signalTitle || "إشارتك الأولى")}"</blockquote>
        <p style="font-size:15px;line-height:1.9;color:${INK_BODY};margin:0 0 16px;">هذا هو المفتاح: كنت تعرفه أصلاً، لكنك لم تقله بصوت عالٍ، علناً، بالشكل الذي يبني مكانتك. Aura لاحظت عنك.</p>
        <p style="font-size:15px;line-height:1.9;color:${INK_BODY};margin:0 0 22px;">خطوتك التالية هي الأكثر متعة — منشور مستخرج من هذه الإشارة، بصوتك، جاهز خلال دقيقة.</p>
        <div style="margin:0 0 14px;">${button(INTELLIGENCE_URL, "شاهد إشارتك ←")}</div>
        <p style="font-family:${MONO};font-size:11px;color:${INK_MUTE};margin:0 0 8px;">هذا ما يمكن أن يصير عليه كل أسبوع الآن.</p>
      </div>
    `,
  },
};

const MESSAGES: Record<Lang, Record<MessageKey, Msg>> = { en: EN, ar: AR };

function footer(lang: Lang): string {
  const ar = lang === "ar";
  const text = ar
    ? `يمكنك إيقاف هذه الرسائل في أي وقت.`
    : `You can turn these off anytime.`;
  return `
    ${divider()}
    <p style="font-family:${BODY};font-size:12px;line-height:1.6;color:${INK_MUTE};margin:0;${ar ? "text-align:right;" : ""}">
      <a href="${NOTIF_SETTINGS_URL}" style="color:${INK_MUTE};text-decoration:underline;">${text}</a>
    </p>
    <p style="font-family:${BODY};font-size:13px;color:${INK};margin:18px 0 0;${ar ? "text-align:right;" : ""}">— Aura</p>
  `;
}

function buildEmail(lang: Lang, key: MessageKey, firstName: string, signalTitle?: string) {
  const msg = MESSAGES[lang][key];
  const inner = msg.render({ firstName, signalTitle }) + footer(lang);
  return {
    subject: msg.subject,
    html: emailShell({ preheader: msg.subject, body: inner, maxWidth: 560 }),
  };
}

async function sendResend(
  apiKey: string,
  to: string,
  subject: string,
  html: string,
  userId?: string,
  messageKey?: string,
) {
  const tags: { name: string; value: string }[] = [{ name: "email_type", value: "lifecycle" }];
  if (userId) tags.unshift({ name: "user_id", value: userId });
  if (messageKey) tags.push({ name: "message_key", value: messageKey.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 250) });
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Aura <Mohammad.Mahafdhah@aura-intel.org>",
      to: [to],
      subject,
      reply_to: "mohammad.mahafdhah@aura-intel.org",
      html,
      tags,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`resend ${res.status}: ${t}`);
  }
}

serve(withObserve("lifecycle-emails", async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Gate: lowercase cron_secret vault secret. Also allow service-role key.
  const CRON_SECRET = Deno.env.get("cron_secret") || Deno.env.get("CRON_SECRET") || "";
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const cronHeader = req.headers.get("x-cron-secret") || "";
  const apiKey = req.headers.get("apikey") || (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const isCron = !!CRON_SECRET && cronHeader === CRON_SECRET;
  const isService = !!SERVICE_KEY && apiKey === SERVICE_KEY;
  if (!isCron && !isService) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: "Email service not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const now = Date.now();
  const dayMs = 86400000;
  const cutoff14d = new Date(now - 14 * dayMs).toISOString();
  const cutoff48h = new Date(now - 48 * 60 * 60 * 1000).toISOString();
  const cutoff24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const cutoff3d = new Date(now - 3 * dayMs).toISOString();

  // 1) Load all users via auth admin API
  const users: Array<{ id: string; email: string; created_at: string }> = [];
  let page = 1;
  while (page < 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) { console.error("listUsers err", error); break; }
    for (const u of data.users || []) {
      users.push({ id: u.id, email: u.email || "", created_at: u.created_at });
    }
    if (!data.users || data.users.length < 200) break;
    page++;
  }

  // 2) Profiles map
  const { data: profiles } = await admin
    .from("diagnostic_profiles")
    .select("user_id, first_name, onboarding_completed, onboarding_step, lifecycle_opt_out");
  const profileMap = new Map<string, any>();
  for (const p of profiles || []) profileMap.set(p.user_id as string, p);

  // 3) Sent log map
  const { data: sentRows } = await admin
    .from("lifecycle_email_log")
    .select("user_id, message_key, sent_at");
  const sentMap = new Map<string, Array<{ key: string; at: number }>>();
  for (const r of sentRows || []) {
    const arr = sentMap.get(r.user_id as string) || [];
    arr.push({ key: r.message_key as string, at: new Date(r.sent_at as string).getTime() });
    sentMap.set(r.user_id as string, arr);
  }

  const results: any[] = [];
  const founderDigest: Array<{ email: string; captures: number }> = [];

  for (const u of users) {
    try {
      // 1. SKIP admin / opted out
      if (u.id === ADMIN_USER_ID) { results.push({ email: u.email, state: "SKIP_ADMIN" }); continue; }
      const prof = profileMap.get(u.id);
      if (prof?.lifecycle_opt_out === true) { results.push({ email: u.email, state: "SKIP_OPT_OUT" }); continue; }

      // 2. SKIP mid-flow
      if (!(prof?.onboarding_completed === true && (prof?.onboarding_step ?? 0) >= 4)) {
        results.push({ email: u.email, state: "SKIP_MID_FLOW" }); continue;
      }

      // 3. SKIP > 14d
      if (new Date(u.created_at).getTime() < now - 14 * dayMs) {
        results.push({ email: u.email, state: "SKIP_S9" }); continue;
      }

      // 4. 48h frequency cap
      const sent = sentMap.get(u.id) || [];
      const recent = sent.some(s => now - s.at < 48 * 60 * 60 * 1000);
      if (recent) { results.push({ email: u.email, state: "SKIP_FREQ_CAP" }); continue; }

      // Counts
      const [{ count: captures }, { count: signals }, lastEntryRes, latestSignalRes] = await Promise.all([
        admin.from("entries").select("id", { count: "exact", head: true }).eq("user_id", u.id),
        admin.from("strategic_signals").select("id", { count: "exact", head: true }).eq("user_id", u.id),
        admin.from("entries").select("created_at").eq("user_id", u.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        admin.from("strategic_signals").select("signal_title, created_at").eq("user_id", u.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      const captureCount = captures ?? 0;
      const signalCount = signals ?? 0;
      const lastEntryAt = (lastEntryRes.data as any)?.created_at as string | undefined;
      const latestSignal = latestSignalRes.data as { signal_title?: string; created_at?: string } | null;

      const firstName = (prof?.first_name as string | undefined)?.trim() || "";
      const lang: Lang = "en";
      const has = (k: MessageKey) => sent.some(s => s.key === k);

      // 5. S4 → founder digest
      if (captureCount >= 3 && signalCount === 0) {
        founderDigest.push({ email: u.email, captures: captureCount });
        results.push({ email: u.email, state: "S4_FOUNDER" });
        continue;
      }

      // 6. M4
      if (signalCount >= 1 && latestSignal?.created_at && latestSignal.created_at > cutoff3d && !has("M4")) {
        const { subject, html } = buildEmail(lang, "M4", firstName, latestSignal.signal_title || undefined);
        await sendResend(RESEND_API_KEY, u.email, subject, html);
        await admin.from("lifecycle_email_log").insert({ user_id: u.id, message_key: "M4" });
        results.push({ email: u.email, state: "SENT_M4" });
        continue;
      }

      // 7. M3
      if (captureCount >= 1 && captureCount <= 2 && signalCount === 0 && lastEntryAt && lastEntryAt < cutoff48h && !has("M3")) {
        const { subject, html } = buildEmail(lang, "M3", firstName);
        await sendResend(RESEND_API_KEY, u.email, subject, html);
        await admin.from("lifecycle_email_log").insert({ user_id: u.id, message_key: "M3" });
        results.push({ email: u.email, state: "SENT_M3" });
        continue;
      }

      // 8. M1
      if (captureCount === 0 && new Date(u.created_at).getTime() < now - 24 * 60 * 60 * 1000 && !has("M1")) {
        const { subject, html } = buildEmail(lang, "M1", firstName);
        await sendResend(RESEND_API_KEY, u.email, subject, html);
        await admin.from("lifecycle_email_log").insert({ user_id: u.id, message_key: "M1" });
        results.push({ email: u.email, state: "SENT_M1" });
        continue;
      }

      results.push({ email: u.email, state: "SILENCE" });
    } catch (e: any) {
      console.error("user loop error", u.email, e?.message);
      results.push({ email: u.email, state: "ERROR", error: e?.message });
    }
  }

  // 9) Founder digest (once/day)
  if (founderDigest.length > 0) {
    const today = new Date().toISOString().slice(0, 10);
    const digestKey = `S4_ALERT_${today}`;
    const { data: existing } = await admin
      .from("lifecycle_email_log")
      .select("id")
      .eq("user_id", ADMIN_USER_ID)
      .eq("message_key", digestKey)
      .maybeSingle();
    if (!existing) {
      const list = founderDigest
        .map(x => `<li style="margin:4px 0;color:${INK_BODY};">${escapeHtml(x.email)} — ${x.captures} captures, 0 signals</li>`)
        .join("");
      const body = `
        <p style="font-family:${BODY};font-size:15px;color:${INK};margin:0 0 12px;">Pipeline smell — S4 users (captures ≥ 3, signals = 0):</p>
        <ul style="font-family:${BODY};font-size:14px;line-height:1.6;color:${INK_BODY};padding-left:18px;margin:0 0 12px;">${list}</ul>
        <p style="font-family:${MONO};font-size:11px;color:${INK_MUTE};margin:0;">Signal engine may not be firing for these captures.</p>
      `;
      try {
        await sendResend(
          RESEND_API_KEY,
          "support@aura-intel.org",
          `[Aura] S4 pipeline alert — ${founderDigest.length} user(s) stuck`,
          emailShell({ preheader: "S4 pipeline alert", body, maxWidth: 560 }),
        );
        await admin.from("lifecycle_email_log").insert({ user_id: ADMIN_USER_ID, message_key: digestKey });
      } catch (e: any) {
        console.error("founder digest send failed", e?.message);
      }
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results, founderDigest: founderDigest.length }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}));