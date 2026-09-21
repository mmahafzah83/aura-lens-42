/**
 * oe-screen-member — the screening brain, run for one member.
 *
 * Builds the member's identity from his own profile snapshot, then puts every
 * live record through three gates in order — licence, profession, level — and
 * only then through the presentation test: a search consultant must be able to
 * say "X is the man who ___" from his evidence and have the client nod. If the
 * model cannot write that line from evidence, the record does not render,
 * whatever it scored.
 *
 * Nothing in here is specific to one member. Every threshold is read off his
 * own history.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { logEfError } from "../_shared/observe.ts";
import { hasRoute, screen, type Eligibility } from "../_shared/oeEligibility.ts";
import { deriveIdentity, runGates, writingStanding, type LadderRow, type MemberIdentity } from "../_shared/oeScreen.ts";
import {
  loadLocationSensitivity, sensitivityOf, loadLevelGateApplies, levelGateApplies,
} from "../_shared/oeKinds.ts";

const FN = "oe-screen-member";
const MODEL = "openai/gpt-6-astra";

/** Only so a rejection reads like a person wrote it: "you work from Saudi Arabia". */
const COUNTRY_NAME: Record<string, string> = {
  SA: "Saudi Arabia", AE: "the United Arab Emirates", QA: "Qatar", KW: "Kuwait",
  BH: "Bahrain", OM: "Oman", JO: "Jordan", EG: "Egypt", LB: "Lebanon", IQ: "Iraq",
  GB: "the United Kingdom", US: "the United States", FR: "France", DE: "Germany",
  CH: "Switzerland", SG: "Singapore", IN: "India", PK: "Pakistan", TR: "Türkiye",
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const PRESENTATION_SYSTEM =
  "You are a search consultant. Before you present anyone you must be able to say one line — " +
  "'<first name> is the man who ___' — and have the client nod. " +
  "You receive one professional's actual positions and the evidence of what he ran, and one opportunity " +
  "with the requirements it STATES. " +
  "Match his history against those stated requirements. Write the line ONLY if a named position in his " +
  "history plainly answers at least one stated requirement — never from the opportunity's title alone. " +
  "Return strict JSON {line: string|null, position: string|null, requirement: string|null}. " +
  "line is one sentence under 25 words, starting with the first name, in plain English, no adjectives of praise. " +
  "position must be copied verbatim from the positions given, and must be the position that earns the line. " +
  "requirement must be copied verbatim from the stated requirements when there are any, else null. " +
  "If nothing in his history answers a requirement, return {line: null, position: null, requirement: null}. " +
  "Never invent experience.";

/** One streamed call. Reasoning models run for minutes; never buffer, never time out on a timer. */
async function askForLine(
  key: string,
  payload: string,
): Promise<{ line: string | null; position: string | null; requirement: string | null }> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: MODEL,
      instructions: PRESENTATION_SYSTEM,
      input: payload,
      stream: true,
      reasoning: { effort: "low", summary: "auto" },
      text: {
        format: {
          type: "json_schema",
          name: "presentation_line",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              line: { type: ["string", "null"] },
              position: { type: ["string", "null"] },
              requirement: { type: ["string", "null"] },
            },
            required: ["line", "position", "requirement"],
          },
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`gateway ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const l of lines) {
      if (!l.startsWith("data:")) continue;
      const raw = l.slice(5).trim();
      if (!raw || raw === "[DONE]") continue;
      try {
        const ev = JSON.parse(raw);
        if (ev.type === "response.output_text.delta" && typeof ev.delta === "string") text += ev.delta;
      } catch { /* partial frame */ }
    }
  }
  try {
    const parsed = JSON.parse(text.trim());
    return {
      line: parsed?.line ?? null,
      position: parsed?.position ?? null,
      requirement: parsed?.requirement ?? null,
    };
  } catch {
    return { line: null, position: null, requirement: null };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const lovableKey = Deno.env.get("LOVABLE_API_KEY") ?? "";

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const userId = String(body.user_id ?? "");
  const withLines = body.presentation !== false;
  const lineBudget = Number(body.line_budget ?? 12);
  if (!userId) return json({ error: "user_id required" }, 400);

  try {
    // ── the employer ladder, read from data, never from a list in code ───
    const { data: ladderRows, error: ladderError } = await admin
      .from("oe_employer_ladder")
      .select("country, band, pattern, label_en, standing_bonus, active")
      .eq("active", true);
    if (ladderError) throw new Error(`employer ladder: ${ladderError.message}`);
    const ladder = (ladderRows ?? []) as LadderRow[];
    const sensitivity = await loadLocationSensitivity(admin);
    const levelApplies = await loadLevelGateApplies(admin);

    // ── the member, derived from his own snapshot ────────────────────────
    const { data: snap } = await admin
      .from("linkedin_profile_snapshots")
      .select("id, experience, education, certifications, skills, headline, about")
      .eq("user_id", userId).order("fetched_at", { ascending: false }).limit(1).maybeSingle();
    if (!snap) throw new Error("no profile snapshot — nothing to screen against");

    const identity: MemberIdentity = deriveIdentity(snap, ladder);
    if (!identity.positions.length) throw new Error("profile snapshot holds no positions");

    await admin.from("oe_member_identity").upsert({
      user_id: userId, snapshot_id: snap.id,
      positions: identity.positions, professions: identity.professions,
      highest_standing: identity.highest_standing, sectors_delivered: identity.sectors_delivered,
      qualifications: identity.qualifications, scope_evidence: identity.scope_evidence,
      built_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    // ── what he is licensed to hold, and what he can show ────────────────
    const { data: eligRow } = await admin.from("oe_eligibility").select("*").eq("user_id", userId).maybeSingle();
    const eligibility = (eligRow ?? null) as Eligibility | null;
    const { data: profile } = await admin.from("diagnostic_profiles")
      .select("years_experience, core_practice").eq("user_id", userId).maybeSingle();
    const yearsMatch = /(\d{1,2})/.exec(String((profile as any)?.years_experience ?? ""));
    const evidence = {
      years_experience: yearsMatch ? Number(yearsMatch[1]) : null,
      practice: (profile as any)?.core_practice ?? null,
      sectors: eligibility?.sectors_core ?? null,
    };
    const { data: standsFace } = await admin.from("oe_faces")
      .select("summary").eq("user_id", userId).eq("face", "stands").maybeSingle();

    // ── every live record ────────────────────────────────────────────────
    const { data: opps, error: oppsError } = await admin.from("oe_opportunities")
      .select("id, kind, title, scope, sector, chair_type, level_band, location, remote, requirements, scope_evidence, issuer_raw, route_url, route_kind, route_dead, access_state, issuer:oe_issuers(domain)")
      .eq("alive", true);
    if (oppsError) throw new Error(`alive opportunities: ${oppsError.message}`);

    // Where he works, named as a person would name it, for the place sentence.
    const memberPlace = {
      where: COUNTRY_NAME[String(eligibility?.residence_country ?? "").toUpperCase()]
        ?? eligibility?.residence_country
        ?? (eligibility?.countries_allowed ?? []).map((c) => COUNTRY_NAME[String(c).toUpperCase()] ?? c).join(" or ")
        ?? null,
      nationality: COUNTRY_NAME[String(eligibility?.nationality ?? "").toUpperCase()]
        ?? eligibility?.nationality ?? null,
    };

    const funnel = {
      alive: 0, place: 0, nationality: 0, licence: 0, other_eligibility: 0,
      profession: 0, level: 0, unknown: 0, scored: 0, presented: 0, no_line: 0,
      place_conditions: 0,
    };
    const survivors: any[] = [];

    for (const o of (opps ?? [])) {
      funnel.alive++;
      // Place means different things to different kinds; the kind's own row says which.
      const withKind = {
        ...o,
        location_sensitivity: sensitivityOf(sensitivity, (o as any).kind),
        level_gate_applies: levelGateApplies(levelApplies, (o as any).kind),
      };
      const licence = screen(withKind, eligibility, evidence);
      const routeIsSpecific = hasRoute(o, (o as any).issuer?.domain ?? null)
        && String((o as any).access_state ?? "") === "identified_route";
      const g = runGates(identity, withKind, licence, routeIsSpecific, { ladder, member: memberPlace });

      if (licence.conditions.length) funnel.place_conditions++;
      if (g.outcome === "rejected") {
        if (g.gate === "profession") funnel.profession++;
        else if (g.gate === "level") funnel.level++;
        else if (g.gate === "place") funnel.place++;
        else if (g.gate === "nationality") funnel.nationality++;
        else if (g.gate === "licence") funnel.licence++;
        else funnel.other_eligibility++;
      } else if (g.outcome === "unknown") funnel.unknown++;
      else { funnel.scored++; survivors.push({ o, g }); }

      const { error: upErr } = await admin.from("oe_matches").update({
        // Only a refusal carries a refusal sentence. An unknown is an open
        // investigation, not a verdict, and must not read like one.
        screen_gate: g.gate, screen_outcome: g.outcome,
        rejection_sentence: g.outcome === "rejected" ? g.sentence : null,

        role_profession: g.role_profession, profession_relation: g.profession_relation,
        profession_source: g.profession_source, profession_source_quote: g.profession_source_quote,
        grade_basis: g.grade_basis,
        employer_tier: g.employer_tier, level_direction: g.level_direction,
        standing_gap: g.standing_gap, screened_at: new Date().toISOString(),
        eligibility_outcome: licence.outcome, eligibility_fail: licence.fails,
        eligibility_unknowns: licence.unknowns, eligibility_conditions: licence.conditions,
        // A record cannot both pass the gate and carry a rejection. The screen
        // is the later word, so it closes the gate it just refused.
        // The screen is the one verdict on the gates, so it writes both sides
        // of it: a survivor passes, a refusal closes and falls to writing.
        ...(g.outcome === "rejected"
          ? { gate_passed: false, lane_final: "write" }
          : g.outcome === "survivor"
          ? { gate_passed: true }
          : {}),
        // The act lane is an intersection; a record he cannot hold leaves it.
        ...(licence.outcome === "excluded" ? { lane_final: "write" } : {}),
        ...(g.outcome === "survivor" ? {} : { presentation_line: null }),
      }).eq("user_id", userId).eq("opportunity_id", o.id);

      if (upErr) {
        await logEfError(admin, {
          function_name: FN, error: new Error(`screen write failed: ${upErr.message}`),
          severity: "error", context: { opportunity_id: o.id, user_id: userId },
        });
      }

      // an employer we could not place is an investigation, not a verdict
      if (g.outcome === "unknown") {
        await admin.from("oe_investigations").upsert({
          user_id: userId, opportunity_id: o.id, field: "employer_tier",
          status: "open", reason: g.sentence,
        }, { onConflict: "user_id,opportunity_id,field" });
      }

      // ── writing, judged separately and harder ──────────────────────────
      const w = writingStanding(identity, o, standsFace?.summary ?? null);
      // The row already exists from the four subject checks; this narrows it.
      await admin.from("oe_write_value").update({
        has_standing: w.has_standing, standing_reason: w.reason,
        ...(w.has_standing ? {} : { verdict: "discard", reason: w.reason }),
        assessed_at: new Date().toISOString(),
      }).eq("user_id", userId).eq("opportunity_id", o.id);
    }

    // ── THE PRESENTATION TEST — the last gate, and the real one ──────────
    const positionList = identity.positions.map((p) => `${p.title} at ${p.company}`);
    if (withLines && lovableKey) {
      for (const { o, g } of survivors.slice(0, lineBudget)) {
        let line: string | null = null;
        let position: string | null = null;
        try {
          const ev = (o as any).scope_evidence ?? null;
          const stated: string[] = Array.isArray(ev?.stated_requirements) ? ev.stated_requirements : [];
          const fromRecord: string[] = Array.isArray((o as any).requirements)
            ? (o as any).requirements.map((r: any) => String(r?.text ?? r ?? "")).filter(Boolean)
            : [];
          const out = await askForLine(lovableKey, JSON.stringify({
            first_name: String(identity.positions[0]?.title ?? "").split(" ")[0] && (body.first_name ?? "He"),
            positions: identity.positions.map((p) => ({
              position: `${p.title} at ${p.company}`, period: [p.started, p.ended].filter(Boolean).join(" to "),
              function: p.profession, standing: p.grade_label,
            })),
            // what he actually ran, not how long he has worked
            his_scope: identity.scope_evidence.slice(0, 10),
            qualifications: identity.qualifications.slice(0, 6),
            opportunity: {
              title: o.title, scope: o.scope, sector: o.sector, issuer: o.issuer_raw,
              stated_requirements: (stated.length ? stated : fromRecord).slice(0, 10),
              states: ev
                ? {
                  reports_to: ev.reports_to?.value ?? null,
                  direct_reports: ev.direct_reports?.value ?? null,
                  organisational_scope: ev.organisational_scope?.value ?? null,
                  decision_rights: ev.decision_rights?.value ?? null,
                  accountability: (ev.accountability_sentences ?? []).slice(0, 5),
                }
                : null,
            },
            relation: g.profession_relation, bridge: g.bridge,
          }));
          line = out.line; position = out.position;
        } catch (e) {
          await logEfError(admin, {
            function_name: FN, error: e as Error, severity: "warn",
            context: { stage: "presentation_line", opportunity_id: o.id },
          });
        }
        // The line must rest on a position he actually held, quoted back. The
        // position must still be one of his own; only spacing, punctuation and
        // case are forgiven, so a real position is not thrown away over a comma.
        const norm = (s: string) =>
          s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
        const want = position ? norm(String(position)) : "";
        const grounded = !!line && !!want
          && positionList.some((p) => {
            const held = norm(p);
            return held === want || held.includes(want) || want.includes(held);
          });
        if (grounded) { funnel.presented++; } else {
          funnel.no_line++;
          if (line || position) {
            await logEfError(admin, {
              function_name: FN, error: new Error("presentation line not grounded"),
              severity: "warn",
              context: { opportunity_id: o.id, returned_position: position, held: positionList },
            });
          }
          line = null;
        }
        await admin.from("oe_matches").update({
          presentation_line: grounded ? line : null,
          ...(grounded ? {} : {
            screen_gate: "presentation", screen_outcome: "rejected",
            gate_passed: false, lane_final: "write",
            rejection_sentence: "No line — nothing in your history says, in one sentence, why you would be presented for this.",
          }),
        }).eq("user_id", userId).eq("opportunity_id", o.id);

      }
    }

    await admin.from("ef_error_log").insert({
      function_name: FN, user_id: userId, severity: "info",
      error_message: `OE_SCREEN_OK ${JSON.stringify(funnel)}`,
      context: funnel,
    });

    return json({ ok: true, funnel, identity: identity.highest_standing });
  } catch (e) {
    await logEfError(admin, { function_name: FN, error: e as Error, severity: "error", context: { user_id: userId } });
    return json({ error: (e as Error).message }, 500);
  }
});
