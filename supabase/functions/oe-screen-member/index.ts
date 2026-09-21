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
import {
  deriveIdentity, runGates, writingStanding,
  type LadderRow, type MemberIdentity, type MemberEvidenceRow,
} from "../_shared/oeScreen.ts";
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

/**
 * THE PRESENTATION LINE IS A MATCH, NOT A DESCRIPTION.
 *
 * It is not written from his title and it is not written from prose. It is one
 * stated requirement of the posting set against one claim his own record makes,
 * with the row that proves the claim cited beside it. The model's only job is
 * to say which requirement is answered by which evidence row; the sentence is
 * composed here, from their own words.
 */
const PRESENTATION_SYSTEM =
  "You are a search consultant deciding whether a professional can be presented for one opportunity. " +
  "You receive the requirements the opportunity STATES, and a numbered list of evidence rows — each one a " +
  "claim this professional's own record makes about him, with the quote that proves it. " +
  "Pair a requirement with an evidence row ONLY when the evidence plainly answers that requirement. " +
  "Return strict JSON {matches: [{requirement: string, evidence_id: string}]}. " +
  "requirement must be copied character for character from the stated requirements. " +
  "evidence_id must be copied character for character from the evidence rows given. " +
  "Never pair on a shared word or a shared sector — the evidence must answer the requirement. " +
  "If nothing answers anything, return {matches: []}. Never invent evidence.";

/** One streamed call. Reasoning models run for minutes; never buffer, never time out on a timer. */
async function askForLine(
  key: string,
  payload: string,
): Promise<{ matches: Array<{ requirement: string; evidence_id: string }> }> {
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
          name: "presentation_matches",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              matches: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    requirement: { type: "string" },
                    evidence_id: { type: "string" },
                  },
                  required: ["requirement", "evidence_id"],
                },
              },
            },
            required: ["matches"],
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
    return { matches: Array.isArray(parsed?.matches) ? parsed.matches : [] };
  } catch {
    return { matches: [] };
  }
}

/**
 * WHAT IS STILL MISSING, AND WHETHER HE COULD ANSWER IT IN ONE LINE.
 * A requirement about a team, a budget, a qualification or a sector is a
 * question a man answers in a sentence. Anything else is not asked.
 */
const ANSWERABLE: Array<[string, RegExp]> = [
  ["team_size", /\bteam|people|staff|direct reports|headcount|lead(ing)? a team|manage(d|ment of)? (a )?team/i],
  ["budget_or_pnl", /\bbudget|p&l|profit and loss|revenue|contract value|spend|portfolio value|\bsar\s?\d|\busd\s?\d/i],
  ["qualification", /\bdegree|bachelor|master|mba|phd|certifi|chartered|accredit|licen[cs]e|pmp|prince2|cfa|cpa/i],
  ["sector_delivered", /\bsector|industry|experience in (the )?[a-z ]{3,30} (sector|industry)|healthcare|utilities|banking|government|public sector|energy|education/i],
];

const r_trim = (s: string) => String(s ?? "").replace(/\s+/g, " ").trim();

function answerableKind(requirement: string): string | null {
  for (const [kind, re] of ANSWERABLE) if (re.test(String(requirement ?? ""))) return kind;
  return null;
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

    // ── what his OWN RECORD states about him, extracted once and stored ──
    const { data: evidenceRows } = await admin
      .from("oe_member_evidence")
      .select("id, kind, claim, quote, position_ref, confidence, source_table")
      .eq("user_id", userId).is("superseded_by", null)
      .order("confidence", { ascending: false }).limit(300);
    const memberEvidence = (evidenceRows ?? []) as MemberEvidenceRow[];

    const identity: MemberIdentity = deriveIdentity(snap, ladder, memberEvidence);
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
        // A survivor is proposed for the act lane; the access trigger is the
        // one that decides whether it may stay there, and drops it to writing
        // when there is no door the member can actually walk through.
        ...(g.outcome === "rejected"
          ? { gate_passed: false, lane_final: "write" }
          : g.outcome === "survivor"
          ? { gate_passed: true, lane_final: "act" }
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
    // One requirement the posting STATES, set against one claim his own record
    // makes, with the row that proves it cited beside it. No match, no line.
    const evidenceById = new Map(memberEvidence.map((r) => [String(r.id), r]));
    // Has a question already been put to him today? At most one, ever, per day.
    const today = new Date().toISOString().slice(0, 10);
    const { count: askedToday } = await admin
      .from("oe_investigations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("asked_on", today);
    let mayAsk = (askedToday ?? 0) === 0;

    if (withLines && lovableKey) {
      for (const { o, g } of survivors.slice(0, lineBudget)) {
        const ev = (o as any).scope_evidence ?? null;
        const stated: string[] = Array.isArray(ev?.stated_requirements) ? ev.stated_requirements : [];
        const fromRecord: string[] = Array.isArray((o as any).requirements)
          ? (o as any).requirements.map((r: any) => String(r?.text ?? r ?? "")).filter(Boolean)
          : [];
        const requirements = (stated.length ? stated : fromRecord).slice(0, 10);

        let matches: Array<{ requirement: string; evidence_id: string }> = [];
        if (requirements.length && memberEvidence.length) {
          try {
            const out = await askForLine(lovableKey, JSON.stringify({
              opportunity: {
                title: o.title, scope: o.scope, sector: o.sector, issuer: o.issuer_raw,
                stated_requirements: requirements,
              },
              // His own record, each row with the id that must be cited back.
              evidence: memberEvidence.slice(0, 80).map((r) => ({
                evidence_id: r.id, kind: r.kind, claim: r.claim,
                quote: String(r.quote).slice(0, 300), position: r.position_ref,
              })),
              relation: g.profession_relation, bridge: g.bridge,
            }));
            matches = Array.isArray(out.matches) ? out.matches : [];
          } catch (e) {
            await logEfError(admin, {
              function_name: FN, error: e as Error, severity: "warn",
              context: { stage: "presentation_line", opportunity_id: o.id },
            });
          }
        }

        // A pair counts only when BOTH halves are real: the requirement copied
        // from the posting, the evidence row one of his own.
        const kept = matches
          .map((m) => ({ m, row: evidenceById.get(String(m.evidence_id)) }))
          .filter((x) => !!x.row && requirements.some((r) => r.trim() === String(x.m.requirement).trim()))
          .slice(0, 2);

        // His record speaks of him in the third person; the line speaks TO him.
        // Drop the pronoun, then put the verb that followed it into "you" form.
        const IRREGULAR: Record<string, string> = {
          has: "have", is: "are", was: "were", does: "do", "hasn't": "haven't",
        };
        const toYou = (verb: string) => {
          const low = verb.toLowerCase();
          if (IRREGULAR[low]) return IRREGULAR[low];
          // A present-tense third-person verb ends in s; a past tense does not.
          if (/^[a-z]+(?:ie|e|[a-z])s$/.test(low) && !/(ss|us|is)$/.test(low)) {
            return low.endsWith("ies") ? `${low.slice(0, -3)}y` : low.endsWith("hes") || low.endsWith("oes") ? low.slice(0, -2) : low.slice(0, -1);
          }
          return low;
        };
        const youSay = (claim: string) => {
          const c = r_trim(claim).replace(/[.\s]+$/, "");
          const m = c.match(/^(?:he|the member|mohammad)\s+([A-Za-z']+)\b(.*)$/i);
          if (m) return `${toYou(m[1])}${m[2]}`;
          return c.replace(/^(?:he|the member|mohammad)\s+/i, "");
        };
        const asked = (requirement: string) => {
          const r = r_trim(requirement).replace(/^[-•*]\s*/, "");
          return r.length > 140 ? `${r.slice(0, 137)}…` : r;
        };
        const line = kept.length
          ? kept.map(({ m, row }) =>
            `This asks for ${asked(m.requirement)}; you ${youSay(row!.claim)}${row!.position_ref ? ` — ${row!.position_ref}` : ""}.`
          ).join(" ")
          : null;
        const citedIds = kept.map(({ row }) => row!.id);
        const grounded = !!line;

        if (grounded) funnel.presented++; else funnel.no_line++;

        await admin.from("oe_matches").update({
          presentation_line: line,
          presentation_evidence_ids: citedIds,
          ...(grounded ? {} : {
            screen_gate: "presentation", screen_outcome: "rejected",
            gate_passed: false, lane_final: "write",
            rejection_sentence: "No line — nothing in your record answers anything this one asks for.",
          }),
        }).eq("user_id", userId).eq("opportunity_id", o.id);

        // ── WHAT IS STILL MISSING, ASKED ON THE CARD, ONE LINE ────────────
        if (grounded && mayAsk) {
          const answered = new Set(kept.map(({ m }) => r_trim(m.requirement)));
          const gap = requirements
            .map((r) => ({ r, kind: answerableKind(r) }))
            .find((x) => x.kind && !answered.has(r_trim(x.r)));
          if (gap) {
            const { error: invError } = await admin.from("oe_investigations").upsert({
              user_id: userId, opportunity_id: o.id, field: gap.kind!,
              status: "open", asked_on: today,
              reason: `Stated requirement with no matching evidence: ${r_trim(gap.r)}`,
              member_question: `This asks for ${asked(gap.r)} — does your record cover it?`,
            }, { onConflict: "user_id,opportunity_id,field" });
            if (!invError) mayAsk = false;
          }
        }
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
