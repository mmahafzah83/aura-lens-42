// Shared evidence loader + prompt assembly for the member read.
// Moved verbatim out of brand-assessment/index.ts so that admin-regenerate-report
// produces a byte-identical prompt for the same inputs.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export async function buildReadEvidence(
  admin: SupabaseClient,
  userId: string,
  input: { answers: any; auditScores: any; sector?: string | null; band?: string | null },
): Promise<{ floorMet: boolean; userPrompt: string; counts: { frags: number; posts: number; snaps: number } }> {
  const { answers, auditScores, sector, band } = input;
  const uid = userId;

  const [snapRes, fragRes, profRes, postRes, allPostsRes] = await Promise.all([
    admin.from("linkedin_profile_snapshots")
      .select("headline, about, experience, skills, followers, connections, location, education, certifications, languages, raw")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(1),
    admin.from("evidence_fragments")
      .select("title, content, confidence")
      .eq("user_id", uid)
      .order("confidence", { ascending: false })
      .limit(12),
    admin.from("diagnostic_profiles")
      .select("seniority_band, sector_focus, cv_crosscheck")
      .eq("user_id", uid)
      .maybeSingle(),
    admin.from("linkedin_posts")
      .select("post_text, like_count, published_at")
      .eq("user_id", uid)
      .order("like_count", { ascending: false, nullsFirst: false })
      .limit(15),
    admin.from("linkedin_posts")
      .select("post_text, like_count, published_at, acquisition")
      .eq("user_id", uid)
      .limit(500),
  ]);

  const snap: any = snapRes.data?.[0] ?? null;
  const frags: any[] = fragRes.data ?? [];
  const prof: any = profRes.data ?? {};
  const posts: any[] = (postRes.data ?? []).filter((p: any) => String(p?.post_text || "").trim());
  const allPosts: any[] = ((allPostsRes as any).data ?? []).filter((p: any) => String(p?.post_text || "").trim());

  // EVIDENCE FLOOR — never write a read for a member we know nothing about.
  const floorMet = (frags.length > 0) || (allPosts.length > 0) || (snap !== null);
  const counts = { frags: frags.length, posts: allPosts.length, snaps: snap ? 1 : 0 };
  if (!floorMet) return { floorMet: false, userPrompt: "", counts };

  const resolvedSector = sector || prof.sector_focus || null;
  const resolvedBand = band || prof.seniority_band || null;

  // The self-claim question is identified by its framework tag, not by prompt
  // wording, so rewording the question does not silently break THE HONEST TRUTH.
  let selfClaimPrompt: string | null = null;
  if (resolvedBand) {
    const { data: scRow } = await admin
      .from("onboarding_questions")
      .select("prompt")
      .eq("framework", "self-claim")
      .eq("active", true)
      .eq("band", resolvedBand)
      .maybeSingle();
    if (scRow?.prompt) selfClaimPrompt = String(scRow.prompt).trim();
  }


  // COHORT AWARENESS — the cohort widens when it is too small to be meaningful
  // and narrows again automatically as the member base grows.
  const MIN_COHORT = 10;
  let takenNames: string[] = [];
  {
    const namesFrom = (rows: any[] | null | undefined): string[] =>
      (rows ?? [])
        .filter((p: any) => p.user_id !== uid)
        .map((p: any) => String(p?.brand_assessment_results?.primary_archetype ?? "").trim())
        .filter((s: string) => s.length > 0);

    // Tier 1 — same band AND same sector
    if (resolvedBand && resolvedSector) {
      const { data } = await admin.from("diagnostic_profiles")
        .select("user_id, brand_assessment_results")
        .eq("seniority_band", resolvedBand)
        .eq("sector_focus", resolvedSector)
        .limit(200);
      takenNames = namesFrom(data);
    }

    // Tier 2 — same band, any sector
    if (takenNames.length < MIN_COHORT && resolvedBand) {
      const { data } = await admin.from("diagnostic_profiles")
        .select("user_id, brand_assessment_results")
        .eq("seniority_band", resolvedBand)
        .limit(200);
      takenNames = takenNames.concat(namesFrom(data));
    }

    // Tier 3 — every member
    if (takenNames.length < MIN_COHORT) {
      const { data } = await admin.from("diagnostic_profiles")
        .select("user_id, brand_assessment_results")
        .limit(200);
      takenNames = takenNames.concat(namesFrom(data));
    }

    takenNames = Array.from(new Set(takenNames)).slice(0, 40);
  }



  // The member's slider results, named — so the model can say what they rated
  // themselves highest on rather than quoting a number.
  const dimRes = resolvedBand
    ? await admin.from("capability_dimensions")
        .select("name, why_line, sector, position")
        .eq("band", resolvedBand)
        .eq("active", true)
    : { data: [] as any[] };
  const dims: any[] = (dimRes as any).data ?? [];
  const scoreMap: Record<string, number> = (auditScores && typeof auditScores === "object")
    ? auditScores as Record<string, number>
    : {};
  const namedScores = Object.entries(scoreMap)
    .filter(([, v]) => typeof v === "number")
    .map(([k, v]) => {
      const d = dims.find((x) => String(x.name).toLowerCase() === k.toLowerCase());
      return { name: d?.name ?? k, why: d?.why_line ?? null, value: v as number };
    })
    .sort((a, b) => b.value - a.value);
  const namedScoresBlock = namedScores.length
    ? `THEIR OWN RATINGS, WITH THE NAME OF WHAT THEY RATED (highest first)
${namedScores.map((s) => `- ${s.name}: ${s.value}${s.why ? ` — ${s.why}` : ""}`).join("\n")}
Always refer to these by name, never as "dimension 5" or a bare number.`
    : "THEIR OWN RATINGS\nNone on file.";

  const takenNounsBlock = takenNames.length
    ? `ARCHETYPE NAMES ALREADY GIVEN TO OTHER MEMBERS AT THIS LEVEL IN THIS SECTOR
${takenNames.map((n) => `- ${n}`).join("\n")}

Do not reuse any name above, and do not reuse the ROLE-NOUN of any name above even with a different adjective.
If your first instinct is one of these nouns, that instinct is describing the COHORT, not this person — the people
above read the same news and work in the same market, so the obvious word will always be the shared one. Choose
again, and take the noun from something in THIS member's own evidence that does not appear in the others': a
specific problem they keep returning to, a kind of work only they describe, a claim only they have captured.`
    : `ARCHETYPE NAMES ALREADY GIVEN TO OTHER MEMBERS AT THIS LEVEL IN THIS SECTOR
None yet — this member is the first read at this level in this sector.`;


  // ── WHAT THEIR OWN WRITING SHOWS — computed, never estimated ──
  let writingBlock: string;
  if (allPosts.length < 5) {
    writingBlock = `WHAT THEIR OWN WRITING SHOWS
NOT ENOUGH PUBLIC WRITING TO MEASURE`;
  } else {
    const lines: string[] = [];
    const words = allPosts.reduce((n, p) => n + String(p.post_text).trim().split(/\s+/).length, 0);
    lines.push(`- Posts with text: ${allPosts.length}; total words written: ${words}`);
    const withDigit = allPosts.filter((p) => /\d/.test(String(p.post_text))).length;
    lines.push(`- Posts containing a digit: ${Math.round((withDigit / allPosts.length) * 100)}%`);

    const likes = allPosts.map((p) => Number(p.like_count) || 0);
    const avg = likes.reduce((a, b) => a + b, 0) / likes.length;
    const best = Math.max(...likes);
    if (avg > 0 && best / avg >= 1.5) {
      lines.push(`- Their best post drew ${(best / avg).toFixed(1)}× the reactions of their average post (${best} vs an average of ${avg.toFixed(1)})`);
    }

    const own = allPosts.filter((p) => String(p.acquisition ?? "") !== "reshare").length;
    lines.push(`- Their own words: ${own} posts; reshares: ${allPosts.length - own} posts`);

    const months: Record<string, number> = {};
    for (const p of allPosts) {
      const d = p.published_at ? String(p.published_at).slice(0, 7) : null;
      if (d) months[d] = (months[d] ?? 0) + 1;
    }
    const peak = Object.entries(months).sort((a, b) => b[1] - a[1])[0];
    if (peak) {
      const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
      const recent = allPosts.filter((p) => p.published_at && new Date(p.published_at).getTime() >= cutoff).length;
      lines.push(`- Busiest month: ${peak[0]} with ${peak[1]} posts. In the last 90 days: ${recent} posts.`);
    }

    const top3 = [...allPosts].sort((a, b) => (Number(b.like_count) || 0) - (Number(a.like_count) || 0)).slice(0, 3);
    const top3Block = top3.map((p, i) =>
      `${i + 1}. [${Number(p.like_count) || 0} reactions] ${String(p.post_text).replace(/\s+/g, " ").slice(0, 600)}`).join("\n");

    writingBlock = `WHAT THEIR OWN WRITING SHOWS
These figures are computed from their real posts. Treat them as fact. If a figure is absent, it could not be computed — do not invent it.
${lines.join("\n")}

Their three highest-liked posts, in full (truncated at 600 characters):
${top3Block}`;
  }

  const bandLine = resolvedBand === "room"
    ? "They operate at board and owner level — write for someone who sets the agenda in the room."
    : resolvedBand === "table"
    ? "They sit at the executive table — write for someone who shapes decisions alongside peers."
    : resolvedBand === "work"
    ? "They lead the work itself — write for someone whose credibility comes from delivery."
    : "";

  const raw: any = (snap?.raw && typeof snap.raw === "object") ? snap.raw : {};
  const rawArr = (k: string): any[] => (Array.isArray(raw[k]) ? raw[k] : []);
  const cut = (v: unknown, n: number) => JSON.stringify(v ?? []).slice(0, n);

  const profileBlock = snap
    ? `THEIR LINKEDIN PROFILE — read all of it, this is evidence of standing that answers cannot provide
Headline: ${snap.headline ?? "Not on file"}
Location: ${raw?.location?.linkedinText ?? snap.location ?? "Not on file"}
On LinkedIn since: ${raw?.registeredAt ?? "Not on file"}
Followers: ${snap.followers ?? "Not on file"} · Connections: ${snap.connections ?? raw?.connectionsCount ?? "Not on file"}
Creator mode: ${raw?.creator ?? "Not on file"} · Verified: ${raw?.verified ?? "Not on file"}
About: ${typeof snap.about === "string" ? snap.about.slice(0, 2000) : "Not on file"}
Experience (every role, with dates and duration): ${cut(snap.experience ?? rawArr("experience"), 6000)}
Education: ${cut(snap.education ?? rawArr("education"), 1200)}
Top skills: ${cut(rawArr("topSkills"), 600)}
Skills: ${cut(snap.skills ?? rawArr("skills"), 1500)}
Certifications: ${cut(snap.certifications ?? rawArr("certifications"), 1500)}
Languages: ${cut(snap.languages ?? rawArr("languages"), 400)}
Projects: ${cut(rawArr("projects"), 1200)}
Courses: ${cut(rawArr("courses"), 600)}
Honours and awards: ${cut(rawArr("honorsAndAwards"), 600)}
Volunteering: ${cut(rawArr("volunteering"), 600)}
Interests: ${cut(rawArr("interests"), 600)}

Use the CAREER SHAPE as evidence: how long they stayed in each role, the moves between companies and sectors,
where they have stayed put, what they stopped doing. That shape is standing, and their answers cannot show it.`
    : "THEIR LINKEDIN PROFILE\nNothing on file.";

  // Other people describing this member in their own words — the only external
  // evidence of market perception the product ever gets.
  const recs = rawArr("receivedRecommendations");
  const recsBlock = recs.length
    ? `RECOMMENDATIONS WRITTEN ABOUT THEM BY OTHER PEOPLE (${recs.length})
${recs.slice(0, 18).map((r: any, i: number) =>
  `${i + 1}. ${String(r?.givenBy ?? "Someone")}${r?.givenByHeadline ? ` (${String(r.givenByHeadline).split("|")[0].trim()})` : ""}: ${String(r?.description ?? "").replace(/\s+/g, " ").slice(0, 700)}`
).join("\n")}

These are recommendations written about the member by other people. This is the only external evidence of how the
market actually sees them. Use it as the primary source for HOW THE MARKET SEES YOU, and quote or paraphrase at
least one specific thing a recommender said. Where the recommendations agree
with the member's own answers, say so. Where they disagree, name the disagreement plainly — that gap is the most
useful thing in the report. Never invent a recommendation and never quote one that is not above.`
    : "RECOMMENDATIONS WRITTEN ABOUT THEM\nNone on file — say the market evidence is thin rather than inventing perception.";

  const claimsBlock = frags.length
    ? `WHAT THEY HAVE CAPTURED (their own claims, strongest first)
${frags.map((f, i) => `${i + 1}. ${f.title}${f.content ? ` — ${String(f.content).slice(0, 400)}` : ""}`).join("\n")}`
    : "WHAT THEY HAVE CAPTURED\nNothing captured yet.";

  // Their actual published writing — the evidence any claim is tested against.
  const postsBlock = posts.length
    ? `THEIR OWN POSTS (${posts.length} read, most-engaged first)
${posts.map((p, i) => `${i + 1}. [${p.like_count ?? 0} reactions${p.published_at ? `, ${String(p.published_at).slice(0, 10)}` : ""}] ${String(p.post_text).replace(/\s+/g, " ").slice(0, 600)}`).join("\n")}`
    : "THEIR OWN POSTS\nNothing on file — say so rather than inferring from the profile alone.";

  // The one question where they bet on their own strength. Everything in
  // THE HONEST TRUTH turns on whether their posts back this up.
  // framework = 'self-claim' is the binding; the regex is legacy fallback only.
  let selfClaimKey: string | undefined;
  if (selfClaimPrompt) {
    selfClaimKey = Object.keys(answers ?? {}).find((k) => k.includes(selfClaimPrompt as string));
  }
  if (!selfClaimKey) {
    selfClaimKey = Object.keys(answers ?? {}).find((k) => /strongest at/i.test(k));
  }
  const selfClaim = selfClaimKey ? String((answers as any)[selfClaimKey] ?? "").trim() : "";

  const selfClaimBlock = selfClaim
    ? `WHERE THEY BET THEY ARE STRONGEST
The member claims they are strongest at: "${selfClaim}".

Compare that claim against their actual posts above and their captured claims. If the evidence supports it, say so and cite what supports it — quote or name the specific post or claim. If the evidence does NOT support it, say that plainly and specifically in THE HONEST TRUTH — name the number (how many of their ${posts.length} posts actually touch it, how many of their ${frags.length} captured claims do). Do not soften it into an opportunity, a "next step", or a "chance to". If there is not enough evidence either way, say that instead of guessing.`
    : "WHERE THEY BET THEY ARE STRONGEST\nNot answered — do not invent a claim to test.";

  // Build audit scores context for the AI
  const auditContext = typeof auditScores === "string"
    ? auditScores
    : `The user's Objective Evidence Audit scores are: ${JSON.stringify(auditScores, null, 2)}`;

  // Documented evidence from their CV that their public profile does not show.
  const cc: any = (prof?.cv_crosscheck && typeof prof.cv_crosscheck === "object") ? prof.cv_crosscheck : null;
  const cvBlock = cc
    ? `WHAT THEIR CV SHOWS THAT THEIR PUBLIC PROFILE DOES NOT
In their CV, absent from their profile: ${JSON.stringify(cc.in_cv_not_on_profile ?? [])}
On their profile, absent from the CV: ${JSON.stringify(cc.on_profile_not_in_cv ?? [])}
Strongest proof invisible publicly: ${cc.strongest_unused_proof ?? "none stated"}
What their CV emphasises: ${cc.direction_signal ?? "none stated"}

This is documented evidence they have not made public. Treat it as fact. Where it supports a claim they make, say so and name it. Where it contradicts how they present publicly, name that gap plainly — it is one of the most useful things in the read.`
    : "WHAT THEIR CV SHOWS\nNo CV on file.";

  const userPrompt = `User's sector: ${resolvedSector || "Not stated — infer it from the headline and captured claims and name it explicitly."}
Their seniority: ${resolvedBand || "Not stated"}. ${bandLine}

${profileBlock}

${recsBlock}

${claimsBlock}

${cvBlock}

${postsBlock}

${selfClaimBlock}

${writingBlock}

${namedScoresBlock}

${takenNounsBlock}

${auditContext}


Here are the user's Brand Assessment answers:
${JSON.stringify(answers, null, 2)}

Analyse this professional using all six frameworks and provide the complete brand positioning output. Use the audit scores as factual evidence — do not ask the user for them. Reference at least one of their own captured claims, by its substance, inside THE HONEST TRUTH section. THE HONEST TRUTH must also settle the claim-versus-evidence test set out above, with the number named, and it is allowed to be unwelcome — never trade accuracy for comfort. Write for their seniority band. Never write a bracketed placeholder and never write the words "sector name".`;

  return { floorMet: true, userPrompt, counts };
}
