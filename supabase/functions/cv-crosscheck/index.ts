import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { withObserve, logEfError } from "../_shared/observe.ts";
import { logAIUsage } from "../_shared/logAIUsage.ts";
import { isAdmin } from "../_shared/adminRole.ts";
import { findUserIdByEmail } from "../_shared/findUserByEmail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SYSTEM_PROMPT = `You are a senior career and profile reviewer for GCC executives. You do not merely list differences between documents — you judge what they mean and what the person should do. You use only what the supplied material shows and never invent an achievement, number, date or employer.

OWNERSHIP RULE — this matters more than any other. When a figure describes organisational, portfolio or firm-level scale, do not treat it as the person's personal result unless the material shows they owned it. Put every such claim in \`defensibility\` with the qualifier they should add before using it publicly. Never place an unqualified firm-level figure in headline_suggestion. A claim a reader would challenge in a meeting is worse than no claim.

RANKING — at most three entries in \`findings\`, ordered by how much the gap actually costs this person. Omit trivia: a course certificate is not a finding. Every finding's \`do_this\` begins with a verb and names where it goes (headline, About section, a post, the CV itself). \`weight\` is 'high' or 'medium' only.

READING THE SHAPE — in \`reading_the_shape\`, name what a recruiter or board member will notice first about the career's shape: a short tenure, a gap, a title that moved sideways, work concentrated long ago. One sentence, or null if nothing stands out. Say it plainly and without alarm.

VOICE — in \`profile_vs_voice\`, compare what they actually write publicly (their posts) and what others say about them (recommendations) against what the CV claims. Name the disagreement where there is one; that gap is often the most useful line in the review. Null if there are no posts and no recommendations.

BEHIND — \`cv_is_behind\` lists where the CV is out of date, written as to-dos, not as contradictions. An out-of-date CV is a task, never an inconsistency.

HEADLINE — \`headline_suggestion\` is under 200 characters, at most three segments, and leads with what is distinctive about this person rather than a category label. Do not stack keywords. Do not open with a phrase that would fit half the senior professionals in this market.

LANGUAGE — plain English, short sentences, as a trusted advisor would speak over coffee. Gloss every acronym in four words or fewer on first use. No markdown, no asterisks, no headers, no bracketed placeholders. Never use: authority, trajectory, personal brand, thought leader, leverage as a verb, delve, landscape, navigate, realm, synergy, utilize, robust, seamless, journey, unlock, empower, elevate.`;

function parseJsonLoose(raw: string): any | null {
  if (!raw) return null;
  let t = raw.trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start > 0 || end < t.length - 1) {
    if (start === -1 || end === -1 || end <= start) return null;
    t = t.slice(start, end + 1);
  }
  try {
    const v = JSON.parse(t);
    return v && typeof v === "object" ? v : null;
  } catch (_e) {
    return null;
  }
}

serve(withObserve("cv-crosscheck", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // --- auth: signed-in member acting on themselves, or an admin on anyone ----
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data: userData, error: userErr } = await anon.auth.getUser(authHeader.replace("Bearer ", ""));
  if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

  const callerId = userData.user.id;
  const callerIsAdmin = await isAdmin(admin, callerId);

  const body = await req.json().catch(() => ({}));
  const email: string | undefined = typeof body?.email === "string" ? body.email.trim() : undefined;
  let targetId: string | undefined = typeof body?.user_id === "string" ? body.user_id.trim() : undefined;

  if (!targetId && email) {
    if (!callerIsAdmin) return json({ error: "Forbidden" }, 403);
    targetId = (await findUserIdByEmail(admin, email)) ?? undefined;
    if (!targetId) return json({ error: `No account found for ${email.trim()}` }, 404);
  }
  if (!targetId) targetId = callerId;
  if (targetId !== callerId && !callerIsAdmin) return json({ error: "Forbidden" }, 403);

  // --- evidence ------------------------------------------------------------
  const { data: cvs, error: cvErr } = await admin
    .from("documents")
    .select("id, filename, display_title, summary, cv_label, created_at")
    .eq("user_id", targetId)
    .eq("document_type", "cv")
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(3);
  if (cvErr) return json({ error: cvErr.message }, 500);

  if (!cvs?.length) return json({ ok: false, pending: true, reason: "no_cv" });

  const { data: snapRows } = await admin
    .from("linkedin_profile_snapshots")
    .select("headline, about, experience, education, skills, certifications, raw")
    .eq("user_id", targetId)
    .order("created_at", { ascending: false })
    .limit(1);
  const snap: any = snapRows?.[0] ?? null;
  if (!snap) return json({ ok: false, pending: true, reason: "no_snapshot" });

  const { data: chunks } = await admin
    .from("document_chunks")
    .select("document_id, content, chunk_index")
    .in("document_id", cvs.map((d: any) => d.id))
    .order("chunk_index", { ascending: true })
    .limit(40);

  const byDoc = new Map<string, string[]>();
  for (const c of chunks ?? []) {
    const arr = byDoc.get((c as any).document_id) ?? [];
    arr.push(String((c as any).content ?? ""));
    byDoc.set((c as any).document_id, arr);
  }

  let cvText = cvs.map((d: any) => {
    const label = d.cv_label ? ` [${d.cv_label} CV]` : "";
    const title = d.display_title || d.filename || "CV";
    const summary = d.summary ? `Summary: ${String(d.summary)}` : "";
    const text = (byDoc.get(d.id) ?? []).join("\n");
    return `--- ${title}${label} (uploaded ${String(d.created_at).slice(0, 10)})\n${summary}\n${text}`;
  }).join("\n\n");
  cvText = cvText.slice(0, 12000);

  const cut = (v: unknown, n: number) => JSON.stringify(v ?? []).slice(0, n);
  const profileText = `Headline: ${snap.headline ?? "Not on file"}
About: ${typeof snap.about === "string" ? snap.about.slice(0, 2000) : "Not on file"}
Experience: ${cut(snap.experience, 5000)}
Education: ${cut(snap.education, 1200)}
Skills: ${cut(snap.skills, 1200)}
Certifications: ${cut(snap.certifications, 1200)}`;

  // --- extra evidence: fragments, posts, recommendations --------------------
  const { data: fragments } = await admin
    .from("evidence_fragments")
    .select("title, content, confidence")
    .eq("user_id", targetId)
    .order("confidence", { ascending: false })
    .limit(12);

  const { data: posts } = await admin
    .from("linkedin_posts")
    .select("post_text, like_count, published_at")
    .eq("user_id", targetId)
    .not("post_text", "is", null)
    .order("like_count", { ascending: false, nullsFirst: false })
    .limit(15);

  const fragmentsText = (fragments ?? []).length
    ? (fragments ?? []).map((f: any) =>
        `· ${f.title ?? "Untitled"} (confidence ${f.confidence ?? "unknown"}): ${String(f.content ?? "").slice(0, 600)}`
      ).join("\n")
    : "None on file.";

  const usablePosts = (posts ?? []).filter((p: any) => String(p.post_text ?? "").trim().length > 0);
  const postsText = usablePosts.length
    ? usablePosts.map((p: any) =>
        `· (${String(p.published_at ?? "").slice(0, 10) || "undated"}, ${p.like_count ?? 0} likes) ${String(p.post_text).slice(0, 600)}`
      ).join("\n")
    : "None on file.";

  const rawRecs = Array.isArray(snap.raw?.receivedRecommendations) ? snap.raw.receivedRecommendations : [];
  const recsText = rawRecs.length
    ? rawRecs.slice(0, 12).map((r: any) =>
        `· From ${String(r?.givenBy ?? "unknown")}: ${String(r?.description ?? "").slice(0, 500)}`
      ).join("\n")
    : "None on file.";

  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);

  const userPrompt = `THEIR CV MATERIAL (${cvs.length} document${cvs.length === 1 ? "" : "s"})
${cvText}

THEIR PUBLIC LINKEDIN PROFILE
${profileText}

THEIR CAPTURED EVIDENCE
${fragmentsText}

WHAT THEY POST PUBLICLY
${postsText}

WHAT OTHERS SAY ABOUT THEM (LINKEDIN RECOMMENDATIONS)
${recsText}

Judge this material. Return exactly this JSON object and nothing else:
{
  "headline_finding": "one sentence: the single most valuable thing this comparison found, and what to do about it",
  "findings": [ { "what": "", "why_it_matters": "", "do_this": "", "weight": "high" } ],
  "defensibility": [ "" ],
  "cv_is_behind": [ "" ],
  "reading_the_shape": "",
  "profile_vs_voice": "",
  "headline_suggestion": ""
}`;

  const callAnthropic = (prompt: string) => fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 3000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const runOnce = async (prompt: string) => {
    const resp = await callAnthropic(prompt);
    const rawBody = await resp.text();
    if (!resp.ok) {
      await logEfError(admin, {
        function_name: "cv-crosscheck",
        error: `Anthropic HTTP ${resp.status}: ${rawBody.slice(0, 800)}`,
        severity: "high",
        user_id: targetId,
        context: { anthropic_status: resp.status },
      });
      return { data: null as any, text: "" };
    }
    const data = JSON.parse(rawBody);
    const text = (data.content || []).map((c: any) => c.text || "").join("") || "";
    try {
      EdgeRuntime.waitUntil(logAIUsage({
        user_id: targetId,
        function_name: "cv-crosscheck",
        provider: "anthropic",
        model: data.model,
        input_tokens: data.usage?.input_tokens,
        output_tokens: data.usage?.output_tokens,
      }));
    } catch (_) { /* non-blocking */ }
    return { data, text };
  };

  /** Placeholders are only meaningful inside the model's own sentences. */
  function hasPlaceholderInValues(v: unknown): boolean {
    const re = /\[[^\]]{2,40}\]/;
    if (typeof v === "string") return re.test(v);
    if (Array.isArray(v)) return v.some(hasPlaceholderInValues);
    if (v && typeof v === "object") return Object.values(v as Record<string, unknown>).some(hasPlaceholderInValues);
    return false;
  }

  let { data, text } = await runOnce(userPrompt);
  let parsed = parseJsonLoose(text);

  if (!parsed || hasPlaceholderInValues(parsed)) {
    const correction = `${userPrompt}

CORRECTION — your previous attempt was not a single valid JSON object, or contained a bracketed placeholder. Output the JSON object only, with real values drawn from the material above. No code fences, no commentary, no square-bracket placeholders.`;
    const retry = await runOnce(correction);
    if (retry.data) { data = retry.data; text = retry.text; }
    parsed = parseJsonLoose(retry.text);
    if (!parsed || hasPlaceholderInValues(parsed)) {
      await logEfError(admin, {
        function_name: "cv-crosscheck",
        error: "Unparseable crosscheck after retry — nothing saved",
        severity: "high",
        user_id: targetId,
        context: { path: "unparseable" },
      });
      return json({ ok: false, pending: true, reason: "unparseable" });
    }
  }


  const crosscheck = { ...parsed, cv_count: cvs.length, model: data?.model ?? null };

  const { error: writeErr } = await admin
    .from("diagnostic_profiles")
    .update({ cv_crosscheck: crosscheck, cv_crosscheck_at: new Date().toISOString() })
    .eq("user_id", targetId);
  if (writeErr) return json({ error: writeErr.message }, 500);

  return json({ ok: true, cv_count: cvs.length, crosscheck });
}));