/**
 * VOCABULARY GATE — fails the build when a member-facing count noun is written
 * by hand instead of coming from the dictionary at src/constants/vocabulary.ts.
 *
 * THE LAW (see vocabulary.ts):
 *   capture = rows in `entries`
 *   source = rows in `source_registry`, or `strategic_signals.unique_orgs`
 *            when scoped to one signal
 *   piece of evidence = rows in `evidence_fragments`, or
 *                       `strategic_signals.fragment_count` for one signal
 *   signal = rows in `strategic_signals`
 *   page = rows in `agent_findings` (pages Aura read overnight), or
 *          `documents.page_count` / `pages_total` (pages of a file the member
 *          uploaded)
 *   draft = draft rows in `linkedin_posts` / `content_items`
 *   post = rows in `post_provenance` (what the member published)
 * "fragment", "theme", "topic", "subject", "claim", "thing", "item" and
 * "reading" are never member-facing nouns for these.
 *
 * WHAT IT FLAGS
 *   1. A count noun sitting next to a number — an interpolation (`${...}` /
 *      `{n}` / a JSX `{expr}`) or a `{n}` placeholder — inside member-facing
 *      text. That is exactly the shape a formatter is supposed to produce.
 *      Arabic nouns count too (مصدر / مصادر / قطعة / قطع / التقاط / إشارة …);
 *      `\b` does not work on Arabic script, so those use explicit lookarounds
 *      for a non-Arabic-letter boundary.
  *   2. A literal that is NOTHING BUT a count noun — `"source"` / `"sources"` —
  *      when the line puts it in a counting context: a ternary, an assignment to
  *      a label/name/title/text key, or a number-bearing identifier on the same
  *      line. This includes quoted literals nested inside a template literal,
  *      because `${n} ${n === 1 ? "page" : "pages"}` is the same original bug.
 *
 * WHAT IT ALLOWS
 *   - A correct dictionary call. Each call's span is BLANKED OUT of the line
 *     (characters replaced by spaces, offsets preserved) and the REMAINDER of
 *     the line is still scanned — so `{nEvidence(n,"en")} from {orgs} sources`
 *     is still caught on its right-hand side.
 *   - Anything that reads as code rather than prose: identifiers, paths, CSS
 *     values, class lists, JSX attribute values (`theme={theme}`), and DB
 *     column names such as `fragment_count` / `theme_tags` / `unique_orgs`,
 *     which are exempted because they read as code-like literals or sit inside
 *     a larger identifier — there is no separate column allowlist.
 *   - Comments, the dictionary itself, tests and fixtures, and a per-line
 *     escape hatch: append `// vocab-ok` with a reason.
 *
 * Run: node scripts/check-vocabulary.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const FUNCTIONS = join(ROOT, "supabase", "functions");

/** The dictionary and its Deno twin. Emails are the one surface that cannot
 *  import from `src/`, so the twin is copied — and policed here. */
const DICT = "src/constants/vocabulary.ts";
const DICT_TWIN = "supabase/functions/_shared/vocabulary.ts";

/** The MOVES table and ITS Deno twin. Same problem, same remedy: the client
 *  cannot import from `supabase/functions/_shared/`, so the one table of "what
 *  kind of post this is" is mirrored — and a mirror with no gate is exactly the
 *  bug this file exists to prevent. */
const MOVES_MIRROR = "src/constants/moves.ts";
const MOVES_TWIN = "supabase/functions/_shared/moves.ts";

/** Generic body slice: everything from `marker` onwards, comments stripped and
 *  blank lines dropped, so the two file headers may legitimately differ. */
function twinBody(text, marker) {
  const code = stripComments(text);
  const i = code.indexOf(marker);
  return code
    .slice(Math.max(0, i))
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim() !== "");
}

function vocabularyBody(text) {
  return twinBody(text, "export type VocabLang");
}

/** Fails the build when a file and its twin drift apart, character for
 *  character, from `marker` onwards. */
function compareTwin(fileA, fileB, marker, label) {
  let a, b;
  try {
    a = twinBody(readFileSync(join(ROOT, fileA), "utf8"), marker);
    b = twinBody(readFileSync(join(ROOT, fileB), "utf8"), marker);
  } catch (e) {
    return [`cannot read ${label} or its twin: ${e.message}`];
  }
  const n = Math.max(a.length, b.length);
  for (let k = 0; k < n; k++) {
    if (a[k] === b[k]) continue;
    return [
      `${label} and its twin have diverged — first difference at body line ${k + 1}:`,
      `  ${fileA}: ${a[k] === undefined ? "<end of file>" : a[k].trim()}`,
      `  ${fileB}: ${b[k] === undefined ? "<end of file>" : b[k].trim()}`,
      `  they must stay identical from "${marker}" onwards — edit one, edit the other.`,
    ];
  }
  return [];
}

/** Both twins, checked the same way. */
export function checkTwin() {
  return [
    ...compareTwin(DICT, DICT_TWIN, "export type VocabLang", "the dictionary"),
    ...compareTwin(MOVES_MIRROR, MOVES_TWIN, "export type MoveBeat", "the MOVES table"),
  ];
}

/** Banned member-facing nouns, plus the seven legitimate ones (which still may
 *  not be hand-written next to a number). */
const NOUNS_EN = [
  "fragment", "fragments",
  "theme", "themes",
  "topic", "topics",
  "subject", "subjects",
  "claim", "claims",
  "thing", "things",
  "item", "items",
  "reading", "readings",
  "source", "sources",
  "capture", "captures",
  "evidence",
  "signal", "signals",
  "draft", "drafts",
  "post", "posts",
  "page", "pages",
];

/** The same nouns in Arabic, in the forms the number-agreement ladder produces. */
const NOUNS_AR = [
  "مصادر", "مصدراً", "مصدرا", "مصدران", "مصدر",
  "قطع", "قطعة", "قطعتان",
  "التقاطات", "التقاطاً", "التقاطا", "التقاطان", "التقاط",
  "إشارات", "إشارة", "إشارتان",
  "أدلة", "الأدلة",
  "مسودات", "مسودتان", "مسودة",
  "منشورات", "منشوراً", "منشورا", "منشوران", "منشور",
  "صفحات", "صفحتان", "صفحة",
];


/** BANNED PHRASES — member-facing marketing language the project does not use.
 *  "Thought leadership" and its relatives describe a posture, not work; the
 *  voice surfaces say "Ideas worth quoting" and "Your voice" instead.
 *  Enforced on the surfaces this round owns; elsewhere it reports as deferred,
 *  exactly like the earlier rounds, so the gate can tighten file by file. */
const BANNED_PHRASES = [
  "thought leadership",
  "thought leader",
  "authority",
  "personal brand",
  "trajectory",
  // Prose-level bans — a list of the member's recurring work is never called
  // these, with or without a number beside it.
  "subjects",
  "topics",
  "themes",
];
const BANNED_RE = new RegExp(`\\b(?:${BANNED_PHRASES.join("|")})\\b`, "i");
const BANNED_ENFORCED = [
  "src/components/voice/",
  "src/components/studio/",
  "src/lib/voiceDna.ts",
  "src/lib/voiceOverview.ts",
];

/** Only prose counts: a literal with a space in it. `generate-authority-content`
 *  is an identifier, not a sentence, and is never a hit. */
function findBannedPhrase(line) {
  for (const lit of [...literalsOf(line), ...nestedLiteralsOfTemplates(line)]) {
    if (!/\s/.test(lit)) continue;
    const m = lit.match(BANNED_RE);
    if (m) return m[0];
  }
  return null;
}

const AR_LETTER = "\\u0600-\\u06FF";
/** One boundary-safe alternation covering both scripts. */
const NOUN =
  `(?:\\b(?:${NOUNS_EN.join("|")})\\b` +
  `|(?<![${AR_LETTER}])(?:${NOUNS_AR.join("|")})(?![${AR_LETTER}]))`;

/** Every noun on its own, for the bare-literal check. Case-insensitive: a
 *  title-cased `"Source"`/`"Sources"` is the same hand-rolled plural. */
const BARE_NOUN = new RegExp(`^(?:${[...NOUNS_EN, ...NOUNS_AR].join("|")})$`, "iu");

/**
 * Two scans, because a count noun only matters in member-facing TEXT:
 *   A) inside a string/template literal, next to `${...}` or a `{n}` placeholder;
 *   B) as JSX text right after an expression — `{n} sources`.
 * JSX attribute values (`theme={theme}`) are code, never text, so an `=` or a
 * bare identifier immediately before the brace disqualifies a match.
 */
const LITERAL_PATTERNS = [
  new RegExp(String.raw`\$\{[^}]{0,80}\}\s*(?:[A-Za-z'\u0600-\u06FF]+\s+){0,2}${NOUN}`, "iu"),
  new RegExp(String.raw`\{n\}\s*(?:[A-Za-z'\u0600-\u06FF]+\s+){0,2}${NOUN}`, "iu"),
];

const JSX_PATTERN = new RegExp(
  String.raw`(?<![=\w])\{[^{}=]{0,80}\}\s*(?:[A-Za-z'\u0600-\u06FF]+\s+){0,2}${NOUN}`, "iu");

/** A call that already goes through the dictionary is the CORRECT shape —
 *  `{nSources(n, lang)} behind this signal` is what the gate is asking for. Its
 *  SPAN is blanked out; the rest of the line is still scanned. */
const DICTIONARY_CALL = /\b(?:nSources|nCaptures|nEvidence|nSignals|nPages|nDrafts|nPosts|evidenceAndSources|sourceCount(?:En|Ar)|captureCount(?:En|Ar)|evidenceCount(?:En|Ar)|signalCount(?:En|Ar)|cardCounts|countNoun)\s*\((?:[^()]|\([^()]*\))*\)/g;

/** Replace every dictionary call with spaces, preserving offsets. */
function blankDictionaryCalls(line) {
  const blanked = line.replace(DICTIONARY_CALL, (m) => " ".repeat(m.length));
  // A JSX brace whose whole expression WAS the dictionary call is now `{     }`.
  // Blank the braces too, or the emptied brace still reads as an interpolation.
  return blanked.replace(/\{[ ]+\}/g, (m) => " ".repeat(m.length));
}

/** Literals that are plainly code, not prose. */
const CODE_LIKE = /^(?:[\w./@-]*)$|var\(|--|px|%|hsl|rgb|#[0-9a-f]{3}/i;

/** A line that is COUNTING something. A bare noun literal is only a hand-rolled
 *  plural when a number is visibly driving the choice: a ternary whose test
 *  compares against 1 or reads a count-shaped identifier, or a text-bearing key
 *  on a line that also carries such an identifier. Discriminator literals
 *  (`kind === "capture"`, `"signal" | "insight"`) have no number and are code. */
const NUM_IDENT = /\b\w*(?:count|total|length|size|qty)\b/i;

function isCountContext(line) {
  const ternary = /\?/.test(line) && /:/.test(line)
    && (/[=!<>]=*\s*1\b/.test(line) || NUM_IDENT.test(line));
  const textKey = /\b(?:label|title|text|name|noun|word|unit|suffix)\s*[:=]/i.test(line)
    && NUM_IDENT.test(line);
  return ternary || textKey;
}

function findHit(rawLine) {
  // Class lists are styling, not prose — `flex items-center` is not a count.
  let line = rawLine
    .replace(/className=\{[^}]*\}/g, " ")
    .replace(/className="[^"]*"/g, " ")
    .replace(/class="[^"]*"/g, " ");
  // Per-match, not per-line: only the dictionary call itself is forgiven.
  line = blankDictionaryCalls(line);
  // A JSX attribute holding a literal number (`triggerSize={13}`) is layout,
  // not a count — it must not turn a static label into a "counting" line.
  line = line.replace(/\b[\w-]+=\{\s*-?\d+(?:\.\d+)?\s*\}/g, (m) => " ".repeat(m.length));

  const counting = isCountContext(line);
  for (const lit of nestedLiteralsOfTemplates(line)) {
    const bare = lit.trim();
    if (BARE_NOUN.test(bare) && counting) return bare;
  }
  for (const lit of literalsOf(line)) {
    const bare = lit.trim();
    // A literal that IS a noun is never exempted by CODE_LIKE.
    if (BARE_NOUN.test(bare)) {
      if (counting) return bare;
      continue;
    }
    if (lit.length < 4 || CODE_LIKE.test(lit)) continue;
    for (const re of LITERAL_PATTERNS) {
      const m = lit.match(re);
      if (m) return m[0].trim();
    }
  }
  const j = line.match(JSX_PATTERN);
  if (j && !/[=<>]/.test(j[0])) return j[0].trim();
  // A noun hidden behind an identifier is the same hand-rolled plural:
  //   `n === 1 ? POST_NOUN.one : POST_NOUN.many`
  // No quoted literal, so neither scan above can see it. On a counting line,
  // reading a `.one` / `.many` / `.singular` / `.plural` / `.nounPlural`
  // member off a *_NOUN
  // dictionary object means the call site is pluralising by hand instead of
  // asking for the parts.
  const noun = line.match(NOUN_MEMBER);
  if (noun && counting) return noun[0].trim();
  return null;
}

/** `POST_NOUN.one`, `EVIDENCE.many`, `SignalNoun.plural`, `CAPTURE.noun` … */
const NOUN_MEMBER =
  /\b[A-Za-z_][A-Za-z0-9_]*\s*\.\s*(?:one|many|One|Many|singular|plural|noun|nounPlural|Noun|NounPlural)\b/;

/** Pull quoted literals that sit inside a template literal span. A plain regex
 *  literal scan consumes the whole backtick span first, so the nested
 *  `"page" : "pages"` pair in `${n} ${n === 1 ? "page" : "pages"}` used to be
 *  invisible to the bare-noun check. */
function nestedLiteralsOfTemplates(line) {
  const out = [];
  const templateRe = /`([^`]*)`/g;
  const quotedRe = /'([^'\\]*(?:\\.[^'\\]*)*)'|"([^"\\]*(?:\\.[^"\\]*)*)"/g;
  let tmpl;
  while ((tmpl = templateRe.exec(line))) {
    const body = tmpl[1] ?? "";
    let q;
    while ((q = quotedRe.exec(body))) out.push(q[1] ?? q[2] ?? "");
  }
  return out;
}

/** Pull every string / template literal out of one line. */
function literalsOf(line) {
  const out = [];
  const re = /'([^'\\]*(?:\\.[^'\\]*)*)'|"([^"\\]*(?:\\.[^"\\]*)*)"|`([^`]*)`/g;
  let m;
  while ((m = re.exec(line))) out.push(m[1] ?? m[2] ?? m[3] ?? "");
  return out;
}

/** Files exempt entirely — only the dictionary and its Deno twin. */
const EXEMPT = [
  DICT,       // the dictionary
  DICT_TWIN,  // its Deno twin, policed by checkTwin() instead
];


/**
 * ROUND 2B — reported, not fixed in this build. Every one of these is a real
 * hit that must be migrated when Round 2B lands.
 */
const ROUND_2B = [
  // Round 2B is complete for the client surfaces: home/, useHomeAddress.ts,
  // SourcesSubTab.tsx, momentum/ and the onboarding journey are all MIGRATED
  // and policed for real. Nothing is deferred under this round any more.
];

/**
 * OUT OF THIS ROUND — surfaces outside Signals / Intelligence / composer. Real
 * hits, reported every run, migrated in a later round.
 */
const LATER_ROUNDS = [
  // TODO later-round
  "src/carousel/",
  "src/components/admin/",
  "src/components/analytics/",
  "src/components/ask/",
  "src/components/identity/",
  "src/components/influence/",
  "src/components/rail/",
  "src/components/report/",
  "src/constants/language.ts",
  "src/pages/Admin.tsx",
  "src/pages/AdminQA.tsx",
  "src/pages/Dashboard.tsx",
  "src/pages/LandingV2.tsx",
  "src/pages/TrendDetail.tsx",
  "src/utils/",
  "src/pages/Assessment.tsx",
  "src/pages/LinkedInImport.tsx",
];

/** Exact files outside this round. No parent directory is exempted. */
const LATER_FILES = [
  "src/components/AccountIntelligence.tsx",
  "src/components/AuthorityMomentumMap.tsx",
  "src/components/BrandAssessmentModal.tsx",
  "src/components/KnowledgeIntelligenceEngine.tsx",
  "src/components/LinkedInConnector.tsx",
  "src/components/LinkedInExpertAdvisor.tsx",
  "src/components/LinkedInProfileAnalyzer.tsx",
  "src/components/MilestonesSection.tsx",
  "src/components/ReportDocument.tsx",
  "src/components/SignalExplorer.tsx",
  "src/components/SignalGraph.tsx",
  "src/components/SignalsRadar.tsx",
  "src/components/StrategicEvolutionMap.tsx",
  "src/components/TierCeremonyModal.tsx",
  "src/components/TodaysStatus.tsx",
  "src/components/AuditResultsView.tsx",
  // draft / post / page nouns, out of this round:
  "src/components/DocumentUpload.tsx",
  "src/components/LinkedInDraftPanel.tsx",
  "src/components/LinkedInImportCard.tsx",
  "src/components/VoiceEngineSection.tsx",
  // Exact failures exposed when the five broad directory exemptions were removed.
  "src/components/settings/LinkedInAddressCard.tsx",
  "src/components/settings/YourLinkedInCard.tsx",
  "src/components/tabs/MarketTab.tsx",
  "src/components/voice/SpectrumRow.tsx",
  "src/components/voice/TeachAura.tsx",
  "src/components/voice/TeachAuraCoverage.tsx",
  "src/components/voice/TeachAuraReview.tsx",
  "src/components/voice/VariationEngine.tsx",
  "src/components/voice/WhatWorked.tsx",
  "src/components/voice/YourVoice.tsx",
  "src/components/widgets/WidgetCards.tsx",
  "src/lib/marketRead.ts",
  "src/lib/postProof.ts",
  "src/lib/publishFailure.ts",
  "src/lib/voiceOutcomes.ts",
  "src/lib/voiceOverview.ts",
  // ── EDGE FUNCTIONS — Round 2B Part 3 ────────────────────────────────────
  // Every member-facing sender is MIGRATED (home-address, send-lifecycle-email,
  // draft-ready-email, lifecycle-emails, weekly-progress-summary,
  // weekly-influence-brief, auras-read, onboarding-read-link). The files below
  // are named one by one — no directory prefixes — with the reason each is not
  // member-facing text:
  "supabase/functions/_shared/confidence.ts",              // internal scoring comment/string
  "supabase/functions/_shared/publishTelemetry.ts",        // telemetry payload
  "supabase/functions/_shared/readEvidence.ts",            // model context, never rendered
  "supabase/functions/_shared/voiceRefresh.ts",            // server log
  "supabase/functions/admin-console/index.ts",             // admin console
  "supabase/functions/admin-digest/index.ts",              // founder digest, admin-only
  "supabase/functions/api-health-sentinel/index.ts",       // ops alert
  "supabase/functions/ask-aura/index.ts",                  // LLM context block
  "supabase/functions/aura-health-audit/index.ts",         // ops audit
  "supabase/functions/aura-ops-report/index.ts",           // ops report, admin-only
  "supabase/functions/calculate-aura-score/index.ts",       // score internals
  "supabase/functions/chat-aura/index.ts",                 // LLM context block (VAULT STATS)
  "supabase/functions/classify-posts/index.ts",            // LLM instruction
  "supabase/functions/daily-briefing/index.ts",            // LLM instruction
  "supabase/functions/detect-signals-v2/index.ts",         // server log
  "supabase/functions/discover-linkedin-posts/index.ts",   // server log
  "supabase/functions/draft-profile-copy/index.ts",        // server log
  "supabase/functions/founder-daily-brief/index.ts",       // founder brief, admin-only
  "supabase/functions/generate-impact-narrative/index.ts", // LLM context block
  "supabase/functions/generate-market-mirror/index.ts",    // LLM context block
  "supabase/functions/import-linkedin-export/index.ts",    // import summary toast, later round
  "supabase/functions/ingest-document/index.ts",           // OCR instruction to the model
  "supabase/functions/linkedin-sync/index.ts",             // server log
  "supabase/functions/prepare-weekly-drafts/index.ts",     // server log
  "supabase/functions/qa-sentinel/index.ts",               // QA harness
  "supabase/functions/strategic-advisor/index.ts",         // LLM context block
  "supabase/functions/voice-suggest-rules/index.ts",       // LLM context block
];


const SKIP_DIRS = new Set(["__tests__", "__fixtures__", "node_modules"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(p, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec|d)\.tsx?$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

/** Strip comments so prose in a docblock never trips the gate. */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

/** Scan `src/` AND `supabase/functions/` — emails are member-facing text too,
 *  and they are the one surface that cannot import the dictionary from `src/`.
 *  Returns { hits, deferred, twin }. */
export function runVocabularyCheck() {
  const hits = [];
  const deferred = [];

  const roots = [SRC, FUNCTIONS].filter((d) => {
    try { return statSync(d).isDirectory(); } catch { return false; }
  });

  for (const root of roots) for (const file of walk(root)) {
    const rel = relative(ROOT, file).replace(/\\/g, "/");
    if (EXEMPT.includes(rel)) continue;
    const raw = readFileSync(file, "utf8");
    const stripped = stripComments(raw);
    const rawLines = raw.split("\n");
    stripped.split("\n").forEach((line, idx) => {
      if (/vocab-ok/.test(rawLines[idx] || "")) return;
      const banned = findBannedPhrase(line);
      const match = banned || findHit(line);
      if (!match) return;
      const hit = { rel, line: idx + 1, text: (rawLines[idx] || "").trim().slice(0, 160), match, banned: Boolean(banned) };
      if (banned) {
        if (BANNED_ENFORCED.some((p) => rel.startsWith(p))) hits.push(hit);
        else deferred.push(hit);
        return;
      }
      const later = ROUND_2B.some((p) => rel.startsWith(p))
        || LATER_ROUNDS.some((p) => rel.startsWith(p))
        || LATER_FILES.includes(rel);
      if (later) deferred.push(hit);
      else hits.push(hit);
    });
  }
  return { hits, deferred, twin: checkTwin() };
}

const say = (h) => h.banned
  ? `  ${h.rel}:${h.line}\n    ${h.text}\n    \u21b3 banned member-facing phrase: "${h.match}"`
  : `  ${h.rel}:${h.line}\n    ${h.text}\n    ↳ hand-written count noun: "${h.match}" — use the formatter from src/constants/vocabulary.ts`;

/** Report to the console; return the failing hits. Used by the CLI and by the
 *  Vite plugin in vite.config.ts (which throws on a non-empty result). */
export function reportVocabularyCheck({ quiet = false } = {}) {
  const { hits, deferred, twin } = runVocabularyCheck();
  if (deferred.length && !quiet) {
    console.log(`\nVOCABULARY — ${deferred.length} deferred hit(s) in files outside this round (allowlisted):`);
    for (const h of deferred) console.log(say(h));
  }
  const failures = [...hits];
  if (twin.length) {
    console.error(`\nVOCABULARY TWIN DIVERGED — ${DICT} and ${DICT_TWIN} do not say the same words:`);
    for (const p of twin) console.error(`  ${p}`);
    failures.push({ rel: DICT_TWIN, line: 1, text: "twin divergence", match: "twin" });
  }
  if (hits.length) {
    console.error(`\nVOCABULARY GATE FAILED — ${hits.length} hand-written count noun(s):`);
    for (const h of hits) console.error(say(h));
    console.error("\nuse the formatter from src/constants/vocabulary.ts (or its Deno twin in edge functions)\n");
  } else if (!twin.length && !quiet) {
    console.log(`\nVOCABULARY GATE OK — no hand-written count nouns outside the deferred allowlist; dictionary and twin agree.\n`);
  }
  return failures;
}


// CLI
if (process.argv[1] && process.argv[1].endsWith("check-vocabulary.mjs")) {
  if (reportVocabularyCheck().length) process.exit(1);
}
