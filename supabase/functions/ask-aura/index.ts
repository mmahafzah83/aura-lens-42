import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Msg = { role: "user" | "assistant" | "system"; content: string };

function safe<T>(p: Promise<{ data: T | null; error: any }>): Promise<T | null> {
  return p.then(({ data, error }) => {
    if (error) console.error("fetch error:", error.message);
    return data;
  }).catch((e) => {
    console.error("fetch threw:", e);
    return null;
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user_id = userRes.user.id;

    const body = await req.json();
    const incoming: Msg[] = Array.isArray(body?.messages) ? body.messages : [];
    const mode: "advisor" | "standard" = body?.mode === "advisor" ? "advisor" : "standard";

    if (incoming.length === 0) {
      return new Response(JSON.stringify({ error: "messages required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cap to last 6 turns
    const messages = incoming.slice(-6);

    // Service-role client for context fetch + writes
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // STEP 1 — assemble context (in parallel, tolerate failures)
    const [profile, signals, posts, memory, alerts, voice, scoreSnap, entriesRecent, entriesCount, metrics, trends] = await Promise.all([
      safe(
        admin
          .from("diagnostic_profiles")
          .select("sector_focus, core_practice, north_star_goal, level, firm, brand_pillars, first_name, skill_ratings, created_at")
          .eq("user_id", user_id)
          .maybeSingle() as any,
      ),
      safe(
        admin
          .from("strategic_signals")
          .select("signal_title, explanation, strategic_implications, confidence, theme_tags, status, priority_score, source_count, velocity_status")
          .eq("user_id", user_id)
          .order("priority_score", { ascending: false })
          .limit(5) as any,
      ),
      safe(
        admin
          .from("linkedin_posts")
          .select("post_text, engagement_score, tone, theme, format_type, published_at, hook, framework_type, tracking_status")
          .eq("user_id", user_id)
          .order("published_at", { ascending: false })
          .limit(10) as any,
      ),
      safe(
        admin
          .from("aura_conversation_memory")
          .select("session_date, summary, key_decisions, topics_discussed, actions_committed")
          .eq("user_id", user_id)
          .order("session_date", { ascending: false })
          .limit(5) as any,
      ),
      safe(
        admin
          .from("notification_events")
          .select("type, title, body, sent_at")
          .eq("user_id", user_id)
          .eq("read", false)
          .order("sent_at", { ascending: false })
          .limit(5) as any,
      ),
      safe(
        admin
          .from("authority_voice_profiles")
          .select("tone, preferred_structures, storytelling_patterns")
          .eq("user_id", user_id)
          .maybeSingle() as any,
      ),
      safe(
        admin
          .from("score_snapshots")
          .select("score, tier, components, created_at")
          .eq("user_id", user_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle() as any,
      ),
      safe(
        admin
          .from("entries")
          .select("title, entry_type, created_at")
          .eq("user_id", user_id)
          .order("created_at", { ascending: false })
          .limit(10) as any,
      ),
      safe(
        admin
          .from("entries")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user_id) as any,
      ),
      safe(
        admin
          .from("linkedin_post_metrics")
          .select("impressions, engagement_rate, reactions, comments, snapshot_date")
          .eq("user_id", user_id)
          .order("snapshot_date", { ascending: false })
          .limit(5) as any,
      ),
      safe(
        admin
          .from("industry_trends")
          .select("headline, impact_level")
          .order("created_at", { ascending: false })
          .limit(3) as any,
      ),
    ]);

    const p: any = profile || {};
    const sigs: any[] = Array.isArray(signals) ? signals : [];
    const pst: any[] = Array.isArray(posts) ? posts : [];
    const mem: any[] = Array.isArray(memory) ? memory : [];
    const alt: any[] = Array.isArray(alerts) ? alerts : [];
    const vp: any = voice || {};
    const sc: any = scoreSnap || {};
    const ents: any[] = Array.isArray(entriesRecent) ? entriesRecent : [];
    const entsTotal: number = (entriesCount as any)?.count ?? ents.length;
    const mets: any[] = Array.isArray(metrics) ? metrics : [];
    const trnds: any[] = Array.isArray(trends) ? trends : [];

    const publishedCount = pst.filter((x) => !!x.published_at).length;
    const draftCount = pst.length - publishedCount;
    const accountDays = p.created_at
      ? Math.max(1, Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86400000))
      : null;

    const entriesBlock =
      ents.length === 0
        ? "—"
        : ents.map((e) => `- ${(e.title || "(untitled)").slice(0, 80)} [${e.entry_type || "entry"}]`).join("\n");

    const metricsBlock =
      mets.length === 0
        ? "—"
        : mets
            .map(
              (m) =>
                `- ${(m.snapshot_date || "").slice(0, 10) || "—"} · impressions ${m.impressions ?? 0} · eng ${(Number(m.engagement_rate || 0) * 100).toFixed(1)}% · ${m.reactions ?? 0}♥ ${m.comments ?? 0}💬`,
            )
            .join("\n");

    const trendsBlock =
      trnds.length === 0 ? "—" : trnds.map((t) => `- ${t.headline} (${t.impact_level || "med"} impact)`).join("\n");

    const skillsBlock = (() => {
      const sr = p.skill_ratings;
      if (!sr || typeof sr !== "object") return "—";
      const entries = Object.entries(sr).filter(([, v]) => typeof v === "number");
      if (!entries.length) return "—";
      entries.sort((a, b) => (b[1] as number) - (a[1] as number));
      return entries.map(([k, v]) => `- ${k}: ${v}/100`).join("\n");
    })();

    const fmtList = (arr: any) =>
      Array.isArray(arr) && arr.length ? arr.join(", ") : "—";

    const signalsBlock =
      sigs.length === 0
        ? "—"
        : sigs
            .map(
              (s) =>
                `- ${s.signal_title || "(untitled)"} — ${
                  s.strategic_implications || s.explanation || "no implications recorded"
                } (Confidence: ${Math.round(Number(s.confidence || 0) * 100)}%)`,
            )
            .join("\n");

    const postsBlock =
      pst.length === 0
        ? "—"
        : pst
            .map(
              (po) =>
                `- ${(po.post_text || "").slice(0, 200)} | Engagement: ${
                  po.engagement_score ?? 0
                } | Tone: ${po.tone || "—"}`,
            )
            .join("\n");

    const memoryBlock =
      mem.length === 0
        ? "—"
        : mem
            .map(
              (m) =>
                `- ${m.session_date}: ${m.summary || "(no summary)"} | Decisions: ${fmtList(
                  m.key_decisions,
                )} | Committed to: ${fmtList(m.actions_committed)}`,
            )
            .join("\n");

    const alertsBlock =
      alt.length === 0
        ? "—"
        : alt.map((a) => `- ${a.type}: ${a.title} (${a.sent_at})`).join("\n");

    const systemPrompt = `You are Aura — a senior strategic intelligence advisor. You are not a generic AI. You are a dedicated advisor who has studied this professional for months and knows their work deeply.

PROFESSIONAL PROFILE:
Name: ${p.first_name || "—"}
Firm: ${p.firm || "—"}
Level: ${p.level || "—"}
Sector: ${p.sector_focus || "—"}
Core Practice: ${p.core_practice || "—"}
North Star Goal: ${p.north_star_goal || "—"}
Brand Pillars: ${fmtList(p.brand_pillars)}
Account age: ${accountDays != null ? `${accountDays} day${accountDays === 1 ? "" : "s"} on Aura` : "—"}

CALIBRATION SCORES (skill_ratings, 0-100):
${skillsBlock}

VOICE PROFILE:
Tone: ${vp.tone || "—"}
Preferred structures: ${fmtList(vp.preferred_structures)}
Storytelling patterns: ${fmtList(vp.storytelling_patterns)}

PRESENCE SCORE: ${sc.score ?? "—"}${sc.tier ? ` (${sc.tier})` : ""}

RECENT CAPTURES (last 10 of ${entsTotal} total):
${entriesBlock}

RECENT POST METRICS (last 5):
${metricsBlock}

CONTENT SUMMARY: ${publishedCount} published, ${draftCount} draft${draftCount === 1 ? "" : "s"}

INDUSTRY TRENDS (top 3):
${trendsBlock}

ACTIVE SIGNALS (top 5 by priority):
${signalsBlock}

RECENT CONTENT (last 5 posts):
${postsBlock}

CONVERSATION MEMORY (last 3 sessions):
${memoryBlock}

RECENT ALERTS:
${alertsBlock}

RESPONSE RULES — follow these on every response without exception:
1. Always start with a direct answer. Never warm up with pleasantries.
2. Reference real signal titles by name when relevant — never invent signals.
3. Reference real post data when discussing content history.
4. If you don't have data on something, say: "I don't have enough captures on this yet — add more sources in this area to build a signal."
5. Never say "as an AI" or "I don't have access to."
6. Structure every response: [Direct Answer] → [Evidence from signals or posts] → [One specific action].
7. Keep responses under 300 words unless the user asks for deep analysis.
8. Always end with exactly one concrete next step — not a list, not options. One thing.
9. If asked "what should I post?" — name the highest priority_score signal, propose a specific hook, specify the format.
10. If asked for an honest assessment — be direct, data-backed, and uncomfortable if necessary. This is advisor mode.

TONE: Direct. Confident. A trusted senior colleague who respects the user's intelligence and time. Not a coach. Not a chatbot. Not agreeable for the sake of it.

${
  mode === "advisor"
    ? 'MODE: ADVISOR — Be the Senior Partner doing a frank quarterly review. Challenge assumptions. Name what\'s not working. Always back it with data from the context above.'
    : ""
}

GROUNDING CONTRACT — NON-NEGOTIABLE RULES FOR EVERY RESPONSE:

1. SIGNAL CITATION: Every response must reference at least one signal_title from the user's strategic_signals data by its exact name, formatted in bold. If no signals were loaded, say "I don't have your signals loaded — please capture something first."

2. TEMPORAL HOOK: Every strategic recommendation must include a "why now" — one sentence explaining what makes this week specifically the right moment. Reference a competitor move, a signal momentum change, or a market event. Never omit this.

3. NEXT STEP: Every response must end with exactly this format:

"NEXT STEP: [one specific action] — [named owner if relevant] — [specific deadline]"

Example: "NEXT STEP: Draft the 2-page Integration Trap white paper — you — by Friday"

Never end a response without this line.

4. CONTRARIAN OBLIGATION: If the user's plan sounds conventional or safe, you must name the specific risk they are not seeing. Be direct. Name competitors by name (McKinsey, PwC, Deloitte, BCG) when relevant. Never use euphemisms.

5. IDENTITY: You are not ChatGPT. You are the user's Chief of Staff with access to their intelligence layer. Every response must feel like it could only come from someone who knows their specific signals, sector, and career target — not from a generic AI.`;

    const responseRules = `

RESPONSE RULES (v2 DEFINITIVE — ALWAYS APPLY):
1. You know EVERYTHING about this user from the context above. Use it. Reference specific signals by name, specific calibration scores with numbers, specific captures by title.
2. When asked about strengths, give EXACT calibration scores from the CALIBRATION SCORES block — not generic advice.
3. When reviewing content, compare against the VOICE PROFILE. Be honest about what's weak.
4. ONE recommendation, not five. Reduce decision fatigue. Never write "Here are 5 ideas" or "Consider these options."
5. End every response with a specific NEXT STEP line.
6. Cite signals by name in **bold**. Reference captures by title.
7. If you don't have data: "I don't have intelligence on that yet. Capture an article about it."
8. If the user writes in Arabic, respond in professional Gulf Arabic. One sentence per line, max 10-12 Arabic words per line. Signal names stay in English.
9. Never say: "As an AI", "Great question!", "Here are some suggestions", "You might want to consider", "That's a wonderful insight."
10. Think like a McKinsey Senior Partner giving private counsel to a peer — direct, evidence-based, no fluff.
11. When reviewing posts: be HONEST. Weak hook? Say so. Suggest a specific rewrite.
12. Reference account age and progress when relevant: "You've been on Aura for ${accountDays ?? "—"} days — your top signal '${(sigs[0]?.signal_title) || "—"}' formed from that work."
13. When recommending content topics, frame as competitive: "No one in your network has covered this angle."
14. Use ONE serif "key insight" line per response when appropriate, wrapped as: <span class="serif-insight">…</span>. Optionally one italic provocation as: <blockquote>…</blockquote>.`;

    const finalSystemPrompt = systemPrompt + responseRules;

    // STEP 3 — call AI (streaming so the existing sidebar SSE consumer works unchanged)
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        max_tokens: 1000,
        temperature: 0.7,
        stream: true,
        messages: [{ role: "system", content: finalSystemPrompt }, ...messages],
      }),
    });

    if (!aiRes.ok || !aiRes.body) {
      if (aiRes.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit reached. Try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (aiRes.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Add funds in workspace settings." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const t = await aiRes.text().catch(() => "");
      console.error("AI gateway error", aiRes.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Tee the upstream SSE: forward to client AND accumulate full reply for side effects.
    const upstream = aiRes.body;
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        const reader = upstream.getReader();
        let buffer = "";
        let fullReply = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            // Forward bytes immediately
            controller.enqueue(value);
            // Also parse to accumulate text for memory + notification
            buffer += decoder.decode(value, { stream: true });
            let idx: number;
            while ((idx = buffer.indexOf("\n")) !== -1) {
              let line = buffer.slice(0, idx);
              buffer = buffer.slice(idx + 1);
              if (line.endsWith("\r")) line = line.slice(0, -1);
              if (!line.startsWith("data: ")) continue;
              const jsonStr = line.slice(6).trim();
              if (jsonStr === "[DONE]") continue;
              try {
                const parsed = JSON.parse(jsonStr);
                const c = parsed?.choices?.[0]?.delta?.content;
                if (typeof c === "string") fullReply += c;
              } catch { /* partial — ignore */ }
            }
          }

          // Emit context_used as a custom SSE event (sidebar ignores non-delta events).
          const contextEvent = {
            choices: [{ delta: {} }],
            context_used: {
              signals_count: sigs.length,
              posts_count: pst.length,
              memory_sessions: mem.length,
              identity_loaded: !!profile,
            },
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(contextEvent)}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (e) {
          console.error("stream tee error:", e);
        } finally {
          controller.close();
        }

        // STEP 4 — fire-and-forget side effects
        const reply = fullReply.trim();
        if (reply) {
          admin.from("notification_events").insert({
            user_id,
            type: "inapp",
            channel: "inapp",
            title: "Ask Aura response",
            body: reply.slice(0, 240),
            read: false,
          }).then(({ error }) => { if (error) console.error("notif insert:", error.message); });
        }

        if (messages.length >= 4 && reply) {
          try {
            const summaryRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-3-flash-preview",
                max_tokens: 120,
                temperature: 0.3,
                messages: [
                  { role: "system", content: "Summarize this advisory conversation in exactly 2 sentences. Plain prose, no preamble." },
                  ...messages,
                  { role: "assistant", content: reply },
                ],
              }),
            });
            if (summaryRes.ok) {
              const sj = await summaryRes.json();
              const summary: string = sj?.choices?.[0]?.message?.content?.trim() || "";
              if (summary) {
                const today = new Date().toISOString().slice(0, 10);
                const { data: existing } = await admin
                  .from("aura_conversation_memory")
                  .select("id")
                  .eq("user_id", user_id)
                  .eq("session_date", today)
                  .maybeSingle();
                if (existing?.id) {
                  await admin
                    .from("aura_conversation_memory")
                    .update({ summary, updated_at: new Date().toISOString() })
                    .eq("id", existing.id);
                } else {
                  await admin.from("aura_conversation_memory").insert({
                    user_id,
                    session_date: today,
                    summary,
                  });
                }
              }
            }
          } catch (e) {
            console.error("memory upsert failed:", e);
          }
        }
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ask-aura error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});