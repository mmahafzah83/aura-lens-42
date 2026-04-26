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
    const [profile, signals, posts, memory, alerts] = await Promise.all([
      safe(
        admin
          .from("diagnostic_profiles")
          .select("sector_focus, core_practice, north_star_goal, level, firm, brand_pillars, first_name")
          .eq("user_id", user_id)
          .maybeSingle() as any,
      ),
      safe(
        admin
          .from("strategic_signals")
          .select("signal_title, explanation, strategic_implications, confidence, theme_tags, status, priority_score")
          .eq("user_id", user_id)
          .order("priority_score", { ascending: false })
          .limit(10) as any,
      ),
      safe(
        admin
          .from("linkedin_posts")
          .select("post_text, engagement_score, tone, theme, format_type, published_at")
          .eq("user_id", user_id)
          .order("published_at", { ascending: false })
          .limit(5) as any,
      ),
      safe(
        admin
          .from("aura_conversation_memory")
          .select("session_date, summary, key_decisions, topics_discussed, actions_committed")
          .eq("user_id", user_id)
          .order("session_date", { ascending: false })
          .limit(3) as any,
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
    ]);

    const p: any = profile || {};
    const sigs: any[] = Array.isArray(signals) ? signals : [];
    const pst: any[] = Array.isArray(posts) ? posts : [];
    const mem: any[] = Array.isArray(memory) ? memory : [];
    const alt: any[] = Array.isArray(alerts) ? alerts : [];

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

ACTIVE SIGNALS (top 10 by priority):
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
}`;

    // STEP 3 — call AI
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
        messages: [{ role: "system", content: systemPrompt }, ...messages],
      }),
    });

    if (!aiRes.ok) {
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
      const t = await aiRes.text();
      console.error("AI gateway error", aiRes.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiRes.json();
    const reply: string =
      aiJson?.choices?.[0]?.message?.content?.trim() || "(no response)";

    // STEP 4 — side effects (tolerate failures)
    try {
      await admin.from("notification_events").insert({
        user_id,
        type: "inapp",
        channel: "inapp",
        title: "Ask Aura response",
        body: reply.slice(0, 240),
        read: false,
      });
    } catch (e) {
      console.error("notification insert failed:", e);
    }

    if (messages.length >= 4) {
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
              {
                role: "system",
                content:
                  "Summarize this advisory conversation in exactly 2 sentences. Plain prose, no preamble.",
              },
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

    return new Response(
      JSON.stringify({
        reply,
        context_used: {
          signals_count: sigs.length,
          posts_count: pst.length,
          memory_sessions: mem.length,
          identity_loaded: !!profile,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("ask-aura error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});