import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { withObserve, logEfError } from "../_shared/observe.ts";
import { logAIUsage } from "../_shared/logAIUsage.ts";
import { ARABIC_VOICE_BLOCK, arabicStyleNotes, repairArabic } from "../_shared/arabicVoice.ts";
import { normaliseCrosscheck } from "./normalise.ts";
import { spanIsWrong, SENTENCE_SPLIT } from "./spans.ts";
import { OPERATION_STAGES } from "../_shared/stageKeys.ts";
import { startRun, runIdFrom, type RunHandle } from "../_shared/operationRun.ts";
import { isAdmin } from "../_shared/adminRole.ts";
import { findUserIdByEmail } from "../_shared/findUserByEmail.ts";
import { CORPUS_COLUMNS, isOwnWriting } from "../_shared/voiceCorpus.ts";
import { hasBanned, loadBannedWords } from "../_shared/bannedWords.ts";
import { makeUsable, arabicProse } from "./usable.ts";

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

FIGURES RULE — every number in rewrite, in headline_suggestion and in any ready-to-use sentence you offer inside defensibility must already appear in the material supplied below. Never supply an example figure, an estimate or a plausible-looking number. If the reader needs a figure the material does not contain, do not write a rewrite for that finding: say in do_this exactly which figure the person should add, and leave rewrite out.

FACTS RULE — a rewrite and a headline_suggestion may only restate facts that are already in the material supplied below, in better words. Never add a reason, a cause, a motive, a circumstance, a description of the employer, a future intention or a claim about what the person is looking for, unless the material states it. If the line needs a fact the material does not contain, do not write the rewrite: say in do_this exactly what the person should add, and leave rewrite out.

THE EVIDENCE LADDER — every \`defensibility\` entry must resolve to exactly one of three rungs and must say which: "Defensible now" (cite the captured fragment that proves it), "Defensible with one more detail" (name the single detail needed), or "Not defensible" (give the softened line, written out). Attacking a claim is free; telling someone how to keep it is the work.

READING THE SHAPE — in \`reading_the_shape\`, name what a board member will notice first about the career's shape. One sentence, or null if nothing stands out.

VOICE — in \`profile_vs_voice\`, compare what they write publicly and what others say about them against what the CV claims. Name the disagreement. Null if there are no posts and no recommendations.

BEHIND — \`cv_is_behind\` lists where the CV is out of date, written as to-dos, never as contradictions.

HEADLINE — \`headline_suggestion\` is under 200 characters, at most three segments, and leads with what is distinctive about this person rather than a category label.

KNOWNBY CAN — \`aura_can\` is a CLOSED LIST. You may only return one of: capture_evidence, draft_post, suggest_headline, track_signal, or null. Never write your own offer of help. Never promise a capability in prose.

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

const ARABIC_CV_ADDITION = `FIELDS IN ARABIC: headline_finding, every finding's what / why_it_matters / do_this / what_you_lose, defensibility, cv_is_behind, profile_vs_voice, reading_the_shape, the_hard_truth, every recommendation's action / why_now, and peer_comparison.
FIELDS THAT STAY AS THEY ARE: weight and aura_can keep their English enum values. evidence.cv_line and evidence.profile_line are verbatim quotes in the language of the source; write the single English word Absent when that side has nothing. rewrite and headline_suggestion are text the person will paste into their CV or LinkedIn profile: write each in the language of the document it replaces (an English CV line gets an English rewrite; an Arabic one gets Arabic).
The three evidence rungs in defensibility are written in Arabic: «قابل للدفاع الآن», «قابل للدفاع بتفصيل واحد إضافي», «غير قابل للدفاع».
The reader named in what_you_lose is named in Arabic (لجنة الترشيحات، شريك البحث التنفيذي، العميل المحتمل…).
Years of experience: compute every span from the two dates you cite, exactly as in English. Write spans as «N سنة» / «N سنوات» with Western digits.
Never use these Arabic CV-coaching platitudes: «أبرز إنجازاتك», «استخدم أفعالًا قوية», «خصّص سيرتك», «أظهر نقاط قوتك», «قِس إنجازاتك بالأرقام» as generic advice.`;

const ARABIC_CV_SYSTEM = SYSTEM_PROMPT + "\n\n" + ARABIC_VOICE_BLOCK + "\n" + ARABIC_CV_ADDITION;

/** repairArabic on the same prose fields, in place. */
function repairCvArabic(r: any): any {
  if (!r || typeof r !== "object") return r;
  const fix = (o: any, keys: string[]) => { for (const k of keys) if (typeof o?.[k] === "string") o[k] = repairArabic(o[k]); };
  fix(r, ["headline_finding", "defensibility", "cv_is_behind", "profile_vs_voice", "reading_the_shape", "the_hard_truth", "peer_comparison"]);
  for (const f of Array.isArray(r.findings) ? r.findings : []) fix(f, ["what", "why_it_matters", "do_this", "what_you_lose"]);
  for (const x of Array.isArray(r.recommendations) ? r.recommendations : []) fix(x, ["action", "why_now"]);
  return r;
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
  const lang: "ar" | "en" = body?.ui_lang === "ar" ? "ar" : "en";
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

  /* One run row for this cross-check, on both the anonymous and the
     signed-in path. Recording never fails the operation. */
  let run: RunHandle | null = null;
  try {
    run = await startRun(admin, {
      id: runIdFrom(body),
      operation: "cv_crosscheck",
      user_id: callerId || null,
      anon_token: anonToken || null,
      meta: { purpose, anonymous: !!anonToken, lang },
    });
  } catch (e) { console.error("[cv-crosscheck] run start failed:", (e as Error)?.message); }
  /* Stage one opens: reading the file and the profile snapshot. */
  run?.mark(OPERATION_STAGES.cv_crosscheck[0]);
  const runMeta: Record<string, unknown> = { purpose, anonymous: !!anonToken, lang };
  const finish = async (outcome: "ok" | "refused" | "failed", reason_code?: string, extraMeta?: Record<string, unknown>) => {
    try { await run?.finish({ outcome, reason_code: reason_code ?? null, ...(extraMeta ? { meta: { ...runMeta, ...extraMeta } } : {}) }); }
    catch (e) { console.error("[cv-crosscheck] run finish failed:", (e as Error)?.message); }
  };

  if (anonToken) {
    targetId = undefined;
    if (!inlineCvText && cvFile) {
      try { inlineCvText = (await extractInMemory(cvFile)).trim(); }
      catch (e) {
        console.error("[cv-crosscheck] transient extraction failed", String((e as Error)?.message ?? e));
        await finish("failed", "unparseable");
        return json({ ok: false, pending: true, reason: "unparseable" });
      }
    }
    if (inlineCvText.length < 200) {
      await finish("refused", "no_cv");
      return json({ ok: false, pending: true, reason: "no_cv" });
    }
  } else if (!targetId && email) {
    if (!callerIsAdmin) { await finish("refused", "forbidden"); return json({ error: "Forbidden" }, 403); }
    targetId = (await findUserIdByEmail(admin, email)) ?? undefined;
    if (!targetId) { await finish("refused", "no_account"); return json({ error: `No account found for ${email.trim()}` }, 404); }
  }
  if (!anonToken) {
    if (!targetId) targetId = callerId;
    if (targetId !== callerId && !callerIsAdmin) { await finish("refused", "forbidden"); return json({ error: "Forbidden" }, 403); }
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
  if (cvErr) { await finish("failed", "documents_query_failed"); return json({ error: cvErr.message }, 500); }
  const cvs = storedCvs ?? [];

  if (!inlineMode && !cvs.length) {
    await finish("refused", "no_cv");
    return json({ ok: false, pending: true, reason: "no_cv" });
  }

  const { data: snapRows } = transient
    ? { data: [] as any[] }
    : await admin
      .from("linkedin_profile_snapshots")
      .select("headline, about, experience, education, skills, certifications, raw")
      .eq("user_id", targetId!)
      .order("fetched_at", { ascending: false })
      .limit(1);
  const snap: any = snapRows?.[0] ?? null;
  if (!transient && !snap) {
    await finish("refused", "no_snapshot");
    return json({ ok: false, pending: true, reason: "no_snapshot" });
  }

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
What KnownBy already read from their public profile: ${anonRead ? JSON.stringify(anonRead).slice(0, 6000) : "Not on file"}`
    : `Headline: ${snap.headline ?? "Not on file"}
About: ${typeof snap.about === "string" ? snap.about.slice(0, 2000) : "Not on file"}
Experience: ${cut(snap.experience, 5000)}
Education: ${cut(snap.education, 1200)}
Skills: ${cut(snap.skills, 1200)}
Certifications: ${cut(snap.certifications, 1200)}`;
  if (transient && !anonRead && !anonState?.headline) {
    await finish("refused", "no_snapshot");
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
    .select(`${CORPUS_COLUMNS}, like_count, published_at`)
    .eq("user_id", targetId!)
    .not("post_text", "is", null)
    .order("like_count", { ascending: false, nullsFirst: false })
    .limit(60);

  const fragmentsText = (fragments ?? []).length
    ? (fragments ?? []).map((f: any) =>
        `· ${f.title ?? "Untitled"} (confidence ${f.confidence ?? "unknown"}): ${String(f.content ?? "").slice(0, 600)}`
      ).join("\n")
    : "None on file.";

  // Search-result snippets and discovered posts are not this member's writing.
  const usablePosts = (posts ?? []).filter((p: any) => isOwnWriting(p)).slice(0, 15);

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
  if (!ANTHROPIC_API_KEY) {
    await finish("failed", "not_configured");
    return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);
  }

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
              aura_can: { type: "string", enum: ["capture_evidence", "draft_post", "suggest_headline", "track_signal"], description: "Closed list. Omit the field entirely when nothing KnownBy does helps here." },
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
              aura_can: { type: "string", enum: ["capture_evidence", "draft_post", "suggest_headline", "track_signal"], description: "Closed list. Omit the field entirely when nothing KnownBy does helps here." },
            },
            required: ["action", "why_now"],
          },
        },
        peer_comparison: { type: "string", description: "Omit entirely when the peer data is thin. Never fabricate." },
      },
      required: ["headline_finding", "findings", "defensibility", "cv_is_behind", "profile_vs_voice", "the_hard_truth", "recommendations"],
    },
  } as const;

  const callAnthropic = (prompt: string, system: string, l: "ar" | "en") => fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: l === "ar" ? 6000 : 4000,
      system,
      messages: [{ role: "user", content: prompt }],
      tools: [CROSSCHECK_TOOL],
      tool_choice: { type: "tool", name: CROSSCHECK_TOOL.name },
    }),
  });

  /* Stage two opens: the model comparing the CV against the profile. */
  run?.mark(OPERATION_STAGES.cv_crosscheck[1]);

  /* ONE model call per request, in both languages (founder ruling 4 Oct):
     runs average ~106 s and the connection closes at 150 s, so any second
     call loses the whole result. Code repairs or drops; nothing retries. */
  const resp = await callAnthropic(userPrompt, lang === "ar" ? ARABIC_CV_SYSTEM : SYSTEM_PROMPT, lang);
  const rawBody = await resp.text();
  if (!resp.ok) {
    await logEfError(admin, {
      function_name: "cv-crosscheck",
      error: `Anthropic HTTP ${resp.status}: ${rawBody.slice(0, 800)}`,
      severity: "high",
      user_id: targetId ?? undefined,
      context: { anthropic_status: resp.status },
    });
    try {
      EdgeRuntime.waitUntil(logAIUsage({
        user_id: targetId ?? undefined,
        function_name: "cv-crosscheck",
        provider: "anthropic",
        model: "claude-sonnet-4-5-20250929",
        success: false,
        error_code: `http_${resp.status}`,
        metadata: { lang, attempt: "first", stop_reason: null },
      }));
    } catch (_) { /* non-blocking */ }
    await finish("failed", "unparseable");
    return json({ ok: false, pending: true, reason: "unparseable" });
  }
  const data = JSON.parse(rawBody);
  const blocks: any[] = Array.isArray(data.content) ? data.content : [];
  const text = blocks.map((c: any) => c.text || "").join("") || "";
  const toolUse = blocks.find((c: any) => c?.type === "tool_use" && c?.name === CROSSCHECK_TOOL.name);
  const toolInput = toolUse && typeof toolUse.input === "object" ? toolUse.input : null;
  const truncated = data.stop_reason === "max_tokens";
  console.log("[cv-crosscheck] call", lang, "out_tokens", data.usage?.output_tokens, "stop", data.stop_reason);

  const logUsage = (extra: Record<string, unknown>) => {
    try {
      EdgeRuntime.waitUntil(logAIUsage({
        user_id: targetId ?? undefined,
        function_name: "cv-crosscheck",
        provider: "anthropic",
        model: data.model,
        input_tokens: data.usage?.input_tokens,
        output_tokens: data.usage?.output_tokens,
        metadata: { lang, attempt: "first", stop_reason: data.stop_reason ?? null, ...extra },
      }));
    } catch (_) { /* non-blocking */ }
  };

  /** Placeholders are only meaningful inside the model's own sentences. */
  function hasPlaceholderInValues(v: unknown): boolean {
    const re = /\[[^\]]{2,40}\]/;
    if (typeof v === "string") return re.test(v);
    if (Array.isArray(v)) return v.some(hasPlaceholderInValues);
    if (v && typeof v === "object") return Object.values(v as Record<string, unknown>).some(hasPlaceholderInValues);
    return false;
  }

  /** Strip only the offending clause; the rest of the sentence survives. */
  function repairSpans(value: unknown): unknown {
    if (typeof value === "string") {
      const parts = value.split(SENTENCE_SPLIT);
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

  let parsed: any = toolInput ?? parseJsonLoose(text);
  if (!parsed || hasPlaceholderInValues(parsed)) {
    logUsage({ findings_kept: 0, findings_dropped: 0 });
    await logEfError(admin, {
      function_name: "cv-crosscheck",
      error: "Unparseable crosscheck — nothing saved",
      severity: "high",
      user_id: targetId ?? undefined,
      context: { path: "unparseable", stop_reason: data.stop_reason ?? null, raw: String(text || rawBody || "").slice(0, 2000) },
    });
    await finish("failed", "unparseable", { truncated });
    return json({ ok: false, pending: true, reason: "unparseable" });
  }

  /* Clean-up: arithmetic, "null" words, Arabic repair, do_first shape. */
  parsed = repairSpans(parsed);
  /* A forced tool cannot emit a JSON null for a string field, so the model
     writes the word "null" instead. Nullable prose fields must be truly null
     or the panel prints the word to the member. */
  const nullify = (v: unknown) =>
    typeof v === "string" && ["null", "none", "n/a", ""].includes(v.trim().toLowerCase()) ? null : v;
  for (const k of ["peer_comparison", "profile_vs_voice", "reading_the_shape", "headline_suggestion"]) {
    if (parsed && k in parsed) parsed[k] = nullify(parsed[k]);
  }
  if (lang === "ar") parsed = repairCvArabic(parsed);
  const first = normaliseCrosscheck(parsed);
  parsed = first.result;

  const bannedWords = await loadBannedWords(admin);
  /* The member's own material, exactly as put into the user prompt. */
  const figureSource = [cvText, profileText, postsText, fragmentsText, recsText].join("\n");
  const usable = makeUsable(parsed, { lang, bannedWords, hasBanned, truncated, source: figureSource });
  const qualityNotes = [...first.changes, ...usable.notes];
  console.log("[cv-crosscheck] quality_notes", JSON.stringify(qualityNotes));

  /* Arabic style findings advise only: recorded with the result. */
  const styleNotes = lang === "ar" ? arabicStyleNotes(arabicProse(usable.result)) : [];
  if (lang === "ar") console.log("[cv-crosscheck] arabic_style_notes", styleNotes.length, JSON.stringify(styleNotes));

  logUsage({
    findings_kept: usable.kept,
    findings_dropped: usable.dropped,
    rewrites_removed: usable.rewritesRemoved,
    defensibility_dropped: usable.defensibilityDropped,
    intention_sentences_removed: usable.intentionSentencesRemoved,
    ...(lang === "ar" ? { style_notes_count: styleNotes.length } : {}),
  });

  if (usable.failure) {
    await logEfError(admin, {
      function_name: "cv-crosscheck",
      error: `Crosscheck not usable — nothing saved (${usable.failure})`,
      severity: "high",
      user_id: targetId ?? undefined,
      context: { path: usable.failure, quality_notes: qualityNotes, purpose },
    });
    await finish("failed", usable.failure, { quality_notes: qualityNotes });
    return json({ ok: false, pending: true, reason: usable.failure });
  }

  const crosscheck = {
    ...usable.result,
    quality_notes: qualityNotes,
    ...(lang === "ar" ? { arabic_style_notes: styleNotes } : {}),
    purpose,
    lang,
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
    if (writeErr) { await finish("failed", "write_failed"); return json({ error: writeErr.message }, 500); }
  }

  await finish("ok", undefined, {
    quality_notes: qualityNotes,
    findings_kept: usable.kept,
    findings_dropped: usable.dropped,
    ...(lang === "ar" ? { style_notes_count: styleNotes.length } : {}),
  });
  return json({ ok: true, cv_count: docCount, crosscheck, lang, lang_fallback: false });
}));
