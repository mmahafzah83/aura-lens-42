/**
 * oe-extract-scope — reads what each posting STATES about accountability, once
 * per record, from the page text already stored on the row. No re-fetch.
 *
 * This is the backfill twin of the extraction the reader now does inline for
 * new records. It is bounded by the same daily spend cap as the rest of the
 * engine, and it never writes a field the page did not state.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { logEfError } from "../_shared/observe.ts";
import { checkSpendCap } from "../_shared/spendCap.ts";
import { logAIUsage, logAIFailure } from "../_shared/logAIUsage.ts";
import { SCOPE_EVIDENCE_INSTRUCTION, verifyScopeEvidence } from "../_shared/scopeEvidence.ts";
import { ANNOUNCEMENT_HINT, PEOPLE_SYSTEM, verifyPeople } from "../_shared/announcementPeople.ts";

const FN = "oe-extract-scope";
const MODEL = "google/gemini-3-flash-preview";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SYSTEM =
  `You read one job posting, tender, call or notice and report only what it states. ` +
  `Return strict JSON with a single key scope_evidence. ` + SCOPE_EVIDENCE_INSTRUCTION;

function parseJson(text: string): any {
  let t = (text || "").trim();
  if (t.startsWith("```")) t = t.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(t); } catch {
    const s = t.indexOf("{"), e = t.lastIndexOf("}");
    if (s >= 0 && e > s) return JSON.parse(t.slice(s, e + 1));
    throw new Error("unparseable model output");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const CRON_SECRET = Deno.env.get("cron_secret") || Deno.env.get("CRON_SECRET") || "";
  const cronHeader = req.headers.get("x-cron-secret") || "";
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!((!!CRON_SECRET && cronHeader === CRON_SECRET) || bearer === SERVICE_ROLE)) {
    return json({ error: "Forbidden" }, 403);
  }

  const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const key = Deno.env.get("LOVABLE_API_KEY") ?? "";
  if (!key) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const limit = Math.max(1, Math.min(200, Number(body.limit ?? 60)));
  const redo = body.redo === true;

  const counts = {
    considered: 0, no_page_text: 0, extracted: 0, nothing_stated: 0,
    errors: 0, calls: 0, stopped_at_cap: null as null | string,
    // the people an announcement names, read from the same stored page text
    announcements_read: 0, people_stored: 0, routes_named: 0, moved_to_route: 0,
  };

  try {
    let q = admin.from("oe_opportunities")
      .select("id, title, scope, source_url, raw, scope_evidence")
      .eq("alive", true);
    if (!redo) q = q.is("scope_evidence", null);
    const { data: rows, error } = await q.limit(limit);
    if (error) throw new Error(error.message);

    for (const o of rows ?? []) {
      counts.considered++;
      const pageText = String((o.raw as any)?.page_text ?? "");
      if (pageText.trim().length < 200) { counts.no_page_text++; continue; }

      const cap = await checkSpendCap(admin, FN);
      if (!cap.allowed) {
        counts.stopped_at_cap = `daily call ceiling ${cap.used}/${cap.cap} — stopped after ${counts.extracted} extracted`;
        break;
      }

      try {
        counts.calls++;
        const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: MODEL,
            temperature: 0.1,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: SYSTEM },
              {
                role: "user",
                content: `TITLE: ${o.title ?? ""}\nURL: ${o.source_url ?? ""}\n\nPAGE TEXT:\n${pageText.slice(0, 12_000)}`,
              },
            ],
          }),
          signal: AbortSignal.timeout(60_000),
        });
        if (!r.ok) {
          await logAIFailure({
            function_name: FN, provider: "lovable", model: MODEL,
            error_code: String(r.status), metadata: { opportunity_id: o.id },
          });
          throw new Error(`gateway ${r.status}: ${(await r.text()).slice(0, 200)}`);
        }
        const data = await r.json();
        await logAIUsage({
          function_name: FN, provider: "lovable", model: MODEL,
          input_tokens: data?.usage?.prompt_tokens ?? 0,
          output_tokens: data?.usage?.completion_tokens ?? 0,
          metadata: { opportunity_id: o.id },
        });

        const parsed = parseJson(data?.choices?.[0]?.message?.content || "");
        const evidence = verifyScopeEvidence(parsed?.scope_evidence ?? parsed, pageText);
        if (!evidence) { counts.nothing_stated++; continue; }

        const { error: upErr } = await admin.from("oe_opportunities")
          .update({
            scope_evidence: evidence,
            // The cost of the door is a fact of the record, not a requirement.
            ...(evidence.cost_of_door ? { cost_of_door: evidence.cost_of_door.value } : {}),
          }).eq("id", o.id);
        if (upErr) throw new Error(upErr.message);
        counts.extracted++;
      } catch (e) {
        counts.errors++;
        await logEfError(admin, {
          function_name: FN, error: e as Error, severity: "low",
          context: { opportunity_id: o.id },
        });
      }
    }

    // ── WHO THE ANNOUNCEMENT NAMES ────────────────────────────────────────
    // A notice about people moving is only a door when a person is named. The
    // same stored page text is read once more, for names and nothing else.
    {
      let pq = admin.from("oe_opportunities")
        .select("id, title, source_url, route_url, route_kind, access_state, issuer_id, issuer_raw, raw, kind")
        .eq("alive", true).eq("kind", "market_signal");
      if (!redo) pq = pq.is("people_read_at", null);
      const { data: notices } = await pq.limit(limit);

      for (const o of notices ?? []) {
        const pageText = String((o.raw as any)?.page_text ?? "");
        const looksLikeOne = ANNOUNCEMENT_HINT.test(`${o.title ?? ""} ${pageText.slice(0, 4000)}`);
        if (pageText.trim().length < 200 || !looksLikeOne) {
          await admin.from("oe_opportunities").update({ people_read_at: new Date().toISOString() }).eq("id", o.id);
          continue;
        }
        const cap = await checkSpendCap(admin, FN);
        if (!cap.allowed) { counts.stopped_at_cap = `daily call ceiling ${cap.used}/${cap.cap} — people pass stopped`; break; }

        try {
          counts.calls++; counts.announcements_read++;
          const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: MODEL, temperature: 0.1, response_format: { type: "json_object" },
              messages: [
                { role: "system", content: PEOPLE_SYSTEM },
                { role: "user", content: `TITLE: ${o.title ?? ""}\nURL: ${o.source_url ?? ""}\n\nPAGE TEXT:\n${pageText.slice(0, 12_000)}` },
              ],
            }),
            signal: AbortSignal.timeout(60_000),
          });
          if (!r.ok) throw new Error(`gateway ${r.status}: ${(await r.text()).slice(0, 200)}`);
          const data = await r.json();
          await logAIUsage({
            function_name: FN, provider: "lovable", model: MODEL,
            input_tokens: data?.usage?.prompt_tokens ?? 0, output_tokens: data?.usage?.completion_tokens ?? 0,
            metadata: { opportunity_id: o.id, pass: "people" },
          });
          const people = verifyPeople(parseJson(data?.choices?.[0]?.message?.content || ""), pageText);

          if (people.length) {
            // The people belong to an organisation: the one we already hold, or
            // the one the record names. Never a person without a home.
            let issuerId = o.issuer_id as string | null;
            if (!issuerId) {
              const name = String(o.issuer_raw ?? "").trim();
              if (name) {
                const { data: found } = await admin.from("oe_issuers")
                  .select("id").ilike("canonical_name", name).maybeSingle();
                if (found?.id) issuerId = found.id;
                else {
                  const { data: made } = await admin.from("oe_issuers")
                    .insert({ canonical_name: name }).select("id").maybeSingle();
                  issuerId = made?.id ?? null;
                }
              }
            }
            if (issuerId) {
              const rows = people.map((p) => ({
                issuer_id: issuerId, opportunity_id: o.id, full_name: p.full_name,
                role_title: p.role_title, source_url: o.source_url ?? "",
                is_public_spokesperson: p.is_public_spokesperson,
                role_in_matter: p.role_in_matter, role_in_matter_reason: p.role_in_matter_reason,
                quote: p.quote, linkedin_url: null, verified_at: new Date().toISOString(),
              }));
              const { error: upErr } = await admin.from("oe_issuer_people")
                .upsert(rows, { onConflict: "issuer_id,full_name" });
              if (upErr) throw new Error(upErr.message);
              counts.people_stored += rows.length;

              // A named person is the way in. The state moves only when the page
              // states that person's part in the matter — otherwise it is context.
              const inTheMatter = people.find((p) => p.role_in_matter);
              const patch: Record<string, unknown> = {
                route_kind: "named_person",
                route_url: o.route_url ?? o.source_url ?? null,
              };
              counts.routes_named++;
              if (inTheMatter && o.access_state === "observed_event") {
                patch.access_state = "identified_route";
                patch.access_state_reason = `${inTheMatter.full_name} — ${inTheMatter.role_in_matter_reason}`;
                counts.moved_to_route++;
              }
              await admin.from("oe_opportunities").update(patch).eq("id", o.id);
            }
          }
          await admin.from("oe_opportunities").update({ people_read_at: new Date().toISOString() }).eq("id", o.id);
        } catch (e) {
          counts.errors++;
          await logEfError(admin, { function_name: FN, error: e as Error, severity: "low", context: { opportunity_id: o.id, pass: "people" } });
        }
      }
    }

    await admin.from("oe_runs").insert({
      run_kind: "extract_scope", started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(), outcome: "ok", counts,
    });
    return json({ ok: true, counts });
  } catch (e) {
    await logEfError(admin, { function_name: FN, error: e as Error, severity: "error", context: { counts } });
    return json({ ok: false, error: (e as Error).message, counts }, 500);
  }
});
