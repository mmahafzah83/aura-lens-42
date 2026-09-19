/**
 * oe-invariants-check — the opportunity engine's daily audit.
 *
 * Eight assertions, each phrased so that a violation is a fact, not an
 * opinion. Every violation is written to ef_error_log at 'error' with the
 * offending ids in context. A clean run writes one 'info' summary.
 *
 * Nothing here repairs anything. An invariant check that fixes what it finds
 * stops being a measurement.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const FN = "oe-invariants-check";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** A bare host root — no path worth reading. */
function isHostRoot(u: string | null): boolean {
  if (!u) return false;
  try {
    const p = new URL(u);
    return p.pathname === "" || p.pathname === "/";
  } catch {
    return false;
  }
}

function normaliseUrl(u: string | null): string | null {
  if (!u) return null;
  try {
    const p = new URL(u);
    const path = p.pathname.replace(/\/+$/, "");
    return `${p.hostname.replace(/^www\./, "")}${path}`.toLowerCase();
  } catch {
    return u.trim().toLowerCase();
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const CRON_SECRET = Deno.env.get("cron_secret") || Deno.env.get("CRON_SECRET") || "";
  const cronHeader = req.headers.get("x-cron-secret") || "";
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!((CRON_SECRET && cronHeader === CRON_SECRET) || bearer === SERVICE_ROLE)) {
    return json({ error: "Forbidden" }, 403);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const violations: { assertion: string; count: number; examples: unknown[] }[] = [];
  const record = (assertion: string, rows: unknown[]) => {
    if (rows.length) violations.push({ assertion, count: rows.length, examples: rows.slice(0, 10) });
  };

  // 1. No act-lane match on a chair type the member has blocked.
  {
    const { data: matches } = await admin.from("oe_matches")
      .select("id,user_id,opportunity_id,lane_final").eq("lane_final", "act");
    const { data: elig } = await admin.from("oe_eligibility").select("user_id,chair_types_blocked");
    const blocked = new Map<string, string[]>();
    for (const e of elig ?? []) blocked.set(e.user_id as string, (e.chair_types_blocked ?? []) as string[]);
    const ids = [...new Set((matches ?? []).map((m) => m.opportunity_id as string))];
    const { data: opps } = ids.length
      ? await admin.from("oe_opportunities").select("id,chair_type,route_url,source_url,issuer_id,alive").in("id", ids)
      : { data: [] as any[] };
    const oppById = new Map((opps ?? []).map((o) => [o.id as string, o]));
    const bad: unknown[] = [];
    for (const m of matches ?? []) {
      const o = oppById.get(m.opportunity_id as string);
      const list = (blocked.get(m.user_id as string) ?? []).map((s) => String(s).toLowerCase());
      if (o && o.chair_type && list.includes(String(o.chair_type).toLowerCase())) {
        bad.push({ match_id: m.id, opportunity_id: m.opportunity_id, chair_type: o.chair_type });
      }
    }
    record("act_lane_blocked_chair_type", bad);
  }

  // 2. Act-lane routes must be live, on the issuer's own host, and not a bare
  //    /contact or /about.
  {
    const { data: matches } = await admin.from("oe_matches")
      .select("opportunity_id,user_id").eq("lane_final", "act");
    const ids = [...new Set((matches ?? []).map((m) => m.opportunity_id as string))];
    const { data: opps } = ids.length
      ? await admin.from("oe_opportunities").select("id,route_url,route_dead,issuer_id").in("id", ids)
      : { data: [] as any[] };
    const issuerIds = [...new Set((opps ?? []).map((o) => o.issuer_id).filter(Boolean))] as string[];
    const { data: issuers } = issuerIds.length
      ? await admin.from("oe_entities").select("id,domain").in("id", issuerIds)
      : { data: [] as any[] };
    const domainById = new Map((issuers ?? []).map((e) => [e.id as string, (e.domain ?? "") as string]));
    const bad: unknown[] = [];
    for (const o of opps ?? []) {
      const reasons: string[] = [];
      if (o.route_dead === true) reasons.push("route_dead");
      const domain = (domainById.get(o.issuer_id as string) ?? "").replace(/^www\./, "").toLowerCase();
      if (o.route_url) {
        try {
          const host = new URL(o.route_url as string).hostname.replace(/^www\./, "").toLowerCase();
          if (domain && host !== domain && !host.endsWith(`.${domain}`)) reasons.push("route_host_not_issuer");
          const path = new URL(o.route_url as string).pathname.replace(/\/+$/, "").toLowerCase();
          if (path === "/contact" || path === "/about") reasons.push("route_is_generic_page");
        } catch {
          reasons.push("route_unparseable");
        }
      }
      if (reasons.length) bad.push({ opportunity_id: o.id, route_url: o.route_url, reasons });
    }
    record("act_lane_route_unusable", bad);
  }

  // 3. Every member's face weights sum to 1.000 ± 0.001.
  {
    const { data: faces } = await admin.from("oe_faces").select("user_id,weight");
    const sums = new Map<string, number>();
    for (const f of faces ?? []) {
      sums.set(f.user_id as string, (sums.get(f.user_id as string) ?? 0) + Number(f.weight ?? 0));
    }
    const bad = [...sums.entries()]
      .filter(([, s]) => Math.abs(s - 1) > 0.001)
      .map(([user_id, sum]) => ({ user_id, sum: +sum.toFixed(4) }));
    record("face_weights_do_not_sum_to_one", bad);
  }

  // 4. A serve with no reason is a card that should never have rendered.
  {
    const { data } = await admin.from("oe_serves").select("id,user_id,opportunity_id,why").limit(5000);
    const bad = (data ?? [])
      .filter((s) => s.why === null || (typeof s.why === "object" && Object.keys(s.why as object).length === 0))
      .map((s) => ({ serve_id: s.id, opportunity_id: s.opportunity_id }));
    record("serve_without_why", bad);
  }

  // 5. Book Three holds no member. A user_id column there is a modelling leak.
  //    Asking for the column is the test: if it answers, the column exists.
  {
    const bad: unknown[] = [];
    for (const table of ["oe_world_facts", "oe_source_facts"]) {
      const { error } = await admin.from(table).select("user_id").limit(1);
      if (!error) bad.push({ table, column: "user_id" });
    }
    record("book_three_has_user_column", bad);
  }

  // 6. A bare host root proves nothing.
  {
    const { data } = await admin.from("oe_opportunities").select("id,source_url").eq("alive", true);
    const bad = (data ?? [])
      .filter((o) => isHostRoot(o.source_url as string))
      .map((o) => ({ opportunity_id: o.id, source_url: o.source_url }));
    record("alive_opportunity_source_is_host_root", bad);
  }

  // 7. Two alive records on the same page are one record twice.
  {
    const { data } = await admin.from("oe_opportunities").select("id,source_url").eq("alive", true);
    const seen = new Map<string, string[]>();
    for (const o of data ?? []) {
      const k = normaliseUrl(o.source_url as string);
      if (!k) continue;
      seen.set(k, [...(seen.get(k) ?? []), o.id as string]);
    }
    const bad = [...seen.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([url, ids]) => ({ normalised_url: url, opportunity_ids: ids }));
    record("duplicate_alive_source_url", bad);
  }

  // 8. Below learning stage 2 the machine may not move its own weights.
  //    A face whose weight row was touched in the last day, for a member the
  //    machine is not yet allowed to learn from, is the violation.
  {
    const { data: stages } = await admin.from("oe_learning_stage").select("user_id,stage");
    const early = new Set(
      (stages ?? []).filter((s) => Number(s.stage ?? 0) < 2).map((s) => s.user_id as string),
    );
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { data: faces } = await admin.from("oe_faces")
      .select("id,user_id,face,weight,updated_at,built_at").gte("updated_at", since);
    const bad = (faces ?? [])
      .filter((f) => early.has(f.user_id as string) && String(f.updated_at) !== String(f.built_at))
      .map((f) => ({ face_id: f.id, user_id: f.user_id, face: f.face, updated_at: f.updated_at }));
    record("weight_moved_below_stage_two", bad);
  }

  // 9. Judging coverage. An active member should have a match row for nearly
  //    every alive record. More than a quarter unjudged is a pipeline gap —
  //    the exact failure that emptied the queue and took an audit to find.
  {
    const { data: alive } = await admin.from("oe_opportunities").select("id").eq("alive", true);
    const aliveIds = (alive ?? []).map((o) => o.id as string);
    const { data: consents } = await admin.from("oe_consents")
      .select("user_id").eq("kind", "matching").is("revoked_at", null);
    const bad: unknown[] = [];
    if (aliveIds.length) {
      for (const uid of [...new Set((consents ?? []).map((c) => c.user_id as string))]) {
        const { data: matched } = await admin.from("oe_matches")
          .select("opportunity_id").eq("user_id", uid).in("opportunity_id", aliveIds);
        const covered = new Set((matched ?? []).map((m) => m.opportunity_id as string)).size;
        const missing = aliveIds.length - covered;
        const share = missing / aliveIds.length;
        if (share > 0.25) {
          bad.push({
            user_id: uid, alive: aliveIds.length, matched: covered, unjudged: missing,
            unjudged_share: +share.toFixed(3),
          });
        }
      }
    }
    record("member_unjudged_share_above_quarter", bad);
  }



  for (const v of violations) {
    await admin.from("ef_error_log").insert({
      function_name: FN,
      severity: "error",
      error_message: `OE_INVARIANT_VIOLATION ${v.assertion} — ${v.count} case(s)`,
      context: { assertion: v.assertion, count: v.count, examples: v.examples },
    });
  }
  if (!violations.length) {
    await admin.from("ef_error_log").insert({
      function_name: FN,
      severity: "info",
      error_message: "OE_INVARIANTS ok — all eight assertions hold",
      context: {},
    });
  }

  return json({ ok: violations.length === 0, violations });
});
