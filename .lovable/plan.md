

## Plan: AI_JUDGE with controlled fail-open + bypass cap

### Critical scoping fix discovered during verification

In current code, the gate runs at line 1036 **before** `validation_score` and `content_quality_score` are computed (lines 1043 and 1049). The candidate variable in scope is `c` (loop var), not `src`. We must **reorder**: compute scores first, then run the judge, so the controlled fail-open branch can read live in-scope values.

### Changes to `supabase/functions/fetch-industry-trends/index.ts`

**1. Rename `consultantGate` → `aiJudge` (lines ~357–433)**
- Update prompt to exact AI_JUDGE spec wording.
- Keep `gemini-2.5-flash-lite` + tool-calling.
- New return type:
  ```ts
  type JudgeResult =
    | { decision: "ACCEPT" | "REJECT"; reason: string; bypassed: false }
    | { decision: "UNAVAILABLE"; reason: string; bypassed: true };
  ```
  Returns `UNAVAILABLE` (not fail-open ACCEPT) on: missing API key, gateway non-2xx, missing tool call, JSON parse failure, network exception.
- Internal logs use `[judge]` prefix.

**2. Add per-run bypass counter (above the candidate loop, ~line 980)**
```ts
const MAX_JUDGE_BYPASSES = 2;
let judgeBypassCount = 0;
```

**3. Reorder + replace branch site (lines ~1035–1049)**

Compute scores BEFORE the judge so the fail-open branch has access to them:

```ts
// Compute scores first so AI_JUDGE fail-open can use them
const source = domainOf(canonical);
const validation_score = computeValidationScore({ domain: source, markdown: clean_markdown, text });
if (validation_score <= 0) {
  console.log("[trends] reject zero_validation", c.url); continue;
}
const topic_relevance_score = computeTopicRelevance(text, profileTokens);
const snapshot_quality = computeSnapshotQuality({ markdown: clean_markdown, text });
const content_quality_score = computeContentQualityScore({ clean: clean_markdown, raw: raw_markdown });

// Stage 5.5: AI_JUDGE — strict LLM final arbiter (controlled fail-open)
const judge = await aiJudge(text);

if (judge.decision === "REJECT") {
  console.log(`[judge] rejected: ${c.url} — ${judge.reason}`);
  continue;
}

if (judge.decision === "UNAVAILABLE") {
  const highConfidence = validation_score >= 85 && content_quality_score >= 80;
  // passesBusinessRelevance already enforced upstream — implicit pass

  if (!highConfidence) {
    console.log(`[judge] rejected: ${c.url} — judge_unavailable (validation=${validation_score}, quality=${content_quality_score}, reason=${judge.reason})`);
    continue;
  }

  if (judgeBypassCount >= MAX_JUDGE_BYPASSES) {
    console.log(`[judge] rejected: ${c.url} — bypass_limit_exceeded (validation=${validation_score}, quality=${content_quality_score})`);
    continue;
  }

  judgeBypassCount++;
  console.log(`[judge] accepted: ${c.url} — judge_bypass_high_confidence (validation=${validation_score}, quality=${content_quality_score}, reason=${judge.reason})`);
} else {
  console.log(`[judge] accepted: ${c.url} — ${judge.reason}`);
}

scraped.push({
  url: canonical,
  title: result.title || c.title || canonical,
  raw_markdown, clean_markdown, text, source,
  validation_score, topic_relevance_score, snapshot_quality, content_quality_score,
  discovery_reason: c.reason,
});
```

### Why this is correct
- `c` is the in-scope loop candidate (verified line 1036 context).
- `validation_score` / `content_quality_score` are computed BEFORE the judge call → no stale or undefined references.
- `passesBusinessRelevance` runs at Stage 5 upstream and `continue`s on failure, so any candidate reaching the judge has already passed it.
- `MAX_JUDGE_BYPASSES = 2` caps low-governance passes per run; counter resets each invocation (function-scope let).
- All bypass logs include actual scores per spec.

### Files touched
- `supabase/functions/fetch-industry-trends/index.ts` — rename, reorder, branch with bypass cap
- `.lovable/memory/features/signals/decision-engine.md` — Stage 5.5 = AI_JUDGE, controlled fail-open thresholds (85/80), bypass cap (2/run), `[judge]` prefix

### Verification (after deploy)
1. ↻ Refresh signals on Home.
2. Pull `fetch-industry-trends` logs filtered on `[judge]`. Report:
   - one `[judge] accepted: <url> — <model reason>`
   - one `[judge] rejected: <url> — <model reason>`
   - any UNAVAILABLE-path lines (bypass with scores, judge_unavailable rejection, or bypass_limit_exceeded)
3. Confirm rejected URLs are NOT in new `industry_trends` rows.

