/**
 * oe-sample-test — a read-only calibration.
 *
 * Five notice pages are fetched once, put through the engine's own chain —
 * kind classifier, licence and gates, scope extraction, requirement↔evidence
 * match, presentation line — and ONLY the answers to six questions are written,
 * to oe_investigations (kind='sample_test'). Nothing is stored in
 * oe_opportunities, oe_matches, oe_cards or oe_serves. No page text is kept.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { SCOPE_EVIDENCE_INSTRUCTION, verifyScopeEvidence } from "../_shared/scopeEvidence.ts";
import { secondPerson, secondPersonClause } from "../_shared/secondPerson.ts";
import { hasRoute, screen, type Eligibility } from "../_shared/oeEligibility.ts";
import {
  deriveIdentity, runGates,
  type LadderRow, type MemberEvidenceRow,
} from "../_shared/oeScreen.ts";
import {
  loadLocationSensitivity, sensitivityOf, loadLevelGateApplies, levelGateApplies,
} from "../_shared/oeKinds.ts";

const FN = "oe-sample-test";
const UA = "Mozilla/5.0 (compatible; AuraBot/1.0; +https://aura-intel.org/bot)";
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function titleOf(html: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? visibleText(m[1]).slice(0, 200) : "";
}
function parseJsonLoose(text: string): any {
  let t = (text || "").trim();
  if (t.startsWith("```")) t = t.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(t); } catch {
    const s = t.indexOf("{"), e = t.lastIndexOf("}");
    if (s >= 0 && e > s) return JSON.parse(t.slice(s, e + 1));
    return null;
  }
}

/** Deadline as the page states it: "Deadline ... 17-Jul-2026" and friends. */
function deadlineOf(text: string): string | null {
  const m = /(?:deadline|closing date|closes on|submission deadline)[^0-9]{0,40}(\d{1,2}[-\s/](?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-\s/]\d{4})/i.exec(text);
  if (!m) return null;
  const d = new Date(m[1].replace(/-/g, " "));
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

const FIRM = /\b(request for proposal|rfp|invitation to bid|itb|request for quotation|rfq|bidder|company profile|registered (company|firm)|consulting firm|legal entity)\b/i;
const INDIVIDUAL = /\b(individual consultant|individual contractor|ic\b|personal history form|p11|cv of the consultant|international consultant)\b/i;
const ROUTE = /\b(in-?tend|quantum|jaggaer|ariba|esourcing|ungm\.org|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})\b/i;
const REGISTRATION = /\b(register|registration|registered (on|with)|create an account|vendor registration|sign up)\b/i;

async function scopeExtract(key: string, title: string, url: string, text: string) {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You read one job posting, tender, call or notice and report only what it states. " +
            "Return strict JSON with a single key scope_evidence. " + SCOPE_EVIDENCE_INSTRUCTION,
        },
        { role: "user", content: `TITLE: ${title}\nURL: ${url}\n\nPAGE TEXT:\n${text.slice(0, 12_000)}` },
      ],
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!r.ok) throw new Error(`gateway ${r.status}`);
  const data = await r.json();
  const parsed = parseJsonLoose(data?.choices?.[0]?.message?.content || "");
  return verifyScopeEvidence(parsed?.scope_evidence ?? parsed, text);
}

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

async function askForLine(key: string, payload: string) {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: PRESENTATION_SYSTEM },
        { role: "user", content: payload },
      ],
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!r.ok) throw new Error(`gateway ${r.status}`);
  const data = await r.json();
  const out = parseJsonLoose(data?.choices?.[0]?.message?.content || "");
  return Array.isArray(out?.matches) ? out.matches as Array<{ requirement: string; evidence_id: string }> : [];
}

const IS_A_PRICE =
  /(?:\$|£|€|﷼|\bUSD\b|\bSAR\b|\bAED\b|\bEUR\b)\s?[\d,]{3,}|[\d,]{3,}\s?(?:USD|SAR|AED|EUR|riyals?|dollars?)\b/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const CRON_SECRET = Deno.env.get("cron_secret") || Deno.env.get("CRON_SECRET") || "";
  const cronHeader = req.headers.get("x-cron-secret") || "";
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!((!!CRON_SECRET && cronHeader === CRON_SECRET) || bearer === SERVICE_ROLE)) return json({ error: "Forbidden" }, 403);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const key = Deno.env.get("LOVABLE_API_KEY") ?? "";

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const userId = String(body.user_id ?? "");
  const source = String(body.source ?? "ungm");
  const urls: string[] = Array.isArray(body.urls) ? body.urls : [];
  if (!userId || !urls.length) return json({ error: "user_id and urls required" }, 400);

  try {
    // ── the member, exactly as the screen builds him ──────────────────────
    const { data: ladderRows } = await admin.from("oe_employer_ladder")
      .select("country, band, pattern, label_en, standing_bonus, active").eq("active", true);
    const ladder = (ladderRows ?? []) as LadderRow[];
    const sensitivity = await loadLocationSensitivity(admin);
    const levelApplies = await loadLevelGateApplies(admin);

    const { data: snap } = await admin.from("linkedin_profile_snapshots")
      .select("id, experience, education, certifications, skills, headline, about")
      .eq("user_id", userId).order("fetched_at", { ascending: false }).limit(1).maybeSingle();
    if (!snap) throw new Error("no profile snapshot");
    const { data: evidenceRows } = await admin.from("oe_member_evidence")
      .select("id, kind, claim, quote, position_ref, confidence, source_table")
      .eq("user_id", userId).is("superseded_by", null)
      .order("confidence", { ascending: false }).limit(300);
    const memberEvidence = (evidenceRows ?? []) as MemberEvidenceRow[];
    const evidenceById = new Map(memberEvidence.map((r) => [String(r.id), r]));
    const identity = deriveIdentity(snap, ladder, memberEvidence);

    const { data: eligRow } = await admin.from("oe_eligibility").select("*").eq("user_id", userId).maybeSingle();
    const eligibility = (eligRow ?? null) as Eligibility | null;
    const { data: profile } = await admin.from("diagnostic_profiles")
      .select("years_experience, core_practice").eq("user_id", userId).maybeSingle();
    const yearsMatch = /(\d{1,2})/.exec(String((profile as any)?.years_experience ?? ""));
    const memberEvidenceLicence = {
      years_experience: yearsMatch ? Number(yearsMatch[1]) : null,
      practice: (profile as any)?.core_practice ?? null,
      sectors: eligibility?.sectors_core ?? null,
    };

    const results: any[] = [];

    for (const url of urls) {
      const answers: any = { url };
      try {
        const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en" }, signal: AbortSignal.timeout(45_000) });
        const html = await res.text();
        const text = visibleText(html);
        const title = titleOf(html);
        const deadline = deadlineOf(text);
        answers.http_status = res.status;

        // ── Q1 · kind ──────────────────────────────────────────────────────
        const probe = {
          title, scope: text.slice(0, 4000), deadline,
          route_kind: "application", discovery_kind: "posted_opening",
          access_state: "identified_route", alive: true,
          raw: {}, evidence_quote: null, chair_type: null,
        };
        const { data: kindOut, error: kindErr } = await admin.rpc("oe_classify_kind_probe", { p: probe });
        const kind = kindErr ? null : String(kindOut ?? "");
        answers.q1_kind = {
          kind,
          answer: kind && ["mandate", "advisory_role", "consulting_engagement"].includes(kind) ? "yes" : "no",
          evidence: kindErr
            ? `classifier error: ${kindErr.message}`
            : `The classifier read the posting and returned ${kind}.`,
        };

        // ── Q2 · individual vs firm ────────────────────────────────────────
        const looksFirm = FIRM.test(text) && !INDIVIDUAL.test(text.slice(0, 6000));
        const looksIndividual = INDIVIDUAL.test(text);
        answers.q2_individual_vs_firm = {
          reads_as: looksIndividual ? "individual" : looksFirm ? "firm" : "unstated",
          routed_to_not_for_individuals: false,
          answer: "no",
          evidence: "The engine holds no individual-versus-firm test and no not_for_individuals route; " +
            `read deterministically here the notice reads as ${looksIndividual ? "an individual consultancy" : looksFirm ? "a firm tender" : "neither plainly"}.`,
        };

        // ── Q3 · gates ─────────────────────────────────────────────────────
        const opp: any = {
          id: null, kind: kind ?? "market_signal", title, scope: text.slice(0, 4000),
          sector: null, chair_type: null, level_band: null,
          location: null, remote: null, requirements: null, scope_evidence: null,
          issuer_raw: null, route_url: url, route_kind: "application", route_dead: false,
          access_state: "identified_route", deadline,
          location_sensitivity: sensitivityOf(sensitivity, kind ?? "market_signal"),
          level_gate_applies: levelGateApplies(levelApplies, kind ?? "market_signal"),
        };
        const licence = screen(opp, eligibility, memberEvidenceLicence);
        const routeIsSpecific = hasRoute(opp, null) && opp.access_state === "identified_route";
        const g = runGates(identity, opp, licence, routeIsSpecific, { ladder, member: {} as any });
        const past = !!deadline && deadline < new Date().toISOString().slice(0, 10);
        answers.q3_gates = {
          first_gate: g.gate, outcome: g.outcome, sentence: g.sentence,
          freshness_window: past ? "fail" : deadline ? "pass" : "not stated",
          answer: g.gate ? "yes" : "no",
          evidence: `${g.gate ?? "no"} gate returned ${g.outcome}: ${g.sentence ?? "no sentence"}. ` +
            (past
              ? "The stated closing date is in the past, so the freshness window fails — the engine has no separate already_happened gate; a past deadline fails the window check."
              : deadline ? "The stated closing date is still ahead." : "No closing date was stated on the page."),
        };

        // ── Q4 · scope ─────────────────────────────────────────────────────
        let scopeEv: any = null;
        if (key) { try { scopeEv = await scopeExtract(key, title, url, text); } catch (e) { answers.scope_error = String((e as Error).message); } }
        const found = scopeEv
          ? Object.keys(scopeEv).filter((k) => scopeEv[k] != null && k !== "stated_requirements")
          : [];
        answers.q4_scope = {
          fields_found: found,
          requirements_found: Array.isArray(scopeEv?.stated_requirements) ? scopeEv.stated_requirements.length : 0,
          answer: found.length || (scopeEv?.stated_requirements ?? []).length ? "yes" : "no",
          evidence: scopeEv
            ? `Scope extraction returned ${found.length} stated fields (${found.join(", ") || "none"}) and ${(scopeEv.stated_requirements ?? []).length} stated requirements, each quote-verified against the page.`
            : "Scope extraction found nothing the page states, or the extraction failed.",
        };

        // ── Q5 · evidence ──────────────────────────────────────────────────
        const requirements: string[] = (Array.isArray(scopeEv?.stated_requirements) ? scopeEv.stated_requirements : [])
          .filter((r: string) => !IS_A_PRICE.test(String(r))).slice(0, 10);
        let line: string | null = null;
        let kept: any[] = [];
        if (key && requirements.length && memberEvidence.length) {
          try {
            const matches = await askForLine(key, JSON.stringify({
              opportunity: { title, stated_requirements: requirements },
              evidence: memberEvidence.slice(0, 80).map((r) => ({
                evidence_id: r.id, kind: r.kind, claim: r.claim,
                quote: String(r.quote).slice(0, 300), position: r.position_ref,
              })),
              relation: g.profession_relation, bridge: (g as any).bridge,
            }));
            kept = matches
              .map((m) => ({ m, row: evidenceById.get(String(m.evidence_id)) }))
              .filter((x) => !!x.row && requirements.some((r) => r.trim() === String(x.m.requirement).trim()))
              .slice(0, 2);
            line = kept.length
              ? kept.map(({ m, row }) =>
                `This asks for ${String(m.requirement).slice(0, 140)}; ${secondPersonClause(row!.claim)}${row!.position_ref ? ` — ${row!.position_ref}` : ""}.`
              ).join(" ")
              : null;
          } catch (e) { answers.presentation_error = String((e as Error).message); }
        }
        answers.q5_evidence = {
          matched: kept.length,
          member_quote: kept.length ? String(kept[0].row.quote).slice(0, 300) : null,
          presentation_line: line,
          answer: line ? "yes" : "no",
          evidence: line
            ? `One stated requirement was answered by the member's own record: "${String(kept[0].row.quote).slice(0, 200)}".`
            : requirements.length
            ? "No stated requirement was answered by anything in the member's record, so presentation failed honestly and no line was written."
            : "The page stated no requirement the record could answer, so no presentation was attempted.",
        };

        // ── Q6 · door ──────────────────────────────────────────────────────
        const routeHit = ROUTE.exec(text);
        const cost = scopeEv?.cost_of_door?.value ?? null;
        answers.q6_door = {
          route_named: routeHit ? routeHit[0].toLowerCase() : null,
          cost_of_door: cost,
          registration_implied: REGISTRATION.test(text),
          member_access_confirmed_self_confirming: true,
          answer: routeHit ? "yes" : "no",
          evidence: (routeHit
            ? `The route reads as ${routeHit[0].toLowerCase()}.`
            : "No submission route was named in the page the engine could read.") +
            (cost ? ` The cost of the door is stated: ${cost}.` : " No fee was stated; the cost of the door is portal registration.") +
            " member_access_confirmed would be self-confirming here: nothing outside the member's own word can prove he holds a portal account.",
        };
      } catch (e) {
        answers.error = String((e as Error).message);
      }

      const { error: insErr } = await admin.from("oe_investigations").insert({
        kind: "sample_test", source, status: "open", detail: answers,
      });
      if (insErr) answers.write_error = insErr.message;
      results.push(answers);
    }

    return json({ ok: true, count: results.length, results });
  } catch (e) {
    return json({ error: (e as Error).message, fn: FN }, 500);
  }
});
