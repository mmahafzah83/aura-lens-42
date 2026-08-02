// linkedin-publish — redeploy 2026-06-25 (image upload support)
import { withObserve } from "../_shared/observe.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { linkedinFetch } from "../_shared/linkedinFetch.ts";
import { alertPublishFailure } from "../_shared/publishFailureAlert.ts";
import {
  callWithPolicy,
  memberMessage,
  OVERALL_DEADLINE_MS,
  type PublishStep,
} from "../_shared/publishPolicy.ts";
import {
  attemptRows,
  idempotencyKeyFor,
  newCorrelationId,
  recordAttempt,
} from "../_shared/publishTelemetry.ts";

const LINKEDIN_VERSION = "202605";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// --- Draft-edit telemetry helpers (data collection only; never blocks publish) ---
const DIFF_CAP = 4000;

function levenshtein(a: string, b: string): number {
  const s = a.slice(0, DIFF_CAP);
  const t = b.slice(0, DIFF_CAP);
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  let prev = new Array(t.length + 1);
  let curr = new Array(t.length + 1);
  for (let j = 0; j <= t.length; j++) prev[j] = j;
  for (let i = 1; i <= s.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    const tmp = prev; prev = curr; curr = tmp;
  }
  return prev[t.length];
}

function firstNonEmptyLine(text: string): string {
  for (const line of text.split("\n")) {
    if (line.trim()) return line.trim();
  }
  return "";
}

/**
 * Raise a critical ops alert for a real user's failed publish.
 * Fire-and-forget, own try/catch, never awaited on the publish path.
 * A publish that fails BECAUSE of logging is a catastrophe — so this cannot throw.
 */
function fireFailureAlert(
  adminClient: any,
  opts: { userId: string; postId?: string | null; errorText: string; postText?: string | null },
) {
  try {
    const p = alertPublishFailure(adminClient, { ...opts, origin: "linkedin-publish" })
      .catch((e: unknown) => console.error("publish failure alert failed (non-blocking):", e));
    // @ts-ignore EdgeRuntime is provided by Supabase Deno runtime
    if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any)?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(p);
    }
  } catch (e) {
    console.error("publish failure alert outer failure (non-blocking):", e);
  }
}

function numericTokens(text: string): Set<string> {
  const matches = text.match(/[0-9\u0660-\u0669]+([.,][0-9\u0660-\u0669]+)*/g) || [];
  return new Set(matches);
}

Deno.serve(withObserve("linkedin-publish", async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

  let postId: string | undefined;
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    ({ postId } = await req.json().catch(() => ({})));
    if (!postId) return json({ error: "Missing postId" }, 400);

    const adminClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: connection } = await adminClient
      .from("linkedin_connections")
      .select("access_token, linkedin_id, status")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (!connection) return json({ success: false, error: "LinkedIn not connected" });

    const { data: post, error: postErr } = await adminClient
      .from("linkedin_posts")
      .select("id, post_text, published_confirmed_at, source_metadata, original_generated_text, source_signal_id, linkedin_post_id, post_url")
      .eq("id", postId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (postErr || !post) return json({ error: "Post not found" }, 404);

    // ── IDEMPOTENCY ──────────────────────────────────────────────────────
    // The key is derived from the post row id, so a retry of the same post can
    // never produce a second LinkedIn post. If the row already carries a URN,
    // the work is done — return the existing result before any publish call.
    const correlationId = newCorrelationId();
    const idempotencyKey = idempotencyKeyFor(postId);
    const existingUrn: string | null = (post as any).linkedin_post_id ?? null;
    if (existingUrn) {
      return json({
        success: true,
        already_published: true,
        urn: existingUrn,
        postUrl: (post as any).post_url ?? `https://www.linkedin.com/feed/update/${existingUrn}/`,
      });
    }
    if (post.published_confirmed_at) return json({ success: false, error: "Already published" });

    const postText: string = post.post_text ?? "";
    if (!postText.trim()) return json({ error: "Empty post_text" }, 400);
    if (postText.length > 3000) {
      return json({ success: false, error: "Post exceeds LinkedIn's 3000-character limit" });
    }

    // ── QUALITY GATE (control, not telemetry) ─────────────────────────────
    // Every publish surface converges here. Gate the text actually being sent.
    {
      const meta = (post as any)?.source_metadata ?? {};
      const language: string =
        meta.language || meta.content_language ||
        (/[\u0600-\u06FF]/.test(postText) ? "ar" : "en");

      const { data: profile } = await adminClient
        .from("diagnostic_profiles")
        .select("sector_focus, target_register")
        .eq("user_id", user.id)
        .maybeSingle();

      let groundingText: string | null = null;
      let signalTitle: string | null = null;
      if (post.source_signal_id) {
        const { data: sig } = await adminClient
          .from("strategic_signals")
          .select("signal_title, explanation, strategic_implications")
          .eq("id", post.source_signal_id)
          .maybeSingle();
        if (sig) {
          signalTitle = sig.signal_title ?? null;
          const impl = typeof sig.strategic_implications === "string"
            ? sig.strategic_implications
            : JSON.stringify(sig.strategic_implications ?? "");
          groundingText = `GROUNDED EVIDENCE — the only source of facts and numbers:\nSIGNAL: ${sig.signal_title ?? ""} — ${sig.explanation ?? ""} — implications: ${impl}`;
        }
      }

      let gate: any = null;
      let gateError: string | null = null;
      try {
        const call = fetch(`${SUPABASE_URL}/functions/v1/evaluate-content-quality`, {
          method: "POST",
          headers: { Authorization: authHeader, "Content-Type": "application/json" },
          body: JSON.stringify({
            post_text: postText,
            language,
            signal_title: signalTitle,
            user_sector: profile?.sector_focus ?? null,
            target_register: profile?.target_register ?? null,
            grounding_text: groundingText,
            content_kind: "post",
          }),
        }).then(async (r) => {
          if (!r.ok) throw new Error(`gate_http_${r.status}`);
          return await r.json();
        });
        const timeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("gate_timeout")), 40000)
        );
        gate = await Promise.race([call, timeout]);
      } catch (e) {
        gateError = (e as Error).message || "gate_invoke_error";
      }

      const rawOverall = Number(gate?.overall ?? 0);
      const overallScore = Math.min(100, Math.max(0, rawOverall <= 10 ? Math.round(rawOverall * 10) : Math.round(rawOverall)));
      const weaknesses = Array.isArray(gate?.weaknesses) ? gate.weaknesses : [];
      const passed = !gateError && gate
        ? (gate.pass === true || (gate.pass === undefined && overallScore >= 70))
        : false;

      // Awaited on purpose: this row is the record of a control decision.
      try {
        await adminClient.from("content_gate_results").insert({
          user_id: user.id,
          post_id: postId,
          function_name: "linkedin-publish",
          language,
          overall_score: overallScore,
          pass: passed,
          assertions: gate?.assertions ?? null,
          weaknesses,
          skipped: gate ? gate.skipped === true : true,
          skip_reason: gate?.skip_reason ?? gateError,
          judge_model: gate?.judge_model ?? null,
        });
      } catch (e) {
        console.error("[linkedin-publish] gate log failed:", (e as Error).message);
      }

      if (gateError || !gate) {
        return json({
          success: false,
          blocked: true,
          error: "Quality check unavailable — try again",
          weaknesses: [],
        });
      }
      if (!passed) {
        return json({
          success: false,
          blocked: true,
          error: "Held by the quality gate",
          weaknesses,
          quality_gate: { overall_score: overallScore, verdict: gate?.verdict ?? null, assertions: gate?.assertions ?? null },
        });
      }
    }

    const { data: claimed, error: claimErr } = await adminClient
      .from("linkedin_posts")
      .update({ tracking_status: "publishing", claimed_at: new Date().toISOString() })
      .eq("id", postId).eq("user_id", user.id)
      .is("published_confirmed_at", null)
      .neq("tracking_status", "publishing")
      .select("id");
    if (claimErr) return json({ success: false, error: "Could not lock post for publishing" });
    if (!claimed || claimed.length === 0)
      return json({ success: false, error: "This post is already publishing or published." });

    const releaseToDraft = async () => {
      await adminClient.from("linkedin_posts").update({ tracking_status: "draft" }).eq("id", postId).eq("user_id", user.id);
    };

    // ── ATTEMPT ENVELOPE ─────────────────────────────────────────────────
    // One 90s deadline covers every LinkedIn call this invocation makes, so a
    // publish can never hang without reaching a terminal state.
    const deadlineAt = Date.now() + OVERALL_DEADLINE_MS;
    await adminClient
      .from("linkedin_posts")
      .update({ publish_attempted_at: new Date().toISOString() })
      .eq("id", postId).eq("user_id", user.id);

    const runStep = async (
      step: PublishStep,
      fetcher: (signal: AbortSignal) => Promise<Response>,
    ) => {
      const result = await callWithPolicy({ step, fetcher, deadlineAt });
      const rows = attemptRows(
        { correlation_id: correlationId, post_id: postId!, user_id: user.id, idempotency_key: idempotencyKey },
        result.attempts,
        result.outcome,
        result.body,
      );
      for (const r of rows) await recordAttempt(adminClient, r);
      return result;
    };

    /** Terminal failure: the post is parked, the member gets one plain sentence. */
    const failTerminal = async (
      step: PublishStep,
      outcome: "refused" | "unreachable" | "timeout",
      status: number | null,
      body: string,
    ) => {
      const message = memberMessage(outcome, status, body, step);
      const uncertain = outcome === "timeout" && step === "create_post";
      await adminClient
        .from("linkedin_posts")
        .update({
          tracking_status: uncertain ? "needs_review" : "draft",
          source_metadata: {
            ...((post as any).source_metadata ?? {}),
            publish_error: message,
            publish_failure_reason: outcome === "timeout" ? "timeout" : outcome,
            publish_failure_step: step,
            publish_failure_status: status,
            publish_correlation_id: correlationId,
            failed_at: new Date().toISOString(),
          },
        })
        .eq("id", postId).eq("user_id", user.id);
      fireFailureAlert(adminClient, {
        userId: user.id, postId,
        errorText: `${outcome} at ${step} (status ${status ?? "none"}): ${body.slice(0, 300)}`,
        postText,
      });
      return json({
        success: false,
        error: message,
        reason: outcome === "timeout" ? "timeout" : outcome,
        step,
        status,
        correlation_id: correlationId,
        needs_check: uncertain,
      });
    };

    // Optional single image (additive — text-only posts are unaffected)
    const imageUrl: string | undefined = (post as any)?.source_metadata?.image_url;
    // Optional carousel PDF. A document post is the same publish path with a
    // different upload endpoint — there is exactly one publisher in this app.
    const documentUrl: string | undefined = (post as any)?.source_metadata?.document_url;
    let mediaContent: Record<string, unknown> | undefined;

    /** Storage-only. The same gate the image path uses; SSRF is the risk. */
    const approvedStorageUrl = (raw: string): URL | string => {
      let parsed: URL;
      try { parsed = new URL(raw); } catch { return "Invalid media URL"; }
      if (parsed.protocol !== "https:") return "Media URL must be https";
      const h = parsed.hostname.toLowerCase();
      const ok = h.endsWith(".supabase.co") || h.endsWith(".supabase.in") ||
        h.endsWith(".lovable.app") || h.endsWith(".lovable.dev");
      return ok ? parsed : "Media must be hosted on approved storage";
    };

    if (documentUrl && !imageUrl) {
      const parsedDoc = approvedStorageUrl(documentUrl);
      if (typeof parsedDoc === "string") {
        await releaseToDraft();
        return json({ success: false, error: parsedDoc }, 400);
      }
      const initResult = await runStep("register_upload", (signal) =>
        linkedinFetch("https://api.linkedin.com/rest/documents?action=initializeUpload", {
          method: "POST",
          signal,
          headers: {
            Authorization: `Bearer ${connection.access_token}`,
            "X-Restli-Protocol-Version": "2.0.0",
            "LinkedIn-Version": LINKEDIN_VERSION,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            initializeUploadRequest: { owner: `urn:li:person:${connection.linkedin_id}` },
          }),
        }, { userId: user.id, adminClient, purpose: "document-init" }));
      if (initResult.outcome !== "ok") {
        return await failTerminal("register_upload", initResult.outcome, initResult.status, initResult.body);
      }
      let initJson: any = {};
      try { initJson = JSON.parse(initResult.body); } catch { /* handled below */ }
      const uploadUrl: string = initJson?.value?.uploadUrl;
      const documentUrn: string = initJson?.value?.document;
      if (!uploadUrl || !documentUrn) {
        return await failTerminal("register_upload", "refused", initResult.status, initResult.body);
      }

      const docRes = await fetch(parsedDoc.toString());
      if (!docRes.ok) {
        await releaseToDraft();
        return json({ success: false, error: "Could not read the stored carousel", status: docRes.status });
      }
      const docBytes = new Uint8Array(await docRes.arrayBuffer());

      const upResult = await runStep("upload_binary", (signal) =>
        linkedinFetch(uploadUrl, {
          method: "PUT",
          signal,
          headers: {
            Authorization: `Bearer ${connection.access_token}`,
            "Content-Type": "application/pdf",
          },
          body: docBytes,
        }, { userId: user.id, adminClient, purpose: "document-upload" }));
      if (upResult.outcome !== "ok") {
        return await failTerminal("upload_binary", upResult.outcome, upResult.status, upResult.body);
      }

      const docTitle = String(
        (post as any)?.source_metadata?.document_title ?? "Carousel",
      ).slice(0, 100);
      mediaContent = { media: { id: documentUrn, title: docTitle } };
    }

    if (imageUrl) {
      let parsedImg: URL;
      try {
        parsedImg = new URL(imageUrl);
      } catch {
        await releaseToDraft();
        return json({ success: false, error: "Invalid image URL" }, 400);
      }
      if (parsedImg.protocol !== "https:") {
        await releaseToDraft();
        return json({ success: false, error: "Image URL must be https" }, 400);
      }
      const imgHost = parsedImg.hostname.toLowerCase();
      const allowedHost =
        imgHost.endsWith(".supabase.co") ||
        imgHost.endsWith(".supabase.in") ||
        imgHost.endsWith(".lovable.app") ||
        imgHost.endsWith(".lovable.dev");
      if (!allowedHost) {
        await releaseToDraft();
        return json({ success: false, error: "Image must be hosted on approved storage" }, 400);
      }
      const initResult = await runStep("register_upload", (signal) =>
        linkedinFetch("https://api.linkedin.com/rest/images?action=initializeUpload", {
          method: "POST",
          signal,
          headers: {
            Authorization: `Bearer ${connection.access_token}`,
            "X-Restli-Protocol-Version": "2.0.0",
            "LinkedIn-Version": LINKEDIN_VERSION,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ initializeUploadRequest: { owner: `urn:li:person:${connection.linkedin_id}` } }),
        }, { userId: user.id, adminClient, purpose: "image-init" }));
      if (initResult.outcome !== "ok") {
        return await failTerminal("register_upload", initResult.outcome, initResult.status, initResult.body);
      }
      let initJson: any = {};
      try { initJson = JSON.parse(initResult.body); } catch { /* handled below */ }
      const uploadUrl: string = initJson?.value?.uploadUrl;
      const imageUrn: string = initJson?.value?.image;
      if (!uploadUrl || !imageUrn) {
        return await failTerminal("register_upload", "refused", initResult.status, initResult.body);
      }

      const imgRes = await fetch(parsedImg.toString());
      if (!imgRes.ok) {
        await releaseToDraft();
        return json({ success: false, error: "Could not read the stored image", status: imgRes.status });
      }
      const imgBytes = new Uint8Array(await imgRes.arrayBuffer());

      const upResult = await runStep("upload_binary", (signal) =>
        linkedinFetch(uploadUrl, {
          method: "PUT",
          signal,
          headers: { Authorization: `Bearer ${connection.access_token}` },
          body: imgBytes,
        }, { userId: user.id, adminClient, purpose: "image-upload" }));
      if (upResult.outcome !== "ok") {
        return await failTerminal("upload_binary", upResult.outcome, upResult.status, upResult.body);
      }

      mediaContent = { media: { id: imageUrn } };
    }

    const body: Record<string, unknown> = {
      author: `urn:li:person:${connection.linkedin_id}`,
      commentary: postText,
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    };
    if (mediaContent) body.content = mediaContent;

    // Diagnostics — do NOT modify commentary
    try {
      const reservedSet = new Set(["(",")","[","]","{","}","<",">","@","|","~","_","*","#"]);
      const reserved: Array<{ char: string; index: number }> = [];
      for (let i = 0; i < postText.length; i++) {
        const ch = postText[i];
        if (reservedSet.has(ch)) reserved.push({ char: ch, index: i });
      }
      const byteLength = new TextEncoder().encode(postText).length;
      const tail60 = postText.slice(-60);
      await adminClient.from("ef_error_log").insert({
        function_name: "linkedin-publish",
        severity: "info",
        error_message: `pre-publish diagnostics postId=${postId} len=${postText.length} bytes=${byteLength}`,
        user_id: user.id,
        context: {
          stage: "pre_publish",
          postId,
          length: postText.length,
          byte_length: byteLength,
          tail_60: tail60,
          reserved,
          has_media: Boolean(mediaContent),
        },
      });
    } catch (e) {
      console.error("pre-publish diagnostics failed:", e);
    }

    const pubResult = await runStep("create_post", (signal) =>
      linkedinFetch("https://api.linkedin.com/rest/posts", {
        method: "POST",
        signal,
        headers: {
          Authorization: `Bearer ${connection.access_token}`,
          "X-Restli-Protocol-Version": "2.0.0",
          "LinkedIn-Version": LINKEDIN_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }, { userId: user.id, adminClient, purpose: "publish" }));

    if (pubResult.outcome === "ok") {
      const urn = pubResult.headers["x-restli-id"] ?? "";
      const postUrl = `https://www.linkedin.com/feed/update/${urn}/`;
      const now = new Date().toISOString();
      await adminClient
        .from("linkedin_posts")
        .update({
          linkedin_post_id: urn,
          post_url: postUrl,
          published_at: now,
          published_confirmed_at: now,
          tracking_status: "published",
          authorship: "aura_drafted",
          acquisition: "published_via_aura",
        })
        .eq("id", postId)
        .eq("user_id", user.id);

      // Draft-edit telemetry: what Aura served vs what the user actually published.
      // Fire-and-forget, own try/catch — must never block, delay or fail a publish.
      try {
        const served: string = (post as any).original_generated_text ?? "";
        if (served && served.trim()) {
          const recordDraftEdit = async () => {
            try {
              const publishedText = postText;
              const sCap = served.slice(0, DIFF_CAP);
              const pCap = publishedText.slice(0, DIFF_CAP);
              const distance = levenshtein(sCap, pCap);
              const maxLen = Math.max(sCap.length, pCap.length) || 1;
              const similarity = Number((1 - distance / maxLen).toFixed(4));
              const servedNums = numericTokens(served);
              const publishedNums = numericTokens(publishedText);
              let removed = 0;
              for (const n of servedNums) if (!publishedNums.has(n)) removed++;
              let added = 0;
              for (const n of publishedNums) if (!servedNums.has(n)) added++;
              const language = ((post as any).source_metadata?._language
                ?? (post as any).source_metadata?.language ?? null) as string | null;
              await adminClient.from("draft_edits").insert({
                user_id: user.id,
                post_id: postId,
                language,
                served_text: served,
                published_text: publishedText,
                served_chars: served.length,
                published_chars: publishedText.length,
                levenshtein_distance: distance,
                similarity_ratio: similarity,
                first_line_changed: firstNonEmptyLine(served) !== firstNonEmptyLine(publishedText),
                numbers_removed: removed,
                numbers_added: added,
              });
            } catch (e) {
              try {
                await adminClient.from("ef_error_log").insert({
                  function_name: "linkedin-publish",
                  severity: "info",
                  error_message: `draft_edits capture failed: ${e instanceof Error ? e.message : String(e)}`,
                  user_id: user.id,
                  context: { stage: "draft_edits", postId },
                });
              } catch (_) { /* ignore */ }
            }
          };
          // @ts-ignore EdgeRuntime is provided by Supabase Deno runtime
          if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any)?.waitUntil) {
            // @ts-ignore
            EdgeRuntime.waitUntil(recordDraftEdit());
          } else {
            recordDraftEdit();
          }
        }
      } catch (e) {
        console.error("draft_edits outer failure (non-blocking):", e);
      }

      // Fire-and-forget: enqueue a voice_distill job so the worker re-learns
      // this user's voice from the growing published corpus. The partial
      // unique index (job_type, user_id) WHERE status IN ('pending','claimed')
      // collapses rapid re-publishes into a single job. Never blocks publish.
      try {
        const kickVoiceDistill = async () => {
          try {
            const MIN_CORPUS = 5;
            const MIN_EVIDENCE_CHARS = 200;

            // Authentic corpus only. Aura's own output is never counted —
            // publishing a generated draft must not trigger a relearn.
            const countAuthentic = async (since?: string | null) => {
              let q = adminClient
                .from("linkedin_posts")
                .select("post_text, source_type, tracking_status")
                .eq("user_id", user.id)
                .not("post_text", "is", null)
                .limit(500);
              if (since) q = q.gt("published_at", since);
              const { data } = await q;
              return (data || []).filter((p: any) => {
                const st = p.source_type;
                const ts = p.tracking_status;
                const ok =
                  (st === "browser_capture" && (ts === "confirmed" || ts === "metrics_imported")) ||
                  (st === "search_discovery" && ts === "confirmed") ||
                  (st === "manual_url" && ts === "manual") ||
                  st === "linkedin_export" ||
                  st === "linkedin_import";
                return ok && String(p.post_text ?? "").trim().length >= MIN_EVIDENCE_CHARS;
              }).length;
            };

            // Total eligible corpus — floor gate. Prevents distilling
            // confident-looking voice models from tiny (e.g. 2-post) samples.
            const totalCorpus = await countAuthentic();
            if (totalCorpus < MIN_CORPUS) return;

            // Count eligible posts newer than the user's most recent
            // voice_distill training_logs row, and time since that run.
            const { data: lastLog } = await adminClient
              .from("training_logs")
              .select("created_at")
              .eq("user_id", user.id)
              .eq("pillar", "voice_distill")
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            const newSince = lastLog?.created_at
              ? await countAuthentic(lastLog.created_at)
              : totalCorpus;
            const daysSinceLastRun = lastLog?.created_at
              ? (Date.now() - Date.parse(lastLog.created_at)) / 86_400_000
              : Number.POSITIVE_INFINITY;

            const shouldRun = !lastLog || newSince >= 3 || daysSinceLastRun >= 30;
            if (!shouldRun) return;

            // Insert a queue row instead of invoking voice-distill directly.
            // ON CONFLICT DO NOTHING against job_queue_one_live so three
            // publishes in five minutes still produce exactly ONE job.
            const daysInt = Number.isFinite(daysSinceLastRun)
              ? Math.max(0, Math.min(9999, Math.floor(daysSinceLastRun)))
              : 9999;
            const { error: insErr } = await adminClient
              .from("job_queue")
              .insert({
                job_type: "voice_distill",
                user_id: user.id,
                payload: {
                  total_corpus: totalCorpus,
                  new_since: newSince,
                  days_since: daysInt,
                  trigger: "linkedin_publish",
                },
                priority: 100,
              });
            // 23505 = unique_violation from job_queue_one_live: another
            // pending/claimed voice_distill job already exists for this user.
            // That is the intended collapse behavior, not an error.
            if (insErr && (insErr as any).code !== "23505") {
              console.error("voice-distill enqueue failed (non-blocking):", insErr.message);
            }
          } catch (e) {
            console.error("voice-distill kick failed (non-blocking):", e);
          }
        };
        // @ts-ignore EdgeRuntime is provided by Supabase Deno runtime
        if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any)?.waitUntil) {
          // @ts-ignore
          EdgeRuntime.waitUntil(kickVoiceDistill());
        } else {
          kickVoiceDistill();
        }
      } catch (e) {
        console.error("voice-distill kick outer failure (non-blocking):", e);
      }

      return json({ success: true, urn, postUrl });
    }

    // Every non-2xx path (including 401 and a blown deadline) is terminal here:
    // the attempt already exhausted the retry policy above.
    return await failTerminal("create_post", pubResult.outcome, pubResult.status, pubResult.body);
  } catch (err) {
    console.error("linkedin-publish error:", err);
    if (typeof postId === "string") {
      try {
        const adminClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        await adminClient.from("linkedin_posts").update({ tracking_status: "needs_review" }).eq("id", postId);
        const { data: p } = await adminClient
          .from("linkedin_posts").select("user_id, post_text").eq("id", postId).maybeSingle();
        if (p?.user_id) {
          fireFailureAlert(adminClient, {
            userId: p.user_id, postId,
            errorText: err instanceof Error ? err.message : String(err),
            postText: p.post_text,
          });
        }
      } catch {}
    }
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
}));