import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { withObserve, logEfError } from "../_shared/observe.ts";
import { logAIUsage } from "../_shared/logAIUsage.ts";
import { isAdmin } from "../_shared/adminRole.ts";
import { findUserIdByEmail } from "../_shared/findUserByEmail.ts";
import { hasBanned, loadBannedWords } from "../_shared/bannedWords.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SYSTEM_PROMPT = `You are an executive search partner at a firm like Egon Zehnder or Spencer Stuart. You have read this person's CV, their public profile, their posts and their recommendations, and you have fifteen minutes to tell them the truth before a board interview. You are not a CV coach. You do not give general advice. You say what a specific reader will think, what it will cost them, and what to do about it.

SIX BEHAVIOURS — these are rules, not preferences.
1. Know what the document is FOR before you judge it. Judge every finding against the stated purpose of the read.
2. Predict the challenge, do not describe the flaw. Say what the reader will ask in the room.
3. Rank ruthlessly. At most three findings. A course certificate is not a finding.
4. Write the replacement line yourself. Never tell them to rewrite something without writing it.
5. Compare against the market, not against nothing. A gap only matters relative to what peers at this level show.
6. Say one uncomfortable thing. \`the_hard_truth\` is the sentence no friend or colleague would tell them.

ARITHMETIC — never assert a span of years you have not computed from the two dates you cite. If you cannot cite both dates, do not state the span. Your arithmetic is checked after you answer, and a wrong span deletes the whole finding.

OWNERSHIP RULE — when a figure describes organisational, portfolio or firm-level scale, do not treat it as the person's personal result unless the material shows they owned it. Put every such claim in \`defensibility\` with the qualifier they should add before using it publicly. Never place an unqualified firm-level figure in headline_suggestion.

THE EVIDENCE LADDER — every \`defensibility\` entry must resolve to exactly one of three rungs and must say which: "Defensible now" (cite the captured fragment that proves it), "Defensible with one more detail" (name the single detail needed), or "Not defensible" (give the softened line, written out). Attacking a claim is free; telling someone how to keep it is the work.

READING THE SHAPE — in \`reading_the_shape\`, name what a board member will notice first about the career's shape. One sentence, or null if nothing stands out.

VOICE — in \`profile_vs_voice\`, compare what they write publicly and what others say about them against what the CV claims. Name the disagreement. Null if there are no posts and no recommendations.

BEHIND — \`cv_is_behind\` lists where the CV is out of date, written as to-dos, never as contradictions.

HEADLINE — \`headline_suggestion\` is under 200 characters, at most three segments, and leads with what is distinctive about this person rather than a category label.

AURA CAN — \`aura_can\` is a CLOSED LIST. You may only return one of: capture_evidence, draft_post, suggest_headline, track_signal, or null. Never write your own offer of help. Never promise a capability in prose.

FILTERS you must apply to yourself before answering:
· would_be_false_for_someone_else — every finding must be untrue of a different senior professional in this market. Discard any finding that survives that test.
· Never use these phrases: quantify your achievements, action verbs, tailor your CV, ATS, highlight your strengths, showcase.
· Never invent a figure in \`what_you_lose\` — a consequence stated to a named reader, never a statistic.
· \`peer_comparison\` is null unless the peer data supplied below is explicitly described as sufficient.

LANGUAGE — plain English, short sentences, as a trusted advisor would speak. Gloss every acronym in four words or fewer on first use. No markdown, no asterisks, no headers, no bracketed placeholders. Never use: authority, trajectory, personal brand, thought leader, thought leadership, leverage as a verb, delve, landscape, navigate, realm, synergy, utilize, robust, seamless, journey, unlock, empower, elevate.`;

const PURPOSES = ["next_role", "board_seat", "partner_track", "client_credibility", "unknown"] as const;

const PURPOSE_BRIEF: Record<string, string> = {
  next_role: "The read is for a NEXT ROLE. The reader is a hiring executive or search partner filling a line role. They want recent scope, ownership and a reason this person leaves well.",
  board_seat: "The read is for a BOARD SEAT. The reader is a nomination committee. They want governance exposure, proximity to profit and loss, independence, and evidence of judgement under scrutiny.",
  partner_track: "The read is for PARTNER TRACK. The reader is a partnership committee. They want delivery scale, client ownership, revenue they personally hold, and people they have grown.",
  client_credibility: "The read is for CLIENT CREDIBILITY. The reader is a prospective client. They want proof this person has solved their exact problem before, in their sector.",
  unknown: "The purpose is UNKNOWN. Produce an exploratory read: name the two most likely purposes this material points at, say plainly how the advice would differ between them, and judge the findings against the more likely of the two. Do not hedge silently between audiences.",
};

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

  const body = await req.json().catch(() => ({}));

  /* TRANSIENT MODE — an anonymous visitor's CV is read in memory and thrown
     away. No storage object, no `documents` row, no `document_chunks` row,
     no write to `diagnostic_profiles`. The result is returned to the browser
     and held on the anonymous session by the caller. */
  const anonToken: string = typeof body?.anon_token === "string" ? body.anon_token.trim() : "";
  /* `cvText` is the documented parameter name; `cv_text` is accepted as an
     alias so either spelling works. When present the `documents` lookup is
     skipped entirely and nothing about this CV is ever written down. */
  let inlineCvText: string =
    typeof body?.cvText === "string" ? body.cvText.trim()
    : typeof body?.cv_text === "string" ? body.cv_text.trim()
    : "";
  const cvFile: { mime?: string; name?: string; base64?: string } | null =
    body?.cv_file && typeof body.cv_file === "object" ? body.cv_file : null;

  /** Extract text from the uploaded bytes without ever persisting them. */
  async function extractInMemory(file: { mime?: string; name?: string; base64?: string }): Promise<string> {
    const b64 = String(file.base64 ?? "");
    if (!b64) return "";
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const mime = String(file.mime ?? "").toLowerCase();
    const name = String(file.name ?? "").toLowerCase();
    const isDocx = mime.includes("word") || mime.includes("officedocument") || name.endsWith(".docx") || name.endsWith(".doc");
    if (isDocx) {
      /* DOCX is a zip: unpack in memory and read the paragraph text out of
         word/document.xml. No temp file, no library that wants a filesystem. */
      // @ts-ignore dynamic esm import
      const { unzipSync, strFromU8 } = await import("https://esm.sh/fflate@0.8.2");
      const files: Record<string, Uint8Array> = unzipSync(bytes);
      const parts = Object.keys(files).filter((k) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(k));
      let out = "";
      for (const p of parts) {
        const xml = strFromU8(files[p]);
        out += xml
          .replace(/<\/w:p>/g, "\n")
          .replace(/<w:tab[^>]*\/>/g, "\t")
          .replace(/<[^>]+>/g, "")
          .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
        out += "\n";
      }
      return out;
    }
    // @ts-ignore dynamic esm import
    const { extractText, getDocumentProxy } = await import("https://esm.sh/unpdf@0.12.1");
    const pdf: any = await getDocumentProxy(bytes);
    const all: any = await extractText(pdf, { mergePages: true });
    return Array.isArray(all?.text) ? all.text.join("\n") : String(all?.text ?? "");
  }

  let anonState: any = null;
  let callerId = "";
  let callerIsAdmin = false;

  if (anonToken) {
    const { data: sess } = await admin
      .from("assessment_sessions")
      .select("state, expires_at")
      .eq("token", anonToken)
      .maybeSingle();
    if (!sess) return json({ error: "Unauthorized" }, 401);
    anonState = (sess as any).state ?? {};
  } else {
    // --- auth: signed-in member acting on themselves, or an admin on anyone ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: userData, error: userErr } = await anon.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

    callerId = userData.user.id;
    callerIsAdmin = await isAdmin(admin, callerId);
  }

  const email: string | undefined = typeof body?.email === "string" ? body.email.trim() : undefined;
  let targetId: string | undefined = typeof body?.user_id === "string" ? body.user_id.trim() : undefined;
  const rawPurpose = typeof body?.purpose === "string" ? body.purpose.trim() : "";
  const purpose = (PURPOSES as readonly string[]).includes(rawPurpose) ? rawPurpose : "unknown";

  if (anonToken) {
    targetId = undefined;
    if (!inlineCvText && cvFile) {
      try { inlineCvText = (await extractInMemory(cvFile)).trim(); }
      catch (e) {
        console.error("[cv-crosscheck] transient extraction failed", String((e as Error)?.message ?? e));
        return json({ ok: false, pending: true, reason: "unparseable" });
      }
    }
    if (inlineCvText.length < 200) return json({ ok: false, pending: true, reason: "no_cv" });
  } else if (!targetId && email) {
    if (!callerIsAdmin) return json({ error: "Forbidden" }, 403);
    targetId = (await findUserIdByEmail(admin, email)) ?? undefined;
    if (!targetId) return json({ error: `No account found for ${email.trim()}` }, 404);
  }
  if (!anonToken) {
    if (!targetId) targetId = callerId;
    if (targetId !== callerId && !callerIsAdmin) return json({ error: "Forbidden" }, 403);
  }
  const transient = !targetId;
  /* Inline text wins over anything on file: the documents lookup is skipped. */
  const inlineMode = transient || inlineCvText.length >= 200;

  // --- evidence ------------------------------------------------------------
  const { data: storedCvs, error: cvErr } = inlineMode
    ? { data: [] as any[], error: null }
    : await admin
    .from("documents")
    .select("id, filename, display_title, summary, cv_label, created_at")
    .eq("user_id", targetId!)
    .eq("document_type", "cv")
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(3);
  if (cvErr) return json({ error: cvErr.message }, 500);
  const cvs = storedCvs ?? [];

  if (!inlineMode && !cvs.length) return json({ ok: false, pending: true, reason: "no_cv" });

  const { data: snapRows } = transient
    ? { data: [] as any[] }
    : await admin
      .from("linkedin_profile_snapshots")
      .select("headline, about, experience, education, skills, certifications, raw")
      .eq("user_id", targetId!)
      .order("created_at", { ascending: false })
      .limit(1);
  const snap: any = snapRows?.[0] ?? null;
  if (!transient && !snap) return json({ ok: false, pending: true, reason: "no_snapshot" });

  const { data: chunks } = inlineMode
    ? { data: [] as any[] }
    : await admin
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

  let cvText = inlineMode ? inlineCvText : cvs.map((d: any) => {
    const label = d.cv_label ? ` [${d.cv_label} CV]` : "";
    const title = d.display_title || d.filename || "CV";
    const summary = d.summary ? `Summary: ${String(d.summary)}` : "";
    const text = (byDoc.get(d.id) ?? []).join("\n");
    return `--- ${title}${label} (uploaded ${String(d.created_at).slice(0, 10)})\n${summary}\n${text}`;
  }).join("\n\n");
  cvText = cvText.slice(0, 12000);

  const cut = (v: unknown, n: number) => JSON.stringify(v ?? []).slice(0, n);
  const anonRead = anonState ? (anonState.read ?? null) : null;
  const profileText = transient
    ? `Headline: ${anonState?.headline ?? "Not on file"}
Public profile: ${anonState?.profile_url ?? "Not on file"}
Name: ${anonState?.name ?? "Not on file"}
What Aura already read from their public profile: ${anonRead ? JSON.stringify(anonRead).slice(0, 6000) : "Not on file"}`
    : `Headline: ${snap.headline ?? "Not on file"}
About: ${typeof snap.about === "string" ? snap.about.slice(0, 2000) : "Not on file"}
Experience: ${cut(snap.experience, 5000)}
Education: ${cut(snap.education, 1200)}
Skills: ${cut(snap.skills, 1200)}
Certifications: ${cut(snap.certifications, 1200)}`;
  if (transient && !anonRead && !anonState?.headline) {
    return json({ ok: false, pending: true, reason: "no_snapshot" });
  }

  // --- extra evidence: fragments, posts, recommendations --------------------
  const { data: fragments } = transient
    ? { data: [] as any[] }
    : await admin
    .from("evidence_fragments")
    .select("title, content, confidence")
    .eq("user_id", targetId!)
    .order("confidence", { ascending: false })
    .limit(24);

  const { data: posts } = transient
    ? { data: [] as any[] }
    : await admin
    .from("linkedin_posts")
    .select("post_text, like_count, published_at")
    .eq("user_id", targetId!)
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

  const rawRecs = Array.isArray(snap?.raw?.receivedRecommendations) ? snap.raw.receivedRecommendations : [];
  const recsText = rawRecs.length
    ? rawRecs.slice(0, 12).map((r: any) =>
        `· From ${String(r?.givenBy ?? "unknown")}: ${String(r?.description ?? "").slice(0, 500)}`
      ).join("\n")
    : "None on file.";

  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);

  /* Peer data is only offered to the model when there is enough of it to say
     something true. Thin data means the model is told to return null — it is
     never left to guess whether a comparison is safe. */
  let peerCount = 0;
  try {
    const { count } = await admin
      .from("mirror_reads")
      .select("id", { count: "exact", head: true });
    peerCount = count ?? 0;
  } catch (_) { peerCount = 0; }
  const PEER_FLOOR = 8;
  const peerText = peerCount >= PEER_FLOOR
    ? `There are ${peerCount} comparable reads on file for this market. You may make a peer comparison ONLY where the material above supports it; otherwise still return null.`
    : `PEER DATA IS THIN (${peerCount} reads on file). Return null for peer_comparison. Do not fabricate a comparison.`;

  const docCount = inlineMode ? 1 : cvs.length;
  const userPrompt = `THEIR CV MATERIAL (${docCount} document${docCount === 1 ? "" : "s"})
${cvText}

THEIR PUBLIC LINKEDIN PROFILE
${profileText}

WHAT THIS PERSON CAN ALREADY PROVE (captured evidence — use these as ammunition)
${fragmentsText}

WHAT THEY POST PUBLICLY
${postsText}

WHAT OTHERS SAY ABOUT THEM (LINKEDIN RECOMMENDATIONS)
${recsText}

WHAT IS MISSING (the same captured evidence, read the other way — what it does NOT cover, and where the CV or profile claims something no fragment supports)
${fragmentsText}

WHAT THIS READ IS FOR
${PURPOSE_BRIEF[purpose]}

PEER DATA
${peerText}

Judge this material against that purpose and record the review with the record_crosscheck tool.
Rules you will be checked on after you answer: exactly one finding has do_first true and that finding states the cost of delay; every high-weight finding carries a ready-to-paste \`rewrite\`; every finding cites \`evidence.cv_line\` and \`evidence.profile_line\` (write "Absent" for the side that has nothing); every \`what_you_lose\` names a reader and a consequence, never a number you invented; \`aura_can\` is from the closed list or null; every span of years is computed from the two dates you cite.`;

  /* Structured output: one forced tool. The prompt wording is unchanged —
     only the transport moved off free-text JSON, which discarded four runs
     in five. `reading_the_shape` and `headline_suggestion` stay in the schema
     because the prompt asks for them and the admin panel reads them; only the
     five member-facing fields are required. */
  const CROSSCHECK_TOOL = {
    name: "record_crosscheck",
    description: "Record the CV-against-profile review.",
    input_schema: {
      type: "object",
      properties: {
        headline_finding: { type: "string" },
        findings: {
          type: "array",
          items: {
            type: "object",
            properties: {
              what: { type: "string" },
              why_it_matters: { type: "string" },
              do_this: { type: "string" },
              weight: { type: "string", enum: ["high", "medium"] },
              what_you_lose: { type: "string" },
              evidence: {
                type: "object",
                properties: {
                  cv_line: { type: "string" },
                  profile_line: { type: "string" },
                },
                required: ["cv_line", "profile_line"],
              },
              rewrite: { type: "string", description: "Required when weight is high: the actual replacement sentence, ready to paste." },
              aura_can: { type: "string", enum: ["capture_evidence", "draft_post", "suggest_headline", "track_signal"], description: "Closed list. Omit the field entirely when nothing Aura does helps here." },
              do_first: { type: "boolean" },
            },
            required: ["what", "why_it_matters", "do_this", "weight", "what_you_lose", "evidence", "do_first"],
          },
        },
        defensibility: { type: "array", items: { type: "string" } },
        cv_is_behind: { type: "array", items: { type: "string" } },
        profile_vs_voice: { type: "string" },
        reading_the_shape: { type: "string" },
        headline_suggestion: { type: "string" },
        the_hard_truth: { type: "string" },
        recommendations: {
          type: "array",
          minItems: 3,
          maxItems: 5,
          items: {
            type: "object",
            properties: {
              action: { type: "string" },
              why_now: { type: "string" },
              aura_can: { type: "string", enum: ["capture_evidence", "draft_post", "suggest_headline", "track_signal"], description: "Closed list. Omit the field entirely when nothing Aura does helps here." },
            },
            required: ["action", "why_now"],
          },
        },
        peer_comparison: { type: "string", description: "Omit entirely when the peer data is thin. Never fabricate." },
      },
      required: ["headline_finding", "findings", "defensibility", "cv_is_behind", "profile_vs_voice", "the_hard_truth", "recommendations"],
    },
  } as const;

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
      tools: [CROSSCHECK_TOOL],
      tool_choice: { type: "tool", name: CROSSCHECK_TOOL.name },
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
        user_id: targetId ?? undefined,
        context: { anthropic_status: resp.status },
      });
      return { data: null as any, text: "" };
    }
    const data = JSON.parse(rawBody);
    const blocks: any[] = Array.isArray(data.content) ? data.content : [];
    const text = blocks.map((c: any) => c.text || "").join("") || "";
    const toolUse = blocks.find((c: any) => c?.type === "tool_use" && c?.name === CROSSCHECK_TOOL.name);
    const toolInput = toolUse && typeof toolUse.input === "object" ? toolUse.input : null;
    try {
      EdgeRuntime.waitUntil(logAIUsage({
        user_id: targetId ?? undefined,
        function_name: "cv-crosscheck",
        provider: "anthropic",
        model: data.model,
        input_tokens: data.usage?.input_tokens,
        output_tokens: data.usage?.output_tokens,
      }));
    } catch (_) { /* non-blocking */ }
    /* Raw text is kept so a future parse failure is recoverable, not lost. */
    return { data, text, toolInput, rawBody };
  };

  /** Placeholders are only meaningful inside the model's own sentences. */
  function hasPlaceholderInValues(v: unknown): boolean {
    const re = /\[[^\]]{2,40}\]/;
    if (typeof v === "string") return re.test(v);
    if (Array.isArray(v)) return v.some(hasPlaceholderInValues);
    if (v && typeof v === "object") return Object.values(v as Record<string, unknown>).some(hasPlaceholderInValues);
    return false;
  }

  /* ---------------- server-side gates ---------------------------------- */

  const AURA_CAN = ["capture_evidence", "draft_post", "suggest_headline", "track_signal"];
  const PLATITUDES = [
    "quantify your achievements", "action verbs", "tailor your cv",
    "ats", "highlight your strengths", "showcase",
  ];

  const WORD_NUMBERS: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
    ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
    sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  };

  /** A stated span is only allowed to stand when the years it cites produce it. */
  function spanIsWrong(sentence: string): boolean {
    const span = sentence.match(/\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)[-\s]year\b/i);
    if (!span) return false;
    const claimed = /^\d+$/.test(span[1]) ? Number(span[1]) : WORD_NUMBERS[span[1].toLowerCase()];
    if (!claimed && claimed !== 0) return false;
    const years = (sentence.match(/\b(19|20)\d{2}\b/g) ?? []).map(Number);
    if (years.length < 2) return false;
    const actual = Math.max(...years) - Math.min(...years);
    return actual !== claimed;
  }

  /** Strip only the offending clause; the rest of the sentence survives. */
  function repairSpans(value: unknown): unknown {
    if (typeof value === "string") {
      const parts = value.split(/(?<=[.!?])\s+/);
      const kept = parts.filter((s) => !spanIsWrong(s));
      return kept.join(" ").trim();
    }
    if (Array.isArray(value)) return value.map(repairSpans);
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = repairSpans(v);
      return out;
    }
    return value;
  }

  function allText(v: unknown): string {
    if (typeof v === "string") return ` ${v} `;
    if (Array.isArray(v)) return v.map(allText).join(" ");
    if (v && typeof v === "object") return Object.values(v as Record<string, unknown>).map(allText).join(" ");
    return "";
  }

  const bannedWords = await loadBannedWords(admin);

  /** Returns the name of the first failing assertion, or null when the result stands. */
  function gate(result: any): string | null {
    const findings: any[] = Array.isArray(result?.findings) ? result.findings : [];
    if (!findings.length) return "findings_empty";

    const text = allText(result).toLowerCase();
    if (PLATITUDES.some((p) => text.includes(p))) return "no_cv_platitudes";
    const whole = allText(result);
    if (hasBanned(whole, bannedWords)) {
      /* Name the offending word so the single retry can actually fix it. */
      const offender = bannedWords.find((w) => hasBanned(whole, [w])) ?? "unknown";
      return `no_banned_vocabulary: "${offender}"`;
    }

    for (const f of findings) {
      if (allText(f).split(/(?<=[.!?])\s+/).some(spanIsWrong)) return "numbers_recompute";
      if (!String(f?.what ?? "").trim()) return "finding_empty_after_repair";
      if (!String(f?.what_you_lose ?? "").trim()) return "what_you_lose_missing";
      const ev = f?.evidence;
      if (!ev || !String(ev.cv_line ?? "").trim() || !String(ev.profile_line ?? "").trim()) return "evidence_missing";
      if (f?.weight === "high" && !String(f?.rewrite ?? "").trim()) return "rewrite_missing_on_high";
      if (f?.aura_can != null && !AURA_CAN.includes(String(f.aura_can))) return "aura_can_outside_enum";
    }

    if (findings.filter((f) => f?.do_first === true).length !== 1) return "exactly_one_do_first";

    if (!String(result?.the_hard_truth ?? "").trim()) return "the_hard_truth_missing";
    const recs: any[] = Array.isArray(result?.recommendations) ? result.recommendations : [];
    if (recs.length < 3 || recs.length > 5) return "recommendations_count";
    for (const r of recs) {
      if (!String(r?.action ?? "").trim() || !String(r?.why_now ?? "").trim()) return "recommendation_incomplete";
      if (r?.aura_can != null && !AURA_CAN.includes(String(r.aura_can))) return "aura_can_outside_enum";
    }
    return null;
  }

  let { data, text, toolInput, rawBody } = await runOnce(userPrompt);
  let parsed: any = toolInput ?? parseJsonLoose(text);

  if (!parsed || hasPlaceholderInValues(parsed)) {
    const correction = `${userPrompt}

CORRECTION — your previous attempt was not a single valid JSON object, or contained a bracketed placeholder. Output the JSON object only, with real values drawn from the material above. No code fences, no commentary, no square-bracket placeholders.`;
    const retry = await runOnce(correction);
    if (retry.data) { data = retry.data; text = retry.text; rawBody = retry.rawBody; }
    parsed = retry.toolInput ?? parseJsonLoose(retry.text);
    if (!parsed || hasPlaceholderInValues(parsed)) {
      await logEfError(admin, {
        function_name: "cv-crosscheck",
        error: "Unparseable crosscheck after retry — nothing saved",
        severity: "high",
        user_id: targetId ?? undefined,
        context: { path: "unparseable", raw: String(retry.text || retry.rawBody || "").slice(0, 2000) },
      });
      return json({ ok: false, pending: true, reason: "unparseable" });
    }
  }

  /* Arithmetic is repaired before judging: a stripped clause is acceptable,
     a surviving wrong span is not. */
  parsed = repairSpans(parsed);
  if (Array.isArray(parsed?.findings)) {
    parsed.findings = parsed.findings.filter((f: any) => String(f?.what ?? "").trim().length > 0);
  }

  /* A forced tool cannot emit a JSON null for a string field, so the model
     writes the word "null" instead. Nullable prose fields must be truly null
     or the panel prints the word to the member. */
  const nullify = (v: unknown) =>
    typeof v === "string" && ["null", "none", "n/a", ""].includes(v.trim().toLowerCase()) ? null : v;
  for (const k of ["peer_comparison", "profile_vs_voice", "reading_the_shape", "headline_suggestion"]) {
    if (parsed && k in parsed) parsed[k] = nullify(parsed[k]);
  }

  let failure = gate(parsed);
  if (failure) {
    const correction = `${userPrompt}

CORRECTION — your previous answer failed the assertion "${failure}". Answer again in full, obeying every rule. Do not restate the failing content; fix it.`;
    const retry = await runOnce(correction);
    let retryParsed: any = retry.toolInput ?? parseJsonLoose(retry.text);
    if (retryParsed) {
      retryParsed = repairSpans(retryParsed);
      if (Array.isArray(retryParsed?.findings)) {
        retryParsed.findings = retryParsed.findings.filter((f: any) => String(f?.what ?? "").trim().length > 0);
      }
      for (const k of ["peer_comparison", "profile_vs_voice", "reading_the_shape", "headline_suggestion"]) {
        if (k in retryParsed) retryParsed[k] = nullify(retryParsed[k]);
      }
    }
    const retryFailure = retryParsed ? gate(retryParsed) : "unparseable_on_retry";
    if (!retryFailure) {
      parsed = retryParsed;
      if (retry.data) { data = retry.data; text = retry.text; rawBody = retry.rawBody; }
      failure = null;
    } else {
      await logEfError(admin, {
        function_name: "cv-crosscheck",
        error: `Crosscheck failed the gate twice — nothing saved (${failure} then ${retryFailure})`,
        severity: "high",
        user_id: targetId ?? undefined,
        context: { path: "gate_failed", first_assertion: failure, retry_assertion: retryFailure, purpose },
      });
      return json({ ok: false, pending: true, reason: "gate_failed", assertion: retryFailure });
    }
  }

  const crosscheck = {
    ...parsed,
    purpose,
    cv_count: docCount,
    model: data?.model ?? null,
    /* The model's own text alongside the parsed object, so nothing is lost. */
    cv_crosscheck_raw: String(text || rawBody || "").slice(0, 20000),
  };

  /* Transient reads are never persisted server-side: the anonymous browser
     holds the result on its session, and it moves to the profile at signup. */
  if (!transient) {
    const { error: writeErr } = await admin
      .from("diagnostic_profiles")
      .update({ cv_crosscheck: crosscheck, cv_crosscheck_at: new Date().toISOString() })
      .eq("user_id", targetId!);
    if (writeErr) return json({ error: writeErr.message }, 500);
  }

  return json({ ok: true, cv_count: docCount, crosscheck });
}));