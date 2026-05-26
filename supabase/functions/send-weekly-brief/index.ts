import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const APP_URL = "https://www.aura-intel.org";

function escapeHtml(s: string): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function firstSentence(s: string | null | undefined): string {
  if (!s) return "";
  const trimmed = s.trim();
  const m = trimmed.match(/^[^.!?]+[.!?]/);
  return (m ? m[0] : trimmed).trim();
}

function appendParams(url: string, params: Record<string, string | undefined>): string {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) {
    if (v) u.searchParams.set(k, v);
  }
  return u.toString();
}

interface BuildHtmlOpts {
  firstName: string;
  dayDate: string;
  topSignals: Array<{ id: string; title: string; currentPct: number; deltaPct: number; whyNow?: string }>;
  postsThisWeek: number;
  postsLastWeek: number;
  brand: string;
  brandFont: string;
  headline: string;
  emailParam: string;
  marketPulse: { headline: string; url: string | null; isExternal: boolean } | null;
  yourMove: { copy: string; ctaLabel: string; ctaHref: string };
  worthReading: { title: string; url: string; author: string | null; readMinutes: number; why: string } | null;
  activeWeeks: number;
  rhythmCopy: string;
  readyPost: string | null;
}

function buildHtml(opts: BuildHtmlOpts): string {
  const {
    firstName, dayDate, topSignals, postsThisWeek,
    brand, brandFont, headline, marketPulse, yourMove, worthReading, activeWeeks, rhythmCopy, readyPost,
  } = opts;

  const sectionHeader = (label: string) =>
    `<p style="font-size:11px;font-weight:600;color:#8a8480;letter-spacing:0.14em;text-transform:uppercase;margin:0 0 12px;font-family:'DM Sans',system-ui,sans-serif;">${escapeHtml(label)}</p>`;

  const marketPulseHtml = marketPulse
    ? `<div style="margin:0 0 28px;">
         ${sectionHeader("Market pulse")}
         <div style="padding:14px 16px;background:#faf8f4;border-radius:8px;">
           <p style="font-size:14px;line-height:1.55;color:#1a1a1a;margin:0;font-family:'DM Sans',system-ui,sans-serif;">
             <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#16a34a;margin-right:8px;vertical-align:middle;"></span>
             ${marketPulse.isExternal
               ? `${escapeHtml(marketPulse.headline)}${marketPulse.url ? ` &nbsp;<a href="${escapeHtml(marketPulse.url)}" style="color:${brand};font-weight:600;text-decoration:none;">Read →</a>` : ""}`
               : `<span style="color:#555;font-weight:600;">In your sector this week:</span> ${escapeHtml(marketPulse.headline)}`}
           </p>
         </div>
       </div>`
    : "";

  const yourMoveHtml = `<div style="margin:0 0 28px;padding:20px 24px;background:${brand}0D;border-radius:8px;">
       ${sectionHeader("Your move this week")}
       <p style="font-size:15px;line-height:1.6;color:#1a1a1a;margin:0 0 16px;font-family:'DM Sans',system-ui,sans-serif;">${escapeHtml(yourMove.copy)}</p>
       <a href="${escapeHtml(yourMove.ctaHref)}" style="display:inline-block;background:${brand};color:#ffffff;padding:11px 28px;border-radius:6px;font-weight:600;font-size:14px;text-decoration:none;font-family:'DM Sans',system-ui,sans-serif;">${escapeHtml(yourMove.ctaLabel)}</a>
     </div>`;

  const readyPostHtml = readyPost
    ? `<div style="margin:24px 0;padding:20px 24px;background:#f5f0e8;border-radius:10px;border-left:4px solid ${brand};">
         <p style="font-size:11px;font-weight:600;color:${brand};letter-spacing:0.08em;text-transform:uppercase;margin-bottom:12px;">✦ YOUR POST IS READY</p>
         <p style="font-size:14px;line-height:1.75;color:#1a1a1a;margin-bottom:16px;white-space:pre-line;">${escapeHtml(readyPost)}</p>
         <a href="${APP_URL}/home?tab=authority" style="display:inline-block;background:${brand};color:#0d0d0d;padding:10px 20px;border-radius:6px;font-weight:600;font-size:13px;text-decoration:none;">Open in Publish tab →</a>
       </div>`
    : "";

  let signalsHtml = "";
  if (topSignals.length === 0) {
    const captureHref = appendParams(`${APP_URL}/home`, { email: opts.emailParam });
    signalsHtml = `<div style="margin:0 0 28px;">
         ${sectionHeader("Signal pulse")}
         <div style="padding:14px 16px;background:#faf8f4;border-radius:8px;">
           <p style="font-size:14px;line-height:1.6;color:#555;margin:0 0 10px;font-family:'DM Sans',system-ui,sans-serif;">No active signals yet. Capture 2-3 articles from your sector to seed your first signal.</p>
           <a href="${escapeHtml(captureHref)}" style="color:${brand};font-weight:600;font-size:13px;text-decoration:none;font-family:'DM Sans',system-ui,sans-serif;">Capture an article →</a>
         </div>
       </div>`;
  } else {
    const rows = topSignals.slice(0, 2).map((s, idx) => {
      const sign = s.deltaPct > 0 ? "+" : "";
      const deltaColor = s.deltaPct > 0 ? "#16a34a" : s.deltaPct < 0 ? "#dc2626" : "#888";
      const deltaText = s.deltaPct === 0 ? "no change" : `${sign}${s.deltaPct} pts`;
      const borderColor = idx === 0 ? brand : `${brand}40`;
      const href = appendParams(`${APP_URL}/home`, {
        tab: "intelligence", signal: s.id, email: opts.emailParam,
      });
      return `<div style="margin-bottom:10px;padding:14px 16px;background:#faf8f4;border-radius:8px;border-left:3px solid ${borderColor};">
             <a href="${escapeHtml(href)}" style="display:block;font-size:14px;font-weight:600;color:${brand};text-decoration:none;margin-bottom:4px;font-family:'DM Sans',system-ui,sans-serif;">${escapeHtml(s.title)}</a>
             <p style="font-size:12px;color:#555;margin:0;font-family:'DM Sans',system-ui,sans-serif;">Confidence <strong style="color:#0d0d0d;">${s.currentPct}%</strong> · <span style="color:${deltaColor};">${escapeHtml(deltaText)}</span> vs 7d ago</p>
             ${idx === 0 && s.whyNow ? `<p style="font-size:13px;line-height:1.55;color:#3a3835;margin:8px 0 0;font-family:'DM Sans',system-ui,sans-serif;"><span style="color:#888;font-weight:600;">Why now:</span> ${escapeHtml(s.whyNow)}</p>` : ""}
           </div>`;
    }).join("");
    signalsHtml = `<div style="margin:0 0 28px;">${sectionHeader("Signal pulse")}${rows}</div>`;
  }

  const worthReadingHtml = worthReading
    ? `<div style="margin:0 0 28px;">
         ${sectionHeader("Worth reading")}
         <div style="padding:14px 16px;background:#faf8f4;border-radius:8px;">
           <p style="font-size:14px;line-height:1.5;color:#1a1a1a;margin:0 0 6px;font-family:'DM Sans',system-ui,sans-serif;">
             <span style="margin-right:8px;">📖</span>
             <a href="${escapeHtml(worthReading.url)}" style="color:${brand};font-weight:600;text-decoration:none;">${escapeHtml(worthReading.title)}</a>
           </p>
           <p style="font-size:12px;color:#888;margin:0 0 8px;font-family:'DM Sans',system-ui,sans-serif;">${escapeHtml(worthReading.author || "")}${worthReading.author ? " · " : ""}${worthReading.readMinutes} min read</p>
           <p style="font-size:13px;line-height:1.55;color:#555;margin:0;font-family:'DM Sans',system-ui,sans-serif;">${escapeHtml(worthReading.why)}</p>
         </div>
       </div>`
    : "";

  const rhythmHtml = `<div style="margin:0 0 8px;">
       ${sectionHeader("Your rhythm")}
       <div style="padding:16px 18px;background:#faf8f4;border-radius:8px;">
         <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
           <tr>
             <td width="50%" valign="top" style="padding-right:8px;">
               <p style="font-size:22px;font-weight:500;color:#0d0d0d;margin:0 0 4px;line-height:1.1;font-family:'DM Sans',system-ui,sans-serif;">${postsThisWeek}</p>
               <p style="font-size:11px;color:#888;letter-spacing:0.04em;margin:0;text-transform:uppercase;font-family:'DM Sans',system-ui,sans-serif;">Post${postsThisWeek === 1 ? "" : "s"} this week</p>
             </td>
             <td width="50%" valign="top" style="padding-left:8px;">
               <p style="font-size:22px;font-weight:500;color:#0d0d0d;margin:0 0 4px;line-height:1.1;font-family:'DM Sans',system-ui,sans-serif;">${activeWeeks} <span style="font-size:13px;color:#888;font-weight:400;">of 12</span></p>
               <p style="font-size:11px;color:#888;letter-spacing:0.04em;margin:0;text-transform:uppercase;font-family:'DM Sans',system-ui,sans-serif;">Weeks active</p>
             </td>
           </tr>
         </table>
         <p style="font-size:13px;line-height:1.55;color:#555;margin:14px 0 0;font-family:'DM Sans',system-ui,sans-serif;">${escapeHtml(rhythmCopy)}</p>
       </div>
     </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Your Aura intelligence brief</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background-color:#f0ede8; font-family:'${brandFont}','DM Sans',system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; -webkit-font-smoothing:antialiased; }
  a { text-decoration:none; }
  @media only screen and (max-width:600px) {
    .email-wrapper { padding:0 !important; }
    .email-card { border-radius:0 !important; }
    .content-pad { padding:28px 22px !important; }
    .hero-pad { padding:36px 24px 28px !important; }
    .footer-pad { padding:24px 24px !important; }
  }
</style>
</head>
<body>
<div style="display:none;max-height:0;overflow:hidden;">Your weekly Aura intelligence brief — what shifted in your authority landscape this week.</div>

<div class="email-wrapper" style="padding:24px;background-color:#f0ede8;">
  <div class="email-card" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">

    <div class="hero-pad" style="padding:40px 40px 32px;background:#1a1714;color:#f0f0f0;">
      <p style="font-size:11px;color:${brand};letter-spacing:0.14em;text-transform:uppercase;margin-bottom:14px;font-weight:600;font-family:'DM Sans',system-ui,sans-serif;">Aura · Weekly Brief</p>
      <h1 style="font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;font-size:30px;line-height:1.2;font-weight:500;color:#f0f0f0;margin-bottom:8px;">${escapeHtml(headline)}</h1>
      <p style="font-size:13px;color:#9a9590;line-height:1.5;font-family:'DM Sans',system-ui,sans-serif;">${escapeHtml(dayDate)}</p>
    </div>

    <div class="content-pad" style="padding:36px 40px;color:#1a1a1a;">
      ${marketPulseHtml}
      ${yourMoveHtml}
      ${readyPostHtml}
      ${signalsHtml}
      ${worthReadingHtml}
      ${rhythmHtml}
    </div>

    <div class="footer-pad" style="padding:28px 40px;background:#faf8f4;border-top:1px solid #ece8e0;">
      <p style="font-size:12px;color:#888;line-height:1.6;text-align:center;margin-bottom:6px;font-family:'DM Sans',system-ui,sans-serif;">Aura · Strategic Intelligence for senior professionals.</p>
      <p style="font-size:11px;color:#aaa;line-height:1.6;text-align:center;font-family:'DM Sans',system-ui,sans-serif;">Manage your preferences from your profile menu in Aura.</p>
    </div>

  </div>
</div>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    const bearer = authHeader.replace("Bearer ", "");
    const apiKey = req.headers.get("apikey") || req.headers.get("x-api-key") || "";
    const cronHeader = req.headers.get("x-cron-secret") || "";
    const isCron = !!CRON_SECRET && cronHeader === CRON_SECRET;
    const isServiceRole = bearer === SERVICE_ROLE || apiKey === SERVICE_ROLE;

    let authedUserId: string | null = null;
    if (!isCron && !isServiceRole) {
      if (!bearer) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });
      const { data: { user }, error: userErr } = await userClient.auth.getUser(bearer);
      if (userErr || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      authedUserId = user.id;
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: dsRow } = await admin
      .from('design_system')
      .select('tokens')
      .eq('scope', 'global')
      .eq('is_active', true)
      .single();
    const ds = (dsRow?.tokens as any) || {};
    const BRAND = ds?.colors?.brand?.light || '#B08D3A';
    const BRAND_FONT = ds?.typography?.body || 'DM Sans';

    let targetUserId: string | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body && typeof body.user_id === "string") targetUserId = body.user_id;
      } catch {
        // no body — process all users
      }
    }
    if (!isCron && !isServiceRole) {
      targetUserId = authedUserId;
    }

    let userIds: string[] = [];
    if (targetUserId) {
      userIds = [targetUserId];
    } else {
      const { data: profiles, error: profErr } = await admin
        .from("diagnostic_profiles")
        .select("user_id");
      if (profErr) throw profErr;
      userIds = (profiles ?? []).map((p) => p.user_id).filter(Boolean) as string[];
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date();
    const dayDate = now.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });

    let sentCount = 0;
    const errors: Array<{ user_id: string; error: string }> = [];

    for (const userId of userIds) {
      try {
        const { data: userRes, error: userErr } = await admin.auth.admin.getUserById(userId);
        if (userErr || !userRes?.user?.email) {
          errors.push({ user_id: userId, error: "no auth user/email" });
          continue;
        }
        const email = userRes.user.email;

        const { data: profile } = await admin
          .from("diagnostic_profiles")
          .select("first_name, firm, sector_focus, notification_prefs")
          .eq("user_id", userId)
          .maybeSingle();

        const prefs = (profile?.notification_prefs ?? {}) as Record<string, unknown>;
        if (prefs.email_weekly_brief === false) {
          continue;
        }

        const firstName = (profile?.first_name as string | undefined)?.trim()
          || (email.split("@")[0] ?? "there");

        // Top signals (now include strategic_implications for "Why now")
        const { data: topSignalsRows } = await admin
          .from("strategic_signals")
          .select("id, signal_title, confidence, strategic_implications")
          .eq("user_id", userId)
          .eq("status", "active")
          .order("priority_score", { ascending: false })
          .limit(3);

        let priorConfidenceById: Record<string, number> = {};
        const { data: priorSnapshot } = await admin
          .from("score_snapshots")
          .select("components, created_at")
          .eq("user_id", userId)
          .lte("created_at", sevenDaysAgo)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const priorSignals = (priorSnapshot?.components as any)?.signals;
        if (Array.isArray(priorSignals)) {
          for (const s of priorSignals) {
            if (s?.id && typeof s?.confidence === "number") {
              priorConfidenceById[s.id] = s.confidence;
            }
          }
        }

        const topSignals = (topSignalsRows ?? []).map((s: any) => {
          const currentPct = s.confidence != null ? Math.round(Number(s.confidence) * 100) : 0;
          const prior = priorConfidenceById[s.id];
          const priorPct = prior != null ? Math.round(prior * 100) : currentPct;
          return {
            id: s.id as string,
            title: s.signal_title as string,
            currentPct,
            deltaPct: currentPct - priorPct,
            whyNow: firstSentence(s.strategic_implications as string | null),
          };
        });
        const topSignalTitle = topSignals[0]?.title ?? null;

        // Generate a ready-to-publish post from the top signal
        let readyPost: string | null = null;
        const topSig = (topSignalsRows || [])[0] as any;
        if (topSig?.signal_title) {
          try {
            const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
            if (LOVABLE_API_KEY) {
              const sectorFocus = (profile?.sector_focus as string) || "your sector";
              const postPrompt = `Write a concise LinkedIn post (120-180 words) for a senior professional in ${sectorFocus}.

Based on this strategic signal:
Title: ${topSig.signal_title}
Confidence: ${Math.round(Number(topSig.confidence) * 100)}%
${topSig.strategic_implications ? `Implications: ${topSig.strategic_implications}` : ""}

Rules:
- Write as a senior professional sharing an observation, not as AI
- Open with a hook that names a specific sector shift or data point
- Include one concrete insight or implication
- End with a question that invites professional discussion
- No hashtags, no emoji, no motivational language
- Professional, measured, direct tone
- Do NOT use these words: delve, tapestry, landscape, synergy, leverage, holistic, robust, utilize, comprehensive, cutting-edge, game-changer, unprecedented, paradigm`;
              const ctrl = new AbortController();
              const timeoutId = setTimeout(() => ctrl.abort(), 15_000);
              try {
                const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${LOVABLE_API_KEY}`,
                    "Content-Type": "application/json",
                  },
                  signal: ctrl.signal,
                  body: JSON.stringify({
                    model: "google/gemini-3-flash-preview",
                    messages: [
                      { role: "system", content: "You are a LinkedIn ghostwriter for GCC executives. Write concise, professional posts. Return only the post text — no preamble, no markdown, no quotes." },
                      { role: "user", content: postPrompt },
                    ],
                  }),
                });
                clearTimeout(timeoutId);
                if (aiRes.ok) {
                  const aiData = await aiRes.json();
                  readyPost = aiData?.choices?.[0]?.message?.content?.trim() || null;
                }
              } catch (e) {
                clearTimeout(timeoutId);
                console.warn("Ready post generation timed out or failed:", (e as Error).message);
              }
            }
          } catch (e) {
            console.warn("Ready post generation failed:", (e as Error).message);
          }
        }

        // Publishing cadence
        const oneWeekAgoIso = sevenDaysAgo;
        const twoWeeksAgoIso = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
        const [{ count: postsThisWeek }, { count: postsLastWeek }] = await Promise.all([
          admin
            .from("linkedin_posts")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .gte("published_at", oneWeekAgoIso),
          admin
            .from("linkedin_posts")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .gte("published_at", twoWeeksAgoIso)
            .lt("published_at", oneWeekAgoIso),
        ]);

        // Capture rhythm — distinct active weeks in last 12
        const twelveWeeksAgo = new Date(Date.now() - 12 * 7 * 86400000);
        const { data: rhythmEntries } = await admin
          .from("entries")
          .select("created_at")
          .eq("user_id", userId)
          .gte("created_at", twelveWeeksAgo.toISOString());
        let activeWeeks = 0;
        for (let i = 0; i < 12; i++) {
          const wkEnd = new Date(Date.now() - i * 7 * 86400000);
          const wkStart = new Date(wkEnd.getTime() - 7 * 86400000);
          if ((rhythmEntries || []).some((e: any) => {
            const t = new Date(e.created_at).getTime();
            return t >= wkStart.getTime() && t < wkEnd.getTime();
          })) activeWeeks++;
        }

        // Market pulse — most recent industry_trends, else top signal implication
        const { data: latestTrend } = await admin
          .from("industry_trends")
          .select("headline, url, source")
          .eq("user_id", userId)
          .order("fetched_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        let marketPulse: BuildHtmlOpts["marketPulse"] = null;
        if (latestTrend?.headline) {
          marketPulse = {
            headline: latestTrend.headline as string,
            url: (latestTrend.url as string | null) || null,
            isExternal: true,
          };
        } else if (topSignals[0]) {
          const impl = firstSentence((topSignalsRows?.[0] as any)?.strategic_implications);
          if (impl) marketPulse = { headline: impl, url: null, isExternal: false };
        }

        // Worth reading — most recent industry_trends not yet captured
        let worthReading: BuildHtmlOpts["worthReading"] = null;
        const { data: candidateTrends } = await admin
          .from("industry_trends")
          .select("headline, url, source, summary, insight, fetched_at")
          .eq("user_id", userId)
          .not("url", "is", null)
          .order("fetched_at", { ascending: false })
          .limit(10);
        if (candidateTrends && candidateTrends.length) {
          const urls = candidateTrends.map((t: any) => t.url).filter(Boolean);
          const { data: capturedRows } = await admin
            .from("entries")
            .select("image_url")
            .eq("user_id", userId)
            .in("image_url", urls);
          const captured = new Set((capturedRows || []).map((r: any) => r.image_url));
          const pick: any = candidateTrends.find((t: any) => t.url && !captured.has(t.url));
          if (pick) {
            worthReading = {
              title: pick.headline as string,
              url: pick.url as string,
              author: (pick.source as string | null) || null,
              readMinutes: 5,
              why: firstSentence(pick.insight || pick.summary || "") || "Aura picked this for you.",
            };
          }
        }

        // Hero headline (dynamic, not signal-name based)
        let headline: string;
        if ((postsLastWeek ?? 0) > 0) {
          headline = `${firstName}, your momentum is building.`;
        } else if (topSignals.length > 0) {
          headline = `${firstName}, one move this week keeps your momentum.`;
        } else {
          headline = `${firstName}, your intelligence is waiting.`;
        }

        // Email parameter for prefill on landing
        const emailParam = email;

        // "Your move this week" CTA logic
        let yourMove: BuildHtmlOpts["yourMove"];
        if ((postsLastWeek ?? 0) > 0) {
          yourMove = {
            copy: "You published last week — let's see how it landed and where to compound next.",
            ctaLabel: "See your impact →",
            ctaHref: appendParams(`${APP_URL}/home`, { tab: "authority", email: emailParam }),
          };
        } else if (topSignals.length > 0) {
          yourMove = {
            copy: `Your strongest signal is ready to publish. One post turns market intelligence into visible authority.`,
            ctaLabel: "Draft your post →",
            ctaHref: appendParams(`${APP_URL}/home`, { tab: "publish", signal: topSignals[0].id, email: emailParam }),
          };
        } else {
          yourMove = {
            copy: "Capture one article from your sector this week — that's how Aura starts surfacing signals you can publish from.",
            ctaLabel: "Capture an article →",
            ctaHref: appendParams(`${APP_URL}/home`, { email: emailParam }),
          };
        }

        // Rhythm copy
        let rhythmCopy: string;
        if ((postsThisWeek ?? 0) > 0) {
          rhythmCopy = "Active rhythm. This is how presence compounds.";
        } else if (activeWeeks > 0) {
          rhythmCopy = "You're capturing consistently. Publishing is the next step.";
        } else {
          rhythmCopy = "Your first post turns signals into presence. Start this week.";
        }

        const subject = topSignals.length > 0
          ? `Your signals shifted — here's your edge · ${dayDate}`
          : `Your week ahead · ${dayDate}`;

        const html = buildHtml({
          firstName,
          dayDate,
          topSignals,
          postsThisWeek: postsThisWeek ?? 0,
          postsLastWeek: postsLastWeek ?? 0,
          brand: BRAND,
          brandFont: BRAND_FONT,
          headline,
          emailParam,
          marketPulse,
          yourMove,
          worthReading,
          activeWeeks,
          rhythmCopy,
          readyPost,
        });

        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Aura <Mohammad.Mahafdhah@aura-intel.org>",
            reply_to: "mohammad.mahafdhah@aura-intel.org",
            to: [email],
            subject,
            html,
          }),
        });

        if (!resendRes.ok) {
          const errText = await resendRes.text();
          console.error("Resend send failed for", userId, resendRes.status, errText);
          errors.push({ user_id: userId, error: `resend ${resendRes.status}: ${errText.slice(0, 200)}` });
          continue;
        }

        await admin.from("notification_events").insert({
          user_id: userId,
          type: "weekly_brief",
          channel: "email",
          title: "Weekly brief sent",
          body: subject,
          read: true,
          read_at: new Date().toISOString(),
          metadata: {
            top_signal: topSignalTitle,
            active_weeks: activeWeeks,
            posts_this_week: postsThisWeek ?? 0,
          },
        });

        sentCount += 1;
      } catch (innerErr) {
        const msg = innerErr instanceof Error ? innerErr.message : String(innerErr);
        console.error("send-weekly-brief failure for", userId, msg);
        errors.push({ user_id: userId, error: msg });
      }
    }

    return new Response(
      JSON.stringify({ success: true, sent_count: sentCount, attempted: userIds.length, errors }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("send-weekly-brief fatal:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
