/**
 * Label the opening and the ending of every post the member wrote.
 *
 * Deterministic rules decide most rows for free; only the genuinely ambiguous
 * ones reach the model, batched, so filling a 400-post history costs a handful
 * of calls rather than four hundred.
 *
 * A non-null label is never overwritten, with one deliberate exception:
 * `{ reclassify_other: true }` re-runs the model over rows already parked in
 * `other`, with the strict definitions prompt, and may replace `other` with a
 * real label. It can never replace a real label.
 *
 * The vocabulary lives in `_shared/voiceVocab.ts`. The model's answer is
 * validated against it — anything outside the list becomes `other` and is
 * counted in `model_rejected`.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  ENDING_DEFINITIONS,
  ENDING_TYPES,
  HOOK_DEFINITIONS,
  HOOK_STYLES,
  isEnding,
  isHook,
} from "../_shared/voiceVocab.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FOUNDER_USER_ID = "9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3";
const BATCH = 20;

const HOOKS = HOOK_STYLES;
const ENDINGS = ENDING_TYPES;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const firstLine = (t: string) => (t.split(/\n+/).map((l) => l.trim()).find(Boolean) ?? "").trim();
const openerBlock = (t: string) =>
  t.split(/\n+/).map((l) => l.trim()).filter(Boolean).slice(0, 3).join(" / ");
const lastLine = (t: string) => {
  const lines = t.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  return lines[lines.length - 1] ?? "";
};

/** Rule-based opening label. null = undecided, hand it to the model. */
function ruleHook(line: string): string | null {
  if (!line) return null;
  const l = line.toLowerCase();
  if (/^[\s"'“(]*[\d٠-٩]/.test(line) || /^[\s"'“(]*[$€£]|^\s*\d+\s?%/.test(line)) return "number_first";
  if (/[?؟]\s*$/.test(line)) return "question";
  if (/^(i |we |my |our |last (week|month|year)|yesterday|in \d{4}|أمس|قبل\s)/i.test(line) && /\b(was|were|had|did|went|met|saw|built|led|joined|learned)\b/i.test(l)) return "short_story";
  if (/^(i |we |my |our |في|كنت|عندما)/i.test(line)) return "experience_led";
  if (/(delighted|pleased|proud to announce|excited to (announce|share)|honoured|honored|thrilled|announcing|يسعدني|بكل فخر|نعلن)/i.test(l)) return "announcement";
  if (/(everyone (is|says)|most people|the truth is|stop |nobody |no one |unpopular opinion|wrong about|is a myth|isn't|is not|لا أحد|الحقيقة)/i.test(l)) return "contrarian_claim";
  return null;
}

function ruleEnding(line: string): string | null {
  if (!line) return null;
  const l = line.toLowerCase();
  if (/[?؟]\s*$/.test(line)) return "question";
  if (/(comment below|let me know|what are your thoughts|dm me|follow me|share this|sign up|register|book a|شاركني|تابعني)/i.test(l)) return "cta";
  if (/[=+×]/.test(line) && /\w/.test(line)) return "equation";
  if (/^[^\d]*\d[\d.,%]*\s*[^\d]*$/.test(line) && /\d/.test(line)) return "number";
  if (/(\.\.\.|…|—)\s*$/.test(line)) return "suspended";
  if (/^(that('s| is)|which is why|so|the real|in other words|بمعنى آخر|لذلك)/i.test(l)) return "reframe";
  return null;
}

const hookGuide = Object.entries(HOOK_DEFINITIONS).map(([k, v]) => `- ${k}: ${v}`).join("\n");
const endingGuide = Object.entries(ENDING_DEFINITIONS).map(([k, v]) => `- ${k}: ${v}`).join("\n");

type Rejects = { hook: number; ending: number };

async function modelClassify(
  apiKey: string,
  batch: { i: number; first: string; last: string }[],
  strict: boolean,
  rejects: Rejects,
) {
  const system = strict
    ? `You label the OPENING and the ENDING of LinkedIn posts.\n\nOPENING styles (choose the CLOSEST match, do not default to "other"):\n${hookGuide}\n- other: only when the opener genuinely fits none of the above — a bare link, a pure greeting, or a single word.\n\nENDING types:\n${endingGuide}\n- other: only when none of the above fit.\n\nEvery answer must be exactly one of the listed keys. Return the tool call only.`
    : `Label LinkedIn post openings and endings. hook_style must be one of: ${HOOKS.join(", ")}. ` +
      `ending_type must be one of: ${ENDINGS.join(", ")}. Return the tool call only.`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: batch
            .map((b) => `[${b.i}] FIRST: ${b.first.slice(0, 240)}\nLAST: ${b.last.slice(0, 240)}`)
            .join("\n\n"),
        },
      ],
      tools: [{
        type: "function",
        function: {
          name: "label_posts",
          parameters: {
            type: "object",
            properties: {
              labels: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    index: { type: "number" },
                    hook_style: { type: "string", enum: HOOKS },
                    ending_type: { type: "string", enum: ENDINGS },
                  },
                  required: ["index", "hook_style", "ending_type"],
                  additionalProperties: false,
                },
              },
            },
            required: ["labels"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "label_posts" } },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI gateway ${res.status}: ${text.slice(0, 400)}`);
  }
  const data = await res.json();
  const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return [] as { index: number; hook_style: string; ending_type: string }[];
  let raw: { index: number; hook_style: unknown; ending_type: unknown }[] = [];
  try {
    raw = JSON.parse(args).labels ?? [];
  } catch {
    return [];
  }
  // Validate against the one vocabulary. Out-of-list answers become `other`.
  return raw.map((r) => {
    let hook = String(r.hook_style ?? "");
    let ending = String(r.ending_type ?? "");
    if (!isHook(hook)) { rejects.hook += 1; hook = "other"; }
    if (!isEnding(ending)) { rejects.ending += 1; ending = "other"; }
    return { index: Number(r.index), hook_style: hook, ending_type: ending };
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const reclassifyOther = body.reclassify_other === true;

    const authHeader = req.headers.get("Authorization") ?? "";
    const cronSecret = Deno.env.get("CRON_SECRET");
    const isService = authHeader === `Bearer ${SERVICE_ROLE}` ||
      (!!cronSecret && req.headers.get("x-cron-secret") === cronSecret);

    let userId: string | null = null;
    if (isService) {
      userId = typeof body.user_id === "string" ? body.user_id : null;
      if (!userId) return json({ error: "user_id required for service calls" }, 400);
    } else {
      if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
      const token = authHeader.replace("Bearer ", "").trim();
      const anon = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: { user }, error } = await anon.auth.getUser(token);
      if (error || !user) return json({ error: "Unauthorized" }, 401);
      userId = user.id === FOUNDER_USER_ID && typeof body.user_id === "string" ? body.user_id : user.id;
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const rejects: Rejects = { hook: 0, ending: 0 };
    const apiKey = Deno.env.get("LOVABLE_API_KEY");

    // ---------- Re-pass over rows parked in `other` ----------
    if (reclassifyOther) {
      const { data: rows, error: selErr } = await admin
        .from("linkedin_posts")
        .select("id, post_text, hook_style, ending_type")
        .eq("user_id", userId)
        .eq("hook_style", "other")
        .not("post_text", "is", null)
        .limit(500);
      if (selErr) throw new Error(`select failed: ${selErr.message}`);
      const cands = (rows ?? []).filter((r) => String(r.post_text ?? "").trim().length > 50);
      if (!apiKey) return json({ error: "AI not configured" }, 500);

      let moved = 0;
      let stayed_other = 0;
      const resisted: { id: string; opener: string }[] = [];

      for (let s = 0; s < cands.length; s += BATCH) {
        const slice = cands.slice(s, s + BATCH);
        const payload = slice.map((r, k) => ({
          i: s + k,
          first: openerBlock(String(r.post_text)),
          last: lastLine(String(r.post_text)),
        }));
        try {
          const labels = await modelClassify(apiKey, payload, true, rejects);
          for (const lab of labels) {
            const row = cands[lab.index];
            if (!row) continue;
            if (lab.hook_style === "other") {
              stayed_other += 1;
              resisted.push({ id: row.id, opener: firstLine(String(row.post_text)).slice(0, 120) });
              continue;
            }
            const { error } = await admin
              .from("linkedin_posts")
              .update({ hook_style: lab.hook_style })
              .eq("id", row.id)
              .eq("user_id", userId)
              .eq("hook_style", "other"); // can only ever replace `other`
            if (error) throw new Error(`update ${row.id} failed: ${error.message}`);
            moved += 1;
          }
        } catch (e) {
          console.error("[voice-classify-posts] strict batch failed:", (e as Error).message);
        }
      }

      const { count: totalClassified } = await admin
        .from("linkedin_posts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .not("hook_style", "is", null);
      const { count: otherLeft } = await admin
        .from("linkedin_posts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("hook_style", "other");

      return json({
        mode: "reclassify_other",
        user_id: userId,
        examined: cands.length,
        moved_off_other: moved,
        stayed_other,
        model_rejected: rejects,
        other_now: otherLeft ?? 0,
        classified_now: totalClassified ?? 0,
        other_share_now: totalClassified ? Number((((otherLeft ?? 0) / totalClassified) * 100).toFixed(1)) : 0,
        resisted: resisted.slice(0, 25),
      });
    }

    // ---------- Normal pass: fill nulls only ----------
    const { data: rows, error: selErr } = await admin
      .from("linkedin_posts")
      .select("id, post_text, hook_style, ending_type")
      .eq("user_id", userId)
      .not("post_text", "is", null)
      .or("hook_style.is.null,ending_type.is.null")
      .limit(500);
    if (selErr) throw new Error(`select failed: ${selErr.message}`);

    const candidates = (rows ?? []).filter((r) => String(r.post_text ?? "").trim().length > 50);

    const patches = new Map<string, Record<string, string>>();
    const undecided: { i: number; id: string; first: string; last: string; needHook: boolean; needEnd: boolean }[] = [];
    let rule_decided = 0;

    candidates.forEach((r, i) => {
      const text = String(r.post_text);
      const first = firstLine(text);
      const last = lastLine(text);
      const needHook = r.hook_style == null;
      const needEnd = r.ending_type == null;
      const patch: Record<string, string> = {};
      const h = needHook ? ruleHook(first) : null;
      const e = needEnd ? ruleEnding(last) : null;
      if (h && isHook(h)) patch.hook_style = h;
      if (e && isEnding(e)) patch.ending_type = e;
      if (Object.keys(patch).length) { patches.set(r.id, patch); rule_decided += 1; }
      if ((needHook && !h) || (needEnd && !e)) {
        undecided.push({ i, id: r.id, first, last, needHook: needHook && !h, needEnd: needEnd && !e });
      }
    });

    let model_decided = 0;
    if (undecided.length && apiKey) {
      for (let s = 0; s < undecided.length; s += BATCH) {
        const slice = undecided.slice(s, s + BATCH);
        try {
          const labels = await modelClassify(apiKey, slice.map((u) => ({ i: u.i, first: u.first, last: u.last })), true, rejects);
          for (const lab of labels) {
            const target = slice.find((u) => u.i === lab.index);
            if (!target) continue;
            const patch = patches.get(target.id) ?? {};
            if (target.needHook) patch.hook_style = lab.hook_style;
            if (target.needEnd) patch.ending_type = lab.ending_type;
            if (Object.keys(patch).length) { patches.set(target.id, patch); model_decided += 1; }
          }
        } catch (e) {
          console.error("[voice-classify-posts] batch failed:", (e as Error).message);
        }
      }
    }

    let updated = 0;
    for (const [id, patch] of patches) {
      // The .is(null) guards make it impossible to overwrite an existing label.
      let q = admin.from("linkedin_posts").update(patch).eq("id", id).eq("user_id", userId);
      if (patch.hook_style) q = q.is("hook_style", null);
      if (patch.ending_type) q = q.is("ending_type", null);
      const { error } = await q;
      if (error) throw new Error(`update ${id} failed: ${error.message}`);
      updated += 1;
    }

    return json({
      user_id: userId,
      candidates: candidates.length,
      rule_decided,
      model_decided,
      model_rejected: rejects,
      undecided_left: Math.max(0, undecided.length - model_decided),
      rows_updated: updated,
      ai_available: Boolean(apiKey),
    });
  } catch (error) {
    console.error("voice-classify-posts error:", error);
    return json({ error: (error as Error).message }, 500);
  }
});
