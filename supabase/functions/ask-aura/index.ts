import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { withObserve } from "../_shared/observe.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { retrieveContext, logRetrievalFailure } from "../_shared/retrieval.ts";
import { getUserContext } from "../_shared/userContext.ts";
import { buildSearchQuery } from "../_shared/queryRewrite.ts";
import { getCapabilityProfile } from "../_shared/capabilities.ts";

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

serve(withObserve("ask-aura", async (req) => {
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
    const session_id: string | null =
      typeof body?.session_id === "string" && body.session_id.trim() ? body.session_id.trim() : null;
    const ctx: { linkedType?: string; linkedId?: string; linkedLabel?: string } =
      body?.context && typeof body.context === "object" ? body.context : {};
    const linkedLabel: string =
      typeof ctx.linkedLabel === "string" ? ctx.linkedLabel.trim() : "";

    if (incoming.length === 0) {
      return new Response(JSON.stringify({ error: "messages required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cap to last 12 turns
    const messages = incoming.slice(-12);


    // Service-role client for context fetch + writes
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // STEP 1 — assemble context (in parallel, tolerate failures)
    const [profile, signals, posts, memory, alerts, voice, scoreSnap, entriesRecent, entriesCount, metrics, trends, findings] = await Promise.all([
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
          .select("id, created_at, signal_title, explanation, strategic_implications, confidence, theme_tags, status, priority_score, fragment_count, velocity_status, supporting_evidence_ids")
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
          .is("role", null)
          .not("summary", "is", null)
          .order("created_at", { ascending: false })
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
          .eq("is_primary", true)
          .eq("mode_key", "default")
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
          .select("title, type, created_at")
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
          .order("fetched_at", { ascending: false })
          .limit(3) as any,
      ),
      // What Aura's own overnight agent found for this member while they were away.
      safe(
        admin
          .from("agent_findings")
          .select("title, source, implication, relevance_score, created_at, themes")
          .eq("user_id", user_id)
          .in("status", ["pending", "kept"])
          .order("created_at", { ascending: false })
          .limit(5) as any,
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
    const finds: any[] = Array.isArray(findings) ? findings : [];

    const findingsBlock =
      finds.length === 0
        ? "—"
        : finds
            .map((f) => {
              const bits = [String(f.title || f.source || "(untitled)").slice(0, 120)];
              if (f.source) bits.push(String(f.source));
              bits.push(`score ${f.relevance_score ?? "—"}`);
              const imp = String(f.implication || "").trim();
              if (imp) bits.push(imp.slice(0, 200));
              return `- ${bits.join(" · ")}`;
            })
            .join("\n");

    const publishedCount = pst.filter((x) => !!x.published_at).length;
    const draftCount = pst.length - publishedCount;
    const accountDays = p.created_at
      ? Math.max(1, Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86400000))
      : null;

    const entriesBlock =
      ents.length === 0
        ? "—"
        : ents.map((e) => `- ${(e.title || "(untitled)").slice(0, 80)} [${e.type || "entry"}]`).join("\n");

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

    // Capability is read as BANDS, never as a number — see _shared/capabilities.ts.
    const capabilityBlock = await getCapabilityProfile(admin as any, user_id)
      .then((c) => c.toPromptBlock())
      .catch(() => "Not yet assessed — this member has not completed a capability read.");


    const fmtList = (arr: any) =>
      Array.isArray(arr) && arr.length ? arr.join(", ") : "—";

    // Zero-state guards
    const topSignal = sigs?.[0];
    const topSignalTitle = topSignal?.signal_title || null;
    const isNewUser = (accountDays != null && accountDays < 14) || (publishedCount || 0) === 0;

    const signalsBlock =
      sigs.length === 0
        ? "—"
        : sigs
            .map(
              (s, i) =>
                `- [S-${101 + i}] ${s.signal_title || "(untitled)"} — ${
                  s.strategic_implications || s.explanation || "no implications recorded"
                } (Confidence: ${Math.round(Number(s.confidence || 0) * 100)}%)`,
            )
            .join("\n");

    // Citation registry — stable within this response. The client renders a pill
    // only for refs that appear here, and each ref resolves to a real signal row
    // belonging to this user (the query above is already scoped by user_id).
    const citations = sigs.map((s, i) => ({
      ref: `S-${101 + i}`,
      id: s.id,
      title: s.signal_title || "(untitled)",
      evidence_count: Array.isArray(s.supporting_evidence_ids) ? s.supporting_evidence_ids.length : 0,
      days_live: s.created_at
        ? Math.max(0, Math.floor((Date.now() - new Date(s.created_at).getTime()) / 86400000))
        : null,
      velocity_status: s.velocity_status || null,
      confidence: Number(s.confidence || 0),
    }));

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

    // STEP 2a — member context + retrieval over their own knowledge.
    // user_id is derived from the verified JWT above, never from the body.
    const lastUserMessage = [...messages].reverse().find((m) => m.role === "user")?.content || "";

    let memberContextBlock = "not specified";
    try {
      const uctx = await getUserContext(admin, user_id);
      memberContextBlock = uctx.toPromptBlock();
    } catch (e) {
      console.error(JSON.stringify({ stage: "user_context", user_id, error: (e as Error)?.message ?? String(e) }));
    }

    // Reply language is DECIDED in code from the member's own last message, not
    // negotiated by the model against whatever language the sources are in.
    const arabicChars = (lastUserMessage.match(/[\u0600-\u06FF]/g) || []).length;
    const latinChars = (lastUserMessage.match(/[A-Za-z]/g) || []).length;
    const totalLetters = arabicChars + latinChars;
    const replyLanguage: "Arabic" | "English" =
      totalLetters > 0 && arabicChars / totalLetters > 0.2 ? "Arabic" : "English";

    let retrievedBlock = "—";
    let retrievalDegraded = false;
    let retrievedRows: any[] = [];
    // Rewrite conversational follow-ups into a standalone query before search.
    const search = await buildSearchQuery(messages, { caller: "ask-aura" });

    try {
      const retrieved = await retrieveContext(admin, user_id, search.query, {
        limit: 12,
        caller: "ask-aura",
        rewritten: search.rewritten,
        originalQuery: search.original,
      });
      if (retrieved.rows.length > 0) {
        retrievedBlock = retrieved.citationBlock;
        retrievedRows = retrieved.rows;
      }
    } catch (e) {
      retrievalDegraded = true;
      logRetrievalFailure({
        user_id,
        caller: "ask-aura",
        query_len: (search.query || "").length,
        error: e,
      });
    }

    // Parallel to `citations`, one entry per retrieved row. The number matches the
    // [n] the prompt block uses (formatCitations numbers rows 1..n in order).
    const sources = retrievedRows.map((r, i) => ({
      n: i + 1,
      title: (r.title && String(r.title).trim()) || `${String(r.source_kind).replace(/_/g, " ")} ${i + 1}`,
      kind: r.source_kind,
      date: r.occurred_at ? String(r.occurred_at).slice(0, 10) : null,
      url: r.url || null,
    }));


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

CAPABILITY READ:
${capabilityBlock}

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

WHAT THE OVERNIGHT FOUND FOR YOU (last 5, newest first):
${findingsBlock}

ACTIVE SIGNALS (top 5 by priority):
${signalsBlock}

RECENT CONTENT (last 5 posts):
${postsBlock}

CONVERSATION MEMORY (last 3 sessions):
${memoryBlock}

RECENT ALERTS:
${alertsBlock}
${linkedLabel ? `\nOPENED FROM: the member opened this conversation from "${linkedLabel}". Treat that as the subject unless they ask about something else.\n` : ""}
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

DIGNITY RULE (NON-NEGOTIABLE): You speak to senior professionals who have decades of expertise. Never diminish their achievements. Never use language that implies they are failing, invisible, or irrelevant. Name the GAP without naming the person as the problem.

NEVER tell a member they are at zero, at 0/100, or that they lack a capability. An unassessed or low band means Aura has not yet seen the evidence, not that the capability is absent. Frame it as 'not yet read' or 'room to show more', never as a deficit.

WRONG: "You are currently an observer, not a leader."
RIGHT: "Your expertise runs deeper than your digital footprint shows. The gap between what you know and what the market sees is where the opportunity lives."

WRONG: "Your digital presence is non-existent."
RIGHT: "The market has very little signal about your expertise right now. That means the first person to publish consistently in your space owns it."

WRONG: "dangerously low for a Director"
RIGHT: "There's significant room to grow — and the upside of moving early in a space with few visible voices is substantial."

Pattern: "أنت لا تعاني من X، أنت فقط لم..." (You don't suffer from X, you simply haven't yet...)

Name the reality. Frame the opportunity. Never accuse.

PRODUCT-QUESTION ROUTING: If the user's message is a question about Aura the product itself — how it works, what a page/score/tier/term/feature means, or how to do something inside Aura — do NOT use your strategic Chief-of-Staff persona for that reply. Answer in 2 to 4 short, plain sentences, then tell them they can find the full explanation in the Guide (the ? icon at the top right). For these product questions: do not cite signals, do not add a NEXT STEP, and do not pull in market or identity context. Examples: "what is Aura", "how is my score calculated", "what does the Intelligence page do", "what is a signal", "how do I publish a post". For every question about the user's market, sector, positioning, or strategy, behave exactly as you do now (full strategic mode).

When you answer a product question:

- Open with exactly: 'Aura is your personal intelligence system.'

- Then explain in plain words, like this: Aura saves the thinking you already do each week — what you read, notice, and conclude — and helps you share it, so the people who matter see how you think, not just your job title. It works quietly and does not add work to your week.

- BANNED PHRASES (never use, no paraphrase): 'strategic intelligence layer', 'digital chief of staff', 'calibration scores', 'calibrate your scores'.

- Close by pointing to the Guide (? icon, top right).

Keep it to 3–4 short plain sentences. Match the Guide's 'What is Aura?' voice — not your strategic persona.

BANNED WORDS — never use these in any response: "authority" (as a noun), "trajectory", "personal brand", "thought leader", "thought leadership", "Zone of Genius", "leverage" (as a verb), "utilize", "facilitate". Use plain words instead: for "authority" say "presence" or "standing"; for "leverage"/"utilize" say "use"; for "thought leadership" say "sharing your expertise".

${isNewUser ? `NEW USER CALIBRATION (ACTIVE — account is new or zero published posts):
- Lead with what the user has DONE right (they joined, they captured, they completed onboarding).
- Frame gaps as "not yet" not "missing".
- Replace "uncomfortable truth" with "the biggest opportunity right now".
- Do NOT compare them unfavorably to competitors or peers.
- Focus on the FIRST action, not the full gap.
- Tone: encouraging coach, not critical partner.
` : ""}
${
  mode === "advisor"
    ? 'MODE: ADVISOR — Be the Senior Partner doing a frank quarterly review. Challenge assumptions. Name what\'s not working. Always back it with data from the context above.'
    : ""
}

TOOLS — you can do two things yourself, not just describe them:
- save_draft — writes a post you have written into the member's drafts. When the member asks for a post, or accepts one you proposed, call save_draft with the full text rather than pasting the post and telling them to save it themselves.
- set_reminder — puts a reminder in the member's notifications when they want to come back to something later.
Never invent a source_signal_id. Pass one only if it identifies a signal listed in ACTIVE SIGNALS for this member — its bracketed reference (for example S-101) is accepted; otherwise leave it out.
After a tool runs, confirm in one short line. Do not restate the whole draft back to them.
The rows under WHAT THE OVERNIGHT FOUND FOR YOU are real things your own overnight agent found for this member while they were not working — you may discuss them by name, and you must never claim to have found anything that block does not contain.

GROUNDING CONTRACT — NON-NEGOTIABLE RULES FOR EVERY RESPONSE:


0. CLOSED-WORLD RULE (ABSOLUTE — overrides every other rule below):
   You can see ONLY the data in this prompt: the user's own captures, signals, posts, metrics and profile. You have NO access to the open web, no competitor data, no network data, no audience data, no calendar of external events.
   You must NEVER state, imply or speculate about what any external party has published, said, launched, hosted or announced. That includes named firms (McKinsey, PwC, Deloitte, BCG, EY, KPMG and any other), competitors, peers, "your network", "nobody has covered this", "the market is talking about", or any dated external event ("last Tuesday", "this week's webinar").
   You must NEVER recommend a posting time, a day of week, or an audience hour — no audience-timing data exists.
   You must NEVER give a countdown or expiry for a signal ("six days from being old news") — signals have no expiry field.
   If the user asks about competitors, the open web, their network, timing, or anything outside their own graph, say plainly: "I can only see your own graph — your captures, signals and posts. I can't see the open web or what anyone else has published." Then answer from what you DO have.

1. SIGNAL CITATION: Every response must reference at least one signal from ACTIVE SIGNALS by its exact title in bold, immediately followed by its bracketed reference exactly as listed, e.g. **Integration Trap** [S-101]. Use ONLY the refs listed in ACTIVE SIGNALS — never invent a ref, never cite a signal that is not listed. If no signals were loaded, say "I don't have your signals loaded — please capture something first."

2. TEMPORAL HOOK: Every strategic recommendation must include a "why now" — one sentence grounded ONLY in the user's own graph: a signal's momentum or velocity, how many captures now support it, their publishing gap, or their own recent metrics. Never reference a competitor move or an external market event.

3. CLOSING LINE:
   - If you used one of your tools in this turn, do NOT write a NEXT STEP line. Instead close with one plain line stating what you just did and the single remaining thing only the member can do. Example: "Saved to your drafts. The only thing left is your read on the opening line."
   - If no tool ran, every response must end with exactly this format:

   "NEXT STEP: [one specific action] — [named owner if relevant] — [specific deadline]"

   Example: "NEXT STEP: Draft the 2-page Integration Trap white paper — you — by Friday"

   Never assign the member work that one of your tools can do — use the tool instead.


4. CONTRARIAN OBLIGATION (for users with 3+ published posts): If the user's plan sounds conventional or safe, name the specific risk they are not seeing, using their own signals and posts as the evidence. Be direct. Never name external firms or claim what anyone else has published.
   FOR NEW USERS (0-2 published posts): Skip the contrarian voice. Focus on building confidence and momentum. The user needs to feel that publishing is SAFE before they can handle "your approach is too conventional."

5. IDENTITY: You are not ChatGPT. You are the user's Chief of Staff with access to their intelligence layer. Every response must feel like it could only come from someone who knows their specific signals, sector, and career target — not from a generic AI.`;

    const responseRules = `

RESPONSE RULES (v2 DEFINITIVE — ALWAYS APPLY):
1. You know EVERYTHING about this user from the context above. Use it. Reference specific signals by name, specific capability bands from the CAPABILITY READ block, specific captures by title.
2. When asked about strengths, name the capability and its band from the CAPABILITY READ block. Never state a capability as a number or a score out of 100. If a capability is Not yet assessed, say it has not been read yet and offer the assessment — never treat it as a weakness.
3. When reviewing content, compare against the VOICE PROFILE. Be honest about what's weak.
4. ONE recommendation, not five. Reduce decision fatigue. Never write "Here are 5 ideas" or "Consider these options."
5. End every response with a specific NEXT STEP line.
6. Cite signals by name in **bold**. Reference captures by title.
7. If you don't have data: "I don't have intelligence on that yet. Capture an article about it."

9. Never say: "As an AI", "Great question!", "Here are some suggestions", "You might want to consider", "That's a wonderful insight."
10. Think like a senior partner giving private counsel to a peer — direct, evidence-based, no fluff. Never name external firms.
11. When reviewing posts: be HONEST. Weak hook? Say so. Suggest a specific rewrite.
12. Reference account age and progress when relevant: ${topSignalTitle
      ? `"You've been on Aura for ${accountDays ?? "—"} days — your top signal '${topSignalTitle}' at ${Math.round(Number(topSignal?.confidence || 0) * 100)}% confidence formed from that work."`
      : `"You don't have strong signals yet — that's normal for the first week. Focus on capturing 3-5 articles in your sector to give Aura enough data to detect patterns."`}
    ${(publishedCount || 0) === 0 ? `When discussing publishing cadence, do NOT say "your content score is 0". Say: "you haven't published yet, which means the publishing window is wide open."` : ""}
13. When recommending content topics, frame the opportunity from the user's own evidence — how many captures support the angle, how long the signal has been live, what they have not written yet. Never claim what the network, competitors or the market has or has not covered; you cannot see them.
14. Use ONE key insight line per response when appropriate, formatted as a Markdown blockquote: > Your key insight here. Optionally one italic provocation: *Your provocation here*. Use ONLY Markdown — never HTML tags (no <span>, <blockquote>, <em>, <strong>). Use **bold** and *italic* in Markdown.`;

    const retrievalSection = `

MEMBER CONTEXT:
${memberContextBlock}

RETRIEVED SOURCES (this member's own documents, evidence, captures and signals — numbered; cite by number, name the title, and use the url when present):
${retrievedBlock}
${retrievalDegraded ? "NOTE: source retrieval failed for this turn. Do not claim the record is empty — say you could not read the record right now." : ""}`;

    // Language is decided here, once, and sits above everything else in the
    // prompt. Both gateway calls use this same string.
    const languageDirective = `REPLY LANGUAGE: ${replyLanguage}. This is decided, not a preference. Write your entire answer in ${replyLanguage}, whatever language the retrieved sources or the member's stored material happen to be in. Quote source titles in their original language, but every sentence you write yourself is in ${replyLanguage}.${
      replyLanguage === "Arabic"
        ? "\nWhen writing Arabic: one sentence per line, maximum 10–12 Arabic words per line, and keep signal names and technical terms in English."
        : ""
    }

`;

    const finalSystemPrompt = languageDirective + systemPrompt + retrievalSection + responseRules;

    // STEP 3 — tool definitions. Aura can act, not only advise. Both tools take
    // user_id from the verified JWT only; the model never supplies an identity
    // and never supplies an existing row id. Insert only — no updates, no deletes.
    const TOOLS = [
      {
        type: "function",
        function: {
          name: "save_draft",
          description:
            "Save a post you have written into this member's drafts. Use this instead of pasting the post and asking them to save it themselves.",
          parameters: {
            type: "object",
            properties: {
              post_text: { type: "string", description: "The full post text." },
              title: { type: "string", description: "Short label for the draft." },
              source_signal_id: {
                type: "string",
                description:
                  "Optional. The signal this came from — only a signal listed in ACTIVE SIGNALS (its bracketed reference, e.g. S-101, is accepted).",
              },
            },
            required: ["post_text"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "set_reminder",
          description: "Put a reminder in this member's notifications.",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string", description: "Reminder title, 80 characters or fewer." },
              body: { type: "string", description: "Optional detail." },
              days_from_now: { type: "integer", description: "1 to 30. Defaults to 3." },
            },
            required: ["title"],
          },
        },
      },
    ];

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

    type ToolResult = { tool: string; ok: boolean; label: string; payload: Record<string, unknown> };

    async function runTool(name: string, argsRaw: string): Promise<ToolResult> {
      let args: any = {};
      try {
        args = argsRaw ? JSON.parse(argsRaw) : {};
      } catch {
        return { tool: name, ok: false, label: "Couldn't save that", payload: { ok: false, error: "unreadable arguments" } };
      }

      try {
        if (name === "save_draft") {
          const post_text = typeof args.post_text === "string" ? args.post_text.trim() : "";
          if (!post_text) {
            return { tool: name, ok: false, label: "Couldn't save that", payload: { ok: false, error: "no post text" } };
          }
          const title = typeof args.title === "string" && args.title.trim() ? args.title.trim().slice(0, 200) : null;

          // Resolve the signal only against this member's own loaded signals.
          let source_signal_id: string | null = null;
          const rawSig = typeof args.source_signal_id === "string" ? args.source_signal_id.trim() : "";
          if (rawSig) {
            if (UUID_RE.test(rawSig) && sigs.some((s) => s.id === rawSig)) {
              source_signal_id = rawSig;
            } else {
              const refIdx = citations.findIndex((c) => c.ref === rawSig.replace(/[[\]]/g, ""));
              if (refIdx >= 0 && UUID_RE.test(String(citations[refIdx].id))) {
                source_signal_id = citations[refIdx].id;
              }
            }
          }

          const row: Record<string, unknown> = {
            user_id,
            post_text,
            tracking_status: "draft",
            source_type: "aura_generated",
            made_by: "aura",
            authorship: "aura_drafted",
            arrived_by: "generated_in_place",
            acquisition: "unset",
            confidence: "unknown",
            source_metadata: { origin: "ask_aura" },
          };
          if (title) row.title = title;
          if (source_signal_id) row.source_signal_id = source_signal_id;

          const { data: inserted, error: insErr } = await admin
            .from("linkedin_posts")
            .insert(row)
            .select("id")
            .single();
          if (insErr || !inserted?.id) {
            console.error("save_draft insert failed", insErr?.message);
            return { tool: name, ok: false, label: "Couldn't save that", payload: { ok: false, error: "could not save the draft" } };
          }

          const { error: evErr } = await admin.from("post_events").insert({
            post_id: inserted.id,
            user_id,
            event: "drafted",
            actor: "aura",
            details: { origin: "ask_aura" },
          });
          if (evErr) console.error("save_draft event failed", evErr.message);

          return {
            tool: name,
            ok: true,
            label: "Draft saved",
            payload: { ok: true, post_id: inserted.id, title },
          };
        }

        if (name === "set_reminder") {
          const title = typeof args.title === "string" ? args.title.trim().slice(0, 80) : "";
          if (!title) {
            return { tool: name, ok: false, label: "Couldn't save that", payload: { ok: false, error: "no title" } };
          }
          const bodyText = typeof args.body === "string" && args.body.trim() ? args.body.trim() : null;
          let days = Number.isFinite(Number(args.days_from_now)) ? Math.round(Number(args.days_from_now)) : 3;
          if (days < 1) days = 1;
          if (days > 30) days = 30;
          const when = new Date(Date.now() + days * 86400000);

          const { error: nErr } = await admin.from("notification_events").insert({
            user_id,
            type: "member_reminder",
            channel: "inapp",
            title,
            body: bodyText,
            read: false,
            sent_at: when.toISOString(),
          });
          if (nErr) {
            console.error("set_reminder insert failed", nErr.message);
            return { tool: name, ok: false, label: "Couldn't save that", payload: { ok: false, error: "could not set the reminder" } };
          }
          const remind_on = when.toISOString().slice(0, 10);
          return {
            tool: name,
            ok: true,
            label: `Reminder set for ${when.getUTCDate()} ${MONTHS[when.getUTCMonth()]}`,
            payload: { ok: true, remind_on },
          };
        }

        return { tool: name, ok: false, label: "Couldn't save that", payload: { ok: false, error: "unknown tool" } };
      } catch (e) {
        console.error("tool threw", name, e);
        return { tool: name, ok: false, label: "Couldn't save that", payload: { ok: false, error: "unexpected failure" } };
      }
    }

    // STEP 3b — call AI (streaming so the existing sidebar SSE consumer works unchanged)
    const baseBody = {
      model: "google/gemini-3-flash-preview",
      max_tokens: 1000,
      temperature: 0.7,
      stream: true,
    };
    const firstMessages: any[] = [{ role: "system", content: finalSystemPrompt }, ...messages];

    const callGateway = (msgs: any[], withTools: boolean) =>
      fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          withTools
            ? { ...baseBody, messages: msgs, tools: TOOLS, tool_choice: "auto" }
            : { ...baseBody, messages: msgs },
        ),
      });

    let aiRes = await callGateway(firstMessages, true);
    // If the gateway rejects the tools payload, fall back to a plain toolless call
    // so the member still gets an answer.
    if (!aiRes.ok && aiRes.status !== 429 && aiRes.status !== 402) {
      console.error("gateway rejected tools payload", aiRes.status, await aiRes.text().catch(() => ""));
      aiRes = await callGateway(firstMessages, false);
    }

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

    // The upstream is parsed, never forwarded verbatim: raw tool-call frames must
    // not reach the client. Only content deltas are re-emitted, in the exact
    // shape the existing consumer already parses.
    const firstBody = aiRes.body;
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    type PumpOut = { text: string; toolCalls: { id: string; name: string; args: string }[] };

    const stream = new ReadableStream({
      async start(controller) {
        let fullReply = "";
        const actions: ToolResult[] = [];

        const pump = async (body: ReadableStream<Uint8Array>, collectTools: boolean): Promise<PumpOut> => {
          const reader = body.getReader();
          let buffer = "";
          let text = "";
          const acc: Record<number, { id: string; name: string; args: string }> = {};
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let idx: number;
            while ((idx = buffer.indexOf("\n")) !== -1) {
              let line = buffer.slice(0, idx);
              buffer = buffer.slice(idx + 1);
              if (line.endsWith("\r")) line = line.slice(0, -1);
              if (!line.startsWith("data:")) continue;
              const jsonStr = line.slice(5).trim();
              if (!jsonStr || jsonStr === "[DONE]") continue;
              let parsed: any;
              try {
                parsed = JSON.parse(jsonStr);
              } catch {
                continue;
              }
              const delta = parsed?.choices?.[0]?.delta;
              const c = delta?.content;
              if (typeof c === "string" && c) {
                text += c;
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`),
                );
              }
              if (collectTools && Array.isArray(delta?.tool_calls)) {
                for (const tc of delta.tool_calls) {
                  const i = Number.isFinite(tc?.index) ? Number(tc.index) : 0;
                  if (!acc[i]) acc[i] = { id: "", name: "", args: "" };
                  if (typeof tc?.id === "string" && tc.id) acc[i].id = tc.id;
                  if (typeof tc?.function?.name === "string" && tc.function.name) acc[i].name = tc.function.name;
                  if (typeof tc?.function?.arguments === "string") acc[i].args += tc.function.arguments;
                }
              }
            }
          }
          const toolCalls = Object.keys(acc)
            .map((k) => Number(k))
            .sort((a, b) => a - b)
            .map((k) => acc[k])
            .filter((t) => t.name);
          return { text, toolCalls };
        };

        try {
          const first = await pump(firstBody, true);
          fullReply = first.text;

          if (first.toolCalls.length > 0) {
            // Exactly one round of tool execution per request: the second call
            // carries no tools, so the model cannot loop.
            for (const call of first.toolCalls) {
              actions.push(await runTool(call.name, call.args));
            }

            const assistantTurn = {
              role: "assistant",
              content: first.text || null,
              tool_calls: first.toolCalls.map((t, i) => ({
                id: t.id || `call_${i}`,
                type: "function",
                function: { name: t.name, arguments: t.args || "{}" },
              })),
            };
            const toolTurns = first.toolCalls.map((t, i) => ({
              role: "tool",
              tool_call_id: t.id || `call_${i}`,
              content: JSON.stringify(actions[i]?.payload ?? { ok: false, error: "no result" }),
            }));

            const second = await callGateway([...firstMessages, assistantTurn, ...toolTurns], false);
            if (second.ok && second.body) {
              const out = await pump(second.body, false);
              // The summariser must see the answer the member actually read.
              fullReply = out.text || first.text;
            } else {
              console.error("second gateway call failed", second.status);
            }
          }

          // One machine line per tool that ran, before the existing events.
          for (const a of actions) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  choices: [{ delta: {} }],
                  action: { tool: a.tool, ok: a.ok, label: a.label },
                })}\n\n`,
              ),
            );
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
            citations,
            sources,
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(contextEvent)}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (e) {
          console.error("stream tee error:", e);
        } finally {
          controller.close();
        }


        // STEP 4 — persistent side effect: summarize the session into memory.
        // Wrapped in EdgeRuntime.waitUntil so it survives stream close — Supabase
        // tears down the isolate once the response stream ends, which is why these
        // writes were previously dropped. Runs for every response that has content;
        // the row is keyed by (user_id, session_date) so repeated turns in a day
        // update one row rather than piling up.
        const reply = fullReply.trim();
        if (reply) {
          // @ts-ignore
          EdgeRuntime.waitUntil((async () => {
            try {
              const summaryRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${LOVABLE_API_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  model: "google/gemini-3-flash-preview",
                  max_tokens: 400,
                  temperature: 0.3,
                  messages: [
                    {
                      role: "system",
                      content:
                        'Return STRICT JSON only. No prose, no markdown fence. Exactly these keys: {"summary": "2 plain sentences summarising this advisory conversation", "key_decisions": ["short strings"], "topics_discussed": ["short strings"], "actions_committed": ["short strings — anything the member said they would do"]}. Arrays may be empty.',
                    },
                    ...messages,
                    { role: "assistant", content: reply },
                  ],
                }),
              });
              if (!summaryRes.ok) {
                console.error("memory summary: model call failed", summaryRes.status);
                return;
              }
              const sj = await summaryRes.json();
              const raw: string = sj?.choices?.[0]?.message?.content?.trim() || "";
              const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
              let parsed: any = null;
              try {
                parsed = JSON.parse(cleaned);
              } catch {
                const start = cleaned.indexOf("{");
                const end = cleaned.lastIndexOf("}");
                if (start >= 0 && end > start) {
                  try {
                    parsed = JSON.parse(cleaned.slice(start, end + 1));
                  } catch { /* ignore */ }
                }
              }
              if (!parsed || typeof parsed !== "object") {
                console.error("memory summary: unparseable model output, nothing written");
                return;
              }
              const summary: string = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
              if (summary.length < 12) {
                console.error("memory summary: summary missing or too short, nothing written");
                return;
              }
              const toList = (v: unknown): string[] =>
                Array.isArray(v)
                  ? v.filter((x) => typeof x === "string" && x.trim().length > 0)
                      .map((x) => (x as string).trim())
                      .slice(0, 5)
                  : [];
              const key_decisions = toList(parsed.key_decisions);
              const topics_discussed = toList(parsed.topics_discussed);
              const actions_committed = toList(parsed.actions_committed);

              const today = new Date().toISOString().slice(0, 10);
              let existingId: string | null = null;
              if (session_id) {
                const { data: existing } = await admin
                  .from("aura_conversation_memory")
                  .select("id")
                  .eq("user_id", user_id)
                  .eq("session_id", session_id)
                  .is("role", null)
                  .maybeSingle();
                existingId = existing?.id ?? null;
              } else {
                const { data: existingRows } = await admin
                  .from("aura_conversation_memory")
                  .select("id")
                  .eq("user_id", user_id)
                  .eq("session_date", today)
                  .is("role", null)
                  .order("created_at", { ascending: false })
                  .limit(1);
                existingId = existingRows?.[0]?.id ?? null;
              }

              if (existingId) {
                await admin
                  .from("aura_conversation_memory")
                  .update({
                    summary,
                    key_decisions,
                    topics_discussed,
                    actions_committed,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", existingId);
              } else {
                await admin.from("aura_conversation_memory").insert({
                  user_id,
                  session_id,
                  session_date: today,
                  summary,
                  key_decisions,
                  topics_discussed,
                  actions_committed,
                });
              }
            } catch (e) {
              console.error("memory upsert failed:", e);
            }

          })());
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
}));