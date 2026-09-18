/**
 * oe-p4-dryrun — proves the citation contract bites, without writing anything.
 * It takes one opportunity (by id, or the member's highest-scoring still-forming
 * match), retrieves his own eight closest items, runs the P4 reason writer once,
 * and returns every line with the verdict that the judge would apply: which
 * item it cites, how many of his own words it copied, and the Arabic register
 * result. Nothing is stored — no card, no match, no run row.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { OE_REGISTER_FOR_PROMPT, registerFault } from "../_shared/oeRegister.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const MODEL = "google/gemini-3-flash-preview";
const BANNED = /\bthought leader|personal brand|trajectory|leverage\b/i;
const hasPercent = (s: string) => /%|\bper ?cent|في المائة|بالمئة/i.test(s);
const wordsOf = (s: string) => String(s ?? "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);

function quotedRun(line: string, item: string): number {
  const L = wordsOf(line), I = wordsOf(item).slice(0, 400);
  let best = 0;
  for (let i = 0; i < I.length; i++) {
    for (let j = 0; j < L.length; j++) {
      let k = 0;
      while (i + k < I.length && j + k < L.length && I[i + k] === L[j + k]) k++;
      if (k > best) best = k;
    }
  }
  return best;
}

function p4System(lang: string) {
  return `Write for this professional, in ${lang === "ar" ? "Arabic" : "English"}, in the second person, plain words, ` +
    `no percentages, no label words — you write sentences only. ${OE_REGISTER_FOR_PROMPT} ` +
    `Return strict JSON {why:[{text, cites:[{kind, id}]},{text, cites:[{kind, id}]}], distance:{text}, clock:text}. ` +
    `Each text <= 45 words. HIS OWN MATERIAL is the only ground for a why line: every why line must cite one item ` +
    `from HIS OWN MATERIAL by its kind and id, and must quote at most 15 words copied verbatim from that item inside ` +
    `the line. A line that cites nothing, or quotes nothing from what it cites, is dropped. ` +
    `distance: name in one sentence the single thing his material does NOT show against the record's requirements. ` +
    `Say nothing is missing only when every requirement is matched by an item you cited. ` +
    `clock: 'closes in N days' / 'no date given' / 'early signal, likely within a quarter' in the member's language.`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function asVector(v: unknown): number[] | null {
  if (Array.isArray(v)) return v as number[];
  if (typeof v === "string") { try { const p = JSON.parse(v); return Array.isArray(p) ? p : null; } catch { return null; } }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const CRON_SECRET = Deno.env.get("cron_secret") || Deno.env.get("CRON_SECRET") || "";
  const cronHeader = req.headers.get("x-cron-secret") || "";
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!((!!CRON_SECRET && cronHeader === CRON_SECRET) || bearer === SERVICE_ROLE)) {
    return json({ error: "Forbidden" }, 403);
  }

  const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE);
  const lovableKey = Deno.env.get("LOVABLE_API_KEY") || "";
  const body = await req.json().catch(() => ({} as any));
  const userId = String(body.user_id ?? "");
  if (!userId) return json({ error: "user_id required" }, 400);

  try {
    let oppId = body.opportunity_id ? String(body.opportunity_id) : null;
    let matchScore: number | null = null;
    if (!oppId) {
      const { data: m } = await admin.from("oe_matches")
        .select("opportunity_id, score_avg, lane")
        .eq("user_id", userId).eq("lane", "lane_forming")
        .order("score_avg", { ascending: false }).limit(1).maybeSingle();
      oppId = m?.opportunity_id ?? null;
      matchScore = m?.score_avg ?? null;
    }
    if (!oppId) return json({ ok: false, error: "no lane_forming match for this member" }, 404);

    const { data: o } = await admin.from("oe_opportunities")
      .select("id, title, scope, sector, issuer_raw, location, deadline, signal_date, time_kind, chair_type, route_kind, requirements, embedding")
      .eq("id", oppId).maybeSingle();
    if (!o) return json({ ok: false, error: "opportunity not found" }, 404);

    const { data: profile } = await admin.from("diagnostic_profiles")
      .select("content_language").eq("user_id", userId).maybeSingle();
    const lang = (profile?.content_language === "ar" ? "ar" : "en") as "ar" | "en";

    const vec = asVector(o.embedding);
    if (!vec) return json({ ok: false, error: "opportunity has no embedding" }, 422);

    const { data: own, error: ownErr } = await admin.rpc("oe_member_evidence", {
      p_user_id: userId, p_embedding: `[${vec.join(",")}]`, p_k: 8,
    });
    if (ownErr) throw new Error(`oe_member_evidence: ${ownErr.message}`);
    const mine = (own ?? []).filter((r: any) => String(r.body ?? "").trim().length > 40);

    const retrieved = mine.map((r: any) => ({
      kind: r.kind, id: r.id, date: String(r.occurred_at ?? "").slice(0, 10),
      head: String(r.body ?? "").replace(/\s+/g, " ").slice(0, 80),
    }));
    if (!mine.length) return json({ ok: true, opportunity: { id: o.id, title: o.title }, retrieved, verdict: "no_evidence" });

    const allowedIds = new Map<string, any>(mine.map((r: any) => [String(r.id), r]));
    const mineBlock = mine.map((r: any, i: number) => [
      `${i + 1}. kind=${r.kind} id=${r.id} date=${String(r.occurred_at ?? "").slice(0, 10)}`,
      `"${String(r.title ? `${r.title}. ` : "")}${String(r.body ?? "").replace(/\s+/g, " ").slice(0, 1200)}"`,
    ].join("\n")).join("\n\n");

    const oppBlock = JSON.stringify({
      title: o.title, scope: o.scope, issuer: o.issuer_raw, sector: o.sector,
      location: o.location, deadline: o.deadline, signal_date: o.signal_date,
      time_kind: o.time_kind, chair_type: o.chair_type, route_kind: o.route_kind,
      requirements: (Array.isArray(o.requirements) ? o.requirements : []).map((r: any, i: number) => ({ id: `req:${i}`, text: r?.text ?? "" })),
    });
    const userMsg = [
      `HIS OWN MATERIAL (cite these, quote from these):\n${mineBlock}`,
      `OPPORTUNITY:\n${oppBlock}`,
      `ALLOWED CITE IDS: ${[...allowedIds.keys()].join(", ")}`,
    ].join("\n\n");

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL, temperature: 0.1, response_format: { type: "json_object" },
        messages: [{ role: "system", content: p4System(lang) }, { role: "user", content: userMsg }],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    const raw = r.ok ? (await r.json())?.choices?.[0]?.message?.content ?? "" : `gateway ${r.status}: ${(await r.text()).slice(0, 300)}`;

    let parsed: any = null;
    try {
      let t = String(raw).trim();
      if (t.startsWith("```")) t = t.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
      parsed = JSON.parse(t);
    } catch { /* returned raw for inspection */ }

    const lines = (Array.isArray(parsed?.why) ? parsed.why : []).map((w: any) => {
      const text = String(w?.text ?? "").trim();
      const rawCites = (Array.isArray(w?.cites) ? w.cites : [])
        .map((c: any) => ({ kind: String(c?.kind ?? ""), id: String(typeof c === "string" ? c : c?.id ?? "") }));
      const cites = rawCites.filter((c: any) => allowedIds.has(c.id));
      const runs = cites.map((c: any) => {
        const item = allowedIds.get(c.id);
        return { id: c.id, quoted_words: quotedRun(text, `${item?.title ?? ""} ${item?.body ?? ""}`) };
      });
      const register = registerFault(text, lang);
      const reasons: string[] = [];
      if (!text) reasons.push("empty");
      if (!cites.length) reasons.push(rawCites.length ? "cite not in supplied set" : "no cite");
      if (hasPercent(text)) reasons.push("percentage");
      if (BANNED.test(text)) reasons.push("banned word");
      if (register) reasons.push(`register: ${register}`);
      if (cites.length && !runs.some((x: any) => x.quoted_words >= 3 && x.quoted_words <= 15)) {
        reasons.push(`quoted run out of range (${runs.map((x: any) => x.quoted_words).join(",")})`);
      }
      return { text, raw_cites: rawCites, accepted_cites: cites, quoted_runs: runs, register_fault: register, kept: reasons.length === 0, dropped_because: reasons };
    });

    const distance = String(parsed?.distance?.text ?? parsed?.distance ?? "").trim();
    return json({
      ok: true,
      opportunity: { id: o.id, title: o.title, route_kind: o.route_kind, match_score_avg: matchScore },
      language: lang,
      retrieved,
      raw_model_output: raw,
      lines,
      kept_count: lines.filter((l: any) => l.kept).length,
      distance: { text: distance, register_fault: registerFault(distance, lang) },
      clock: String(parsed?.clock ?? ""),
      wrote_nothing: true,
    });
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message ?? e).slice(0, 500) }, 500);
  }
});
