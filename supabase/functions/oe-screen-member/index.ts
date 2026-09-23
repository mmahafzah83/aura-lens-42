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
import { withRun } from "../_shared/oeRun.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { logEfError } from "../_shared/observe.ts";
import { logAIFailure, logAIUsage } from "../_shared/logAIUsage.ts";
import { secondPersonClause } from "../_shared/secondPerson.ts";
import { bestStanding, writeTests } from "../_shared/writeValue.ts";
import { interestOf } from "../_shared/interest.ts";
import { hasRoute, screen, type Eligibility } from "../_shared/oeEligibility.ts";
import {
  deriveIdentity, runGates, writingStanding, recencyWeight,
  type CurrentIdentity, type LadderRow, type MemberIdentity, type MemberEvidenceRow,
} from "../_shared/oeScreen.ts";
import {
  loadLocationSensitivity, sensitivityOf, loadLevelGateApplies, levelGateApplies,
} from "../_shared/oeKinds.ts";
import { modelFor } from "../_shared/models.ts";

const normRole = (s: string) => String(s ?? "").toLowerCase().replace(/[^a-z0-9\u0600-\u06ff ]+/g, " ").replace(/\s+/g, " ").trim();

const FN = "oe-screen-member";

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

/**
 * A call that did not come back with an answer. It is NOT a negative result:
 * nothing may be concluded about the member's record from a gateway failure.
 */
export class GatewayFailure extends Error {
  kind: "payment_required" | "rate_limited" | "timeout" | "transport";
  constructor(kind: GatewayFailure["kind"], message: string) {
    super(message);
    this.kind = kind;
  }
}

const failureKind = (e: unknown): GatewayFailure["kind"] => {
  if (e instanceof GatewayFailure) return e.kind;
  const m = String((e as Error)?.message ?? e);
  if (/\b402\b|payment/i.test(m)) return "payment_required";
  if (/\b429\b|rate.?limit/i.test(m)) return "rate_limited";
  if (/timeout|timed out|aborted/i.test(m)) return "timeout";
  return "transport";
};

/** One chat/completions call on the standard model. Same schema, not streamed. */
async function askForLine(
  key: string,
  model: string,
  payload: string,
): Promise<{
  matches: Array<{ requirement: string; evidence_id: string }>;
  usage: { input_tokens: number; output_tokens: number };
}> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: PRESENTATION_SYSTEM },
        { role: "user", content: payload },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
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
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    const kind = res.status === 402
      ? "payment_required"
      : res.status === 429
      ? "rate_limited"
      : res.status === 408 || res.status === 504
      ? "timeout"
      : "transport";
    throw new GatewayFailure(kind, `gateway ${res.status}: ${body}`);
  }

  const data = await res.json().catch(() => null);
  const u = data?.usage ?? null;
  const usage = {
    input_tokens: Number(u?.prompt_tokens ?? u?.input_tokens ?? 0) || 0,
    output_tokens: Number(u?.completion_tokens ?? u?.output_tokens ?? 0) || 0,
  };

  /* AN EMPTY OR UNPARSEABLE BODY IS NOT AN EMPTY RESULT. Returning {matches: []}
     here would let a broken call be read as "his record answers nothing". */
  const trimmed = String(data?.choices?.[0]?.message?.content ?? "").trim();
  if (!trimmed) throw new GatewayFailure("transport", "empty response: no output text");
  let parsed: any;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new GatewayFailure("transport", "malformed response: output is not JSON");
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.matches)) {
    throw new GatewayFailure("transport", "malformed response: no matches array");
  }
  return { matches: parsed.matches, usage };
}

/* ── THE MEMBER'S OWN EMPLOYER, AND AGENCY LISTINGS ──────────────────────────
   Two cheap deterministic tests, run before any model call so no money is spent
   judging a record that is going to be excluded anyway. Nothing here names a
   firm: the member's employer is read from his profile, the agency list from
   the active policy row. */

const LEGAL_NOISE =
  /\b(llp|llc|ltd|limited|inc|incorporated|plc|co|company|corp|corporation|group|holdings|holding|global|international|worldwide|gmbh|ag|sa|sarl|bv|nv|pjsc|jsc|psc|wll|fzco|fze|llc'?s)\b/g;
const STOPWORD = new Set(["and", "the", "of", "for", "de", "du"]);

function normFirm(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(LEGAL_NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Word-boundary containment, so "ey" never matches inside "money". */
function containsPhrase(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false;
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^| )${esc}( |$)`).test(haystack);
}

/** "ernst and young" → "ey", so an acronym employer still matches its long form. */
function initialsOf(normalised: string): string {
  const parts = normalised.split(" ").filter((t) => t && !STOPWORD.has(t));
  return parts.length >= 2 ? parts.map((t) => t[0]).join("") : "";
}

export function sameEmployer(issuer: unknown, employer: unknown): boolean {
  const a = normFirm(issuer);
  const b = normFirm(employer);
  if (!a || !b) return false;
  if (a === b) return true;
  if (containsPhrase(a, b) || containsPhrase(b, a)) return true;
  const ia = initialsOf(a);
  const ib = initialsOf(b);
  if (ia && ia === b) return true;
  if (ib && ib === a) return true;
  return false;
}

export function matchedAgency(issuer: unknown, agencies: unknown[]): string | null {
  const a = normFirm(issuer);
  if (!a) return null;
  for (const raw of agencies ?? []) {
    const n = normFirm(raw);
    if (n && containsPhrase(a, n)) return String(raw);
  }
  return null;
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

/**
 * A stated PRICE — the cost of the door. Only a requirement that carries an
 * actual amount counts: a sentence that merely mentions a fee alongside real
 * conditions is still a condition, and his record may answer it.
 */
const IS_A_PRICE =
  /(?:\$|£|€|﷼|\bUSD\b|\bSAR\b|\bAED\b|\bEUR\b)\s?[\d,]{3,}|[\d,]{3,}\s?(?:USD|SAR|AED|EUR|riyals?|dollars?)\b/i;

function answerableKind(requirement: string): string | null {
  for (const [kind, re] of ANSWERABLE) if (re.test(String(requirement ?? ""))) return kind;
  return null;
}

Deno.serve(withRun("screen_member", async (req) => {
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
      // Only his own record. A captured third-party page is reading material.
      .eq("user_id", userId).eq("own_record", true).is("superseded_by", null)
      .order("confidence", { ascending: false }).limit(300);

    const memberEvidence = (evidenceRows ?? []) as MemberEvidenceRow[];

    const identity: MemberIdentity = deriveIdentity(snap, ladder, memberEvidence);
    if (!identity.positions.length) throw new Error("profile snapshot holds no positions");

    // ── WHO WE MATCH HIM AS: the current role, resolved in SQL ──────────
    // The current role defines the search; every earlier role is evidence,
    // weighted by how long ago it ended (half-life five years).
    const { data: idRow } = await admin.from("oe_identity")
      .select("current_title, current_employer, market_level, status, source_date")
      .eq("user_id", userId).maybeSingle();
    const { data: dirRow } = await admin.from("oe_direction")
      .select("move_kind").eq("user_id", userId).maybeSingle();
    const current: CurrentIdentity | null = idRow?.market_level ? {
      market_level: idRow.market_level, title: idRow.current_title, employer: idRow.current_employer,
      status: idRow.status, step_up: (dirRow as any)?.move_kind === "step_up",
    } : null;
    const weightOf = new Map<string, number>();
    for (const p of identity.positions as any[]) {
      p.weight = recencyWeight(p.ended);
      weightOf.set(`${p.title} at ${p.company}`, p.weight);
    }
    const w = (ref: string) => {
      for (const [k, v] of weightOf) if (ref.startsWith(k)) return v;
      return 0.5;
    };
    for (const prof of identity.professions) prof.positions.sort((a, b) => w(b) - w(a));
    identity.professions.sort((a, b) => w(b.positions[0] ?? "") - w(a.positions[0] ?? ""));
    identity.sectors_delivered.sort((a, b) => w(b.position) - w(a.position));
    identity.scope_evidence.sort((a, b) => w(b.position) - w(a.position));
    const currentRef = current?.title ? `${current.title}${current.employer ? ` at ${current.employer}` : ""}` : null;
    if (current?.title) {
      const held = (identity.positions as any[]).find((p) => p.weight === 1
        && String(p.title).toLowerCase() === String(current.title).toLowerCase()) ?? null;
      identity.highest_standing = {
        ...identity.highest_standing,
        title: current.title, company: current.employer,
        period: held?.started ? `${held.started} to now` : "now",
      };
    }

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
    // No place chosen is not "anywhere": full-time seats default to home and
    // home's first region, read from the reference tables (oe_default_places).
    if (eligibility && !(eligibility.countries_allowed ?? []).length && eligibility.residence_country) {
      const { data: defaults } = await admin.rpc("oe_default_places", { p_residence: eligibility.residence_country });
      if (Array.isArray(defaults) && defaults.length) eligibility.countries_allowed = defaults as string[];
    }
    const { data: profile } = await admin.from("diagnostic_profiles")
      .select("years_experience, core_practice, firm").eq("user_id", userId).maybeSingle();
    const ownEmployer = String((profile as any)?.firm ?? "").trim();
    const yearsMatch = /(\d{1,2})/.exec(String((profile as any)?.years_experience ?? ""));
    const evidence = {
      years_experience: yearsMatch ? Number(yearsMatch[1]) : null,
      practice: (profile as any)?.core_practice ?? null,
      sectors: eligibility?.sectors_core ?? null,
    };
    const { data: standsFace } = await admin.from("oe_faces")
      .select("summary").eq("user_id", userId).eq("face", "stands").maybeSingle();

    // ── WHAT HE READS AND WANTS — ranking only, never proof, never a gate ──
    const { data: interestFaces } = await admin.from("oe_faces")
      .select("face, summary, keywords").eq("user_id", userId).in("face", ["reads", "wants"]);
    const { data: captureRows } = await admin.from("entries")
      .select("title, summary, content, created_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(400);

    // ── one small batch of live records ──────────────────────────────────
    // Never-screened first, executive roles first, newest first — picked in
    // SQL so the worker never loads the whole table into memory.
    const screenBatch = Math.max(1, Math.min(Number(body.batch ?? 20) || 20, 60));
    const { data: batchIds, error: batchErr } = await admin.rpc("oe_screen_batch", {
      p_user: userId, p_limit: screenBatch,
    });
    if (batchErr) throw new Error(`screen batch: ${batchErr.message}`);
    const ids = ((batchIds ?? []) as any[]).map((r) => String(r.opportunity_id));
    const opps: any[] = [];
    if (ids.length) {
      const { data: oppRows, error: oppsError } = await admin.from("oe_opportunities")
        .select("id, kind, title, scope, sector, chair_type, level_band, location, remote, requirements, scope_evidence, issuer_raw, route_url, route_kind, route_dead, access_state, issuer:oe_issuers(domain)")
        .in("id", ids).eq("alive", true);
      if (oppsError) throw new Error(`alive opportunities: ${oppsError.message}`);
      const byId = new Map((oppRows ?? []).map((o: any) => [String(o.id), o]));
      for (const id of ids) { const o = byId.get(id); if (o) opps.push(o); }
    }

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
      place_conditions: 0, own_employer: 0, agency: 0, gateway_unknown: 0, spend_capped: 0,
    };
    const survivors: any[] = [];
    /* Excluded before any model saw them; they are not writing material either. */
    const excludedIds = new Set<string>();

    // THE TWO JUDGES MUST AGREE. The rubric already written on the match is
    // read here, so the screen cannot promote to the act lane a record the
    // rubric has refused — eligibility not met, an average under the gate, or
    // a zero on a criterion that may not be zero.
    const { data: policyRow } = await admin.from("oe_policy_versions")
      .select("params").eq("active", true).maybeSingle();
    const policyParams = (policyRow?.params ?? {}) as Record<string, any>;
    // THE BAR IS MEASURED, NOT TASTED. It is the threshold that did best on
    // this member's own answers; with too few answers, the shared one; with
    // neither, the policy default.
    const { data: calibration } = await admin.from("oe_calibration")
      .select("user_id, threshold")
      .or(`user_id.eq.${userId},user_id.is.null`);
    const ownBar = (calibration ?? []).find((r: any) => r.user_id === userId)?.threshold;
    const sharedBar = (calibration ?? []).find((r: any) => r.user_id === null)?.threshold;
    const gateMin = Number(ownBar ?? sharedBar ?? policyParams.gate_min_avg ?? 3.0);
    // Only these kinds are act-lane records. A role is judged on requirements,
    // level, field and a real door — never on writing tests.
    const actKinds = new Set<string>(
      Array.isArray(policyParams.card_kinds) && policyParams.card_kinds.length
        ? policyParams.card_kinds.map(String)
        : ["executive_role"],
    );
    // The model is a policy value, refused if it is not on the allow-list.
    const MODEL = modelFor("screen_presentation", policyParams);
    const excludeOwnEmployer = policyParams.exclude_own_employer === true;
    const enforceAgencyFilter = policyParams.enforce_agency_filter === true;
    const agencyIssuers: string[] = Array.isArray(policyParams.agency_issuers) ? policyParams.agency_issuers : [];

    const { data: scoreRows } = ids.length
      ? await admin.from("oe_matches").select("opportunity_id, scores").eq("user_id", userId).in("opportunity_id", ids)
      : { data: [] as any[] };
    const scoresById = new Map<string, any>();
    for (const row of scoreRows ?? []) scoresById.set(String(row.opportunity_id), row.scores);
    const rubricVerdict = (oppId: string): { refuses: boolean; gap: string } => {
      const scores = scoresById.get(oppId);
      const passes = Array.isArray(scores?.passes) ? scores.passes : [];
      if (!passes.length) return { refuses: false, gap: "" };
      const notMet = passes.find((p: any) => p?.eligibility_met === false);
      const avg = Number(scores?.score_avg ?? NaN);
      const zero = passes.some((p: any) => Array.isArray(p?.gate_no_zero)
        && p.gate_no_zero.some((c: string) => Number(p?.criteria?.[c] ?? 1) === 0));
      const refuses = Boolean(notMet) || (Number.isFinite(avg) && avg < gateMin) || zero;
      const gap = String(notMet?.gap ?? scores?.gap ?? "").trim();
      return { refuses, gap };
    };


    for (const o of (opps ?? [])) {
      funnel.alive++;

      /* WHERE HE ALREADY WORKS IS NOT AN OPPORTUNITY, AND AN AGENCY IS NOT A
         DOOR. Both tests are deterministic and run before any model call. */
      const agencyHit = enforceAgencyFilter ? matchedAgency((o as any).issuer_raw, agencyIssuers) : null;
      const ownEmployerHit = excludeOwnEmployer && !agencyHit
        && sameEmployer((o as any).issuer_raw, ownEmployer);
      if (agencyHit || ownEmployerHit) {
        if (ownEmployerHit) funnel.own_employer++; else funnel.agency++;
        excludedIds.add(String(o.id));
        const { error: exErr } = await admin.from("oe_matches").update({
          screen_gate: ownEmployerHit ? "employer" : "issuer",
          screen_outcome: "rejected",
          gate_note: ownEmployerHit ? "own_employer" : "agency",
          gate_passed: false, lane_final: null,
          presentation_line: null,
          rejection_sentence: ownEmployerHit
            ? `You already work at ${String((o as any).issuer_raw ?? ownEmployer).trim()}.`
            : "This is an agency listing, not a direct door to the organisation.",
          screened_at: new Date().toISOString(),
        }).eq("user_id", userId).eq("opportunity_id", o.id);
        if (exErr) {
          await logEfError(admin, {
            function_name: FN, error: new Error(`exclusion write failed: ${exErr.message}`),
            severity: "error", context: { opportunity_id: o.id, user_id: userId },
          });
        }
        continue;
      }
      // A PROGRAMME IS NOT A SEAT. Degrees, courses, internships, cohorts and
      // talent pools are kept in Found under their own heading, never carded.
      if (String((o as any).kind ?? "") === "programme") {
        funnel.other_eligibility++;
        excludedIds.add(String(o.id));
        const { error: pgErr } = await admin.from("oe_matches").update({
          screen_gate: "other", screen_outcome: "rejected", gate_note: "programme",
          gate_passed: false, lane_final: null, presentation_line: null,
          rejection_sentence: "This is a programme, not a seat.",
          screened_at: new Date().toISOString(),
        }).eq("user_id", userId).eq("opportunity_id", o.id);
        if (pgErr) {
          await logEfError(admin, {
            function_name: FN, error: new Error(`programme write failed: ${pgErr.message}`),
            severity: "error", context: { opportunity_id: o.id, user_id: userId },
          });
        }
        continue;
      }
      // KIND IS NOT A PASS. A kind may relax place or level only when the
      // record's access state was actually established. A record that claims a
      // relaxed kind while stating no access state is a mis-kinded listing: it
      // is screened as an ordinary seat and the doubt is recorded.
      const stateSet = Boolean(String((o as any).access_state ?? "").trim());
      const kindUnverified = !stateSet
        && (sensitivityOf(sensitivity, (o as any).kind) !== "hard"
          || levelGateApplies(levelApplies, (o as any).kind) === false);
      const withKind = {
        ...o,
        location_sensitivity: stateSet ? sensitivityOf(sensitivity, (o as any).kind) : "hard",
        level_gate_applies: stateSet ? levelGateApplies(levelApplies, (o as any).kind) : true,
      };
      const licence = screen(withKind, eligibility, evidence);
      const routeIsSpecific = hasRoute(o, (o as any).issuer?.domain ?? null)
        && String((o as any).access_state ?? "") === "identified_route";

      const g = runGates(identity, withKind, licence, routeIsSpecific, { ladder, member: memberPlace, current });

      // The rubric's own refusal stands, and it is the rubric's own sentence
      // the member reads.
      if (g.outcome === "survivor") {
        const verdict = rubricVerdict(String(o.id));
        if (verdict.refuses) {
          (g as any).outcome = "rejected";
          (g as any).gate = "rubric";
          const gap = verdict.gap ? secondPersonClause(verdict.gap) : "the requirements of this role are not met on your record";
          (g as any).sentence = gap.charAt(0).toUpperCase() + gap.slice(1);
        }
      }



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
        // Layer two of three. It orders the shelf; it never opens a door.
        interest: interestOf(o as any, (interestFaces ?? []) as any, (captureRows ?? []) as any),
        rejection_sentence: g.outcome === "rejected" ? g.sentence : null,

        role_profession: g.role_profession, profession_relation: g.profession_relation,
        profession_source: g.profession_source, profession_source_quote: g.profession_source_quote,
        grade_basis: g.grade_basis,
        gate_note: kindUnverified ? "kind_unverified" : (g as any).gate_note ?? null,
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
        // WHAT FAILS THE ACT LANE IS NOT WRITING MATERIAL. The lane is cleared
        // here and only the four writing tests below may set it to 'write'.
        ...(g.outcome === "rejected"
          ? { gate_passed: false, lane_final: null }
          : g.outcome === "survivor"
          ? { gate_passed: true, lane_final: "act" }
          : {}),
        // The act lane is an intersection; a record he cannot hold leaves it.
        ...(licence.outcome === "excluded" ? { lane_final: null } : {}),
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

    /* SPEND IS CHECKED BEFORE THE BATCH, NOT AFTER IT. A stage that cannot be
       paid for makes no calls, and the records it would have read stay unknown. */
    let spendAllowed = true;
    if (withLines && lovableKey) {
      const { data: spend } = await admin.rpc("oe_spend_allowed", {
        p_stage: "screen_presentation",
        p_estimate: Math.min(survivors.length, lineBudget) * 0.0015,
      });
      spendAllowed = (spend as any)?.allowed !== false;
      if (!spendAllowed) {
        await admin.from("ef_error_log").insert({
          function_name: FN, user_id: userId, severity: "warn",
          error_message: "Daily spend ceiling reached: no presentation calls this run",
          context: { stage: "screen_presentation", spend },
        });
      }
    }

    /* An answer we never bought is not a negative answer. */
    const markUnknown = async (oppId: string, note: string) => {
      await admin.from("oe_matches").update({
        screen_outcome: "unknown", gate_note: note, screened_at: new Date().toISOString(),
      }).eq("user_id", userId).eq("opportunity_id", oppId);
    };

    if (withLines && lovableKey && !spendAllowed) {
      for (const { o } of survivors.slice(0, lineBudget)) {
        funnel.spend_capped++;
        await markUnknown(String(o.id), "spend_cap");
      }
    }

    if (withLines && lovableKey && spendAllowed) {
      for (const { o, g } of survivors.slice(0, lineBudget)) {
        const ev = (o as any).scope_evidence ?? null;
        const stated: string[] = Array.isArray(ev?.stated_requirements) ? ev.stated_requirements : [];
        const fromRecord: string[] = Array.isArray((o as any).requirements)
          ? (o as any).requirements.map((r: any) => String(r?.text ?? r ?? "")).filter(Boolean)
          : [];
        // A price is the cost of the door, not something his record can answer.
        // It is carried on the record as cost_of_door and never matched here.
        const requirements = (stated.length ? stated : fromRecord)
          .filter((r) => !IS_A_PRICE.test(String(r)))
          .slice(0, 10);

        let matches: Array<{ requirement: string; evidence_id: string }> = [];
        if (requirements.length && memberEvidence.length) {
          try {
            const out = await askForLine(lovableKey, MODEL, JSON.stringify({
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
            matches = out.matches;
            await logAIUsage({
              user_id: userId, function_name: FN, provider: "lovable", model: MODEL,
              input_tokens: out.usage.input_tokens, output_tokens: out.usage.output_tokens,
              success: true,
              metadata: { stage: "screen_presentation", opportunity_id: o.id },
            });
          } catch (e) {
            /* A GATEWAY FAILURE IS NOT A VERDICT ON HIS RECORD. No rejection
               sentence, no lane change, no gate rewritten — it is read again. */
            const kind = failureKind(e);
            await logAIFailure({
              user_id: userId, function_name: FN, provider: "lovable", model: MODEL,
              error_code: kind,
              metadata: { stage: "screen_presentation", opportunity_id: o.id },
            });
            await logEfError(admin, {
              function_name: FN, error: e as Error, severity: "warn",
              context: { stage: "presentation_line", opportunity_id: o.id, failure: kind },
            });
            funnel.gateway_unknown++;
            await markUnknown(String(o.id), kind);
            continue;
          }
        }

        // A pair counts only when BOTH halves are real: the requirement copied
        // from the posting, the evidence row one of his own.
        const kept = matches
          .map((m) => ({ m, row: evidenceById.get(String(m.evidence_id)) }))
          .filter((x) => !!x.row && requirements.some((r) => r.trim() === String(x.m.requirement).trim()))
          .slice(0, 2);

        // His record speaks of him in the third person; the line speaks TO him.
        // Deterministic, no model: drop the pronoun, carry the verb with it.
        const youSay = (claim: string) => secondPersonClause(claim);
        const asked = (requirement: string) => {
          const r = r_trim(requirement).replace(/^[-•*]\s*/, "");
          return r.length > 140 ? `${r.slice(0, 137)}…` : r;
        };
        const line = kept.length
          ? kept.map(({ m, row }) =>
            `This asks for ${asked(m.requirement)}; ${youSay(row!.claim)}${row!.position_ref
              ? (currentRef && normRole(row!.position_ref).startsWith(normRole(currentRef).split(" at ")[0]) && w(row!.position_ref) === 1
                ? ` — ${row!.position_ref}` : ` — earlier, ${row!.position_ref}`)
              : ""}.`
          ).join(" ")
          : null;
        const citedIds = kept.map(({ row }) => row!.id);
        const grounded = !!line;

        if (grounded) funnel.presented++; else funnel.no_line++;

        await admin.from("oe_matches").update({
          presentation_line: line,
          presentation_evidence_ids: citedIds,
          // Only a call that came back and genuinely matched nothing rejects here.
          ...(grounded ? {} : {
            screen_gate: "presentation", screen_outcome: "rejected",
            gate_passed: false, lane_final: null, gate_note: "no_line",
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

    // ── THE WRITE LANE IS EARNED, NOT INHERITED ───────────────────────────
    // What fails the act lane is not writing material. Every candidate is put
    // through the four writing tests, and the standing sentence must be ABOUT
    // this record's subject. Anything else is discarded: no lane, no card.
    {
      const { data: writeRows } = ids.length
        ? await admin.from("oe_matches")
          .select("opportunity_id")
          .eq("user_id", userId).is("lane_final", null).in("opportunity_id", ids)
        : { data: [] as any[] };
      const { data: sectorRule } = await admin.from("oe_notebook")
        .select("values,value")
        .eq("user_id", userId).eq("field", "sector").eq("active", true)
        .eq("status", "active").maybeSingle();
      const preferredSectors: string[] = Array.isArray(sectorRule?.values)
        ? sectorRule!.values as string[]
        : sectorRule?.value ? [String(sectorRule.value)] : [];
      const oppById = new Map((opps ?? []).map((o: any) => [String(o.id), o]));

      for (const row of (writeRows ?? [])) {
        const o: any = oppById.get(String(row.opportunity_id));
        if (!o) continue;
        // Excluded before any model saw it; it is not writing material either.
        if (excludedIds.has(String(row.opportunity_id))) continue;
        // A ROLE IS NEVER REFUSED IN WRITING LANGUAGE. Its verdict stands as
        // the gates wrote it: requirements, level, field, a real door.
        if (actKinds.has(String(o.kind ?? ""))) continue;

        const best = bestStanding(o, memberEvidence);
        const standing = writingStanding(identity, o, standsFace?.summary ?? null);
        const tests = writeTests({ identity, opportunity: o, standing, best, preferredSectors });

        const note = (err: any, stage: string) => err && logEfError(admin, {
          function_name: FN, error: new Error(`${stage}: ${err.message}`), severity: "error",
          context: { opportunity_id: o.id, user_id: userId },
        });
        if (!tests.all_true) {
          const sentence = !best
            ? "presentation: no standing sentence"
            : !tests.subject_fits_audience.passed || !tests.fits_your_positioning.passed
            ? "writing: outside what you are known for"
            : "writing: nothing useful to add";
          /* THE GATE THAT ACTUALLY REFUSED IT KEEPS ITS NAME. This sweep stamps
             no screen_gate: profession, level, place or rubric stands as written. */
          await admin.from("oe_matches").update({
            write_tests: tests, standing_overlap: tests.overlap,
            presentation_line: null, presentation_evidence_ids: [],
            screen_outcome: "rejected", gate_passed: false,
            gate_note: "write_tests_failed",
            lane_final: null, rejection_sentence: sentence,
          }).eq("user_id", userId).eq("opportunity_id", o.id).then(({ error }) => note(error, "write discard"));
          continue;
        }

        const angle = `Your angle: ${secondPersonClause(best!.row.claim)}` +
          `${best!.row.position_ref ? ` — ${best!.row.position_ref}` : ""}.`;
        await admin.from("oe_matches").update({
          write_tests: tests, standing_overlap: tests.overlap,
          presentation_line: angle,
          presentation_evidence_ids: [best!.row.id],
          lane_final: "write",
          rejection_sentence: null,
        }).eq("user_id", userId).eq("opportunity_id", o.id).then(({ error }) => note(error, "write admit"));
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
}));
