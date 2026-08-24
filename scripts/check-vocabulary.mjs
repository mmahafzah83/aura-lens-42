#!/usr/bin/env node
/**
 * VOCABULARY GATE — fails the build when a member-facing count noun is written
 * by hand instead of coming from the dictionary at src/constants/vocabulary.ts.
 *
 * THE LAW (see vocabulary.ts): capture = rows in `entries`, source = rows in
 * `source_registry` / `unique_orgs`, piece of evidence = rows in
 * `evidence_fragments` / `fragment_count`, signal = rows in
 * `strategic_signals`. "fragment", "theme", "topic", "subject", "claim",
 * "thing", "item" and "reading" are never member-facing nouns for these.
 *
 * WHAT IT FLAGS: a count noun sitting next to a number — an interpolation
 * (`${...}` / `{n}` / a JSX `{expr}`) or a literal digit — inside member-facing
 * text. That is exactly the shape a formatter is supposed to produce.
 *
 * WHAT IT ALLOWS: DB column identifiers (`fragment_count`, `theme_tags`,
 * `unique_orgs`, `supporting_evidence_ids`), any other code identifier,
 * comments, the dictionary itself, tests and fixtures, and a per-line escape
 * hatch: append `// vocab-ok` with a reason.
 *
 * Run: node scripts/check-vocabulary.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

/** Banned member-facing nouns, plus the four legitimate ones (which still may
 *  not be hand-written next to a number). */
const NOUNS = [
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
];
const NOUN = `(?:${NOUNS.join("|")})`;

/**
 * Two scans, because a count noun only matters in member-facing TEXT:
 *   A) inside a string/template literal, next to `${...}` or a `{n}` placeholder;
 *   B) as JSX text right after an expression — `{n} sources`.
 * JSX attribute values (`theme={theme}`) are code, never text, so an `=` or a
 * bare identifier immediately before the brace disqualifies a match.
 */
const LITERAL_PATTERNS = [
  new RegExp(String.raw`\$\{[^}]{0,80}\}\s*(?:[A-Za-z']+\s+){0,2}${NOUN}\b`, "i"),
  new RegExp(String.raw`\{n\}\s*(?:[A-Za-z']+\s+){0,2}${NOUN}\b`, "i"),
];

const JSX_PATTERN = new RegExp(
  String.raw`(?<![=\w])\{[^{}=]{0,80}\}\s*(?:[A-Za-z']+\s+){0,2}${NOUN}\b`, "i");

/** A brace whose expression already calls the dictionary is the CORRECT shape —
 *  `{nSources(n, lang)} behind this signal` is what the gate is asking for, so
 *  it must never be reported as a hand-written count. */
const FROM_DICTIONARY = /\b(?:nSources|nCaptures|nEvidence|nSignals|evidenceAndSources|sourceCount(?:En|Ar)|captureCount(?:En|Ar)|evidenceCount(?:En|Ar)|signalCount(?:En|Ar)|cardCounts)\s*\(/;

/** Literals that are plainly code, not prose. */
const CODE_LIKE = /^(?:[\w./@-]*)$|var\(|--|px|%|hsl|rgb|#[0-9a-f]{3}/i;

/** Pull every string / template literal out of one line. */
function literalsOf(line) {
  const out = [];
  const re = /'([^'\\]*(?:\\.[^'\\]*)*)'|"([^"\\]*(?:\\.[^"\\]*)*)"|`([^`]*)`/g;
  let m;
  while ((m = re.exec(line))) out.push(m[1] ?? m[2] ?? m[3] ?? "");
  return out;
}

function findHit(rawLine) {
  // Class lists are styling, not prose — `flex items-center` is not a count.
  const line = rawLine
    .replace(/className=\{[^}]*\}/g, " ")
    .replace(/className="[^"]*"/g, " ")
    .replace(/class="[^"]*"/g, " ");
  if (FROM_DICTIONARY.test(line)) return null;
  for (const lit of literalsOf(line)) {
    if (lit.length < 4 || CODE_LIKE.test(lit)) continue;
    for (const re of LITERAL_PATTERNS) {
      const m = lit.match(re);
      if (m) return m[0].trim();
    }
  }
  const j = line.match(JSX_PATTERN);
  if (j && !/[=<>]/.test(j[0])) return j[0].trim();
  return null;
}

/** Files exempt entirely. */
const EXEMPT = [
  "src/constants/vocabulary.ts",          // the dictionary
  "src/components/studio/strings.ts",     // re-exports the dictionary
];

/**
 * ROUND 2B — reported, not fixed in this build. Every one of these is a real
 * hit that must be migrated when Round 2B lands.
 */
const ROUND_2B = [
  // TODO round-2b
  "src/components/home/",
  "src/hooks/useHomeAddress.ts",
  "src/components/momentum/",
  "src/pages/Onboarding.tsx",
  "src/components/onboarding/",
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
];

/** Single-file surfaces outside this round (flat components directory). */
const LATER_FILES_PREFIX = "src/components/";
const LATER_FILES = [
  "AccountIntelligence.tsx", "AuthorityMomentumMap.tsx", "BrandAssessmentModal.tsx",
  "KnowledgeIntelligenceEngine.tsx", "LinkedInConnector.tsx", "LinkedInExpertAdvisor.tsx",
  "LinkedInProfileAnalyzer.tsx", "MilestonesSection.tsx", "ReportDocument.tsx",
  "SignalExplorer.tsx", "SignalGraph.tsx", "SignalsRadar.tsx",
  "StrategicEvolutionMap.tsx", "TierCeremonyModal.tsx", "AuditResultsView.tsx",
].map((f) => LATER_FILES_PREFIX + f);

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

const IDENTIFIER = /[A-Za-z0-9_$]/;

function isIdentifierHit(line, match) {
  // `fragment_count`, `theme_tags`, `supporting_evidence_ids`, `sourceCount`…
  const i = line.indexOf(match);
  const before = i > 0 ? line[i - 1] : "";
  const after = line[i + match.length] || "";
  return before === "_" || after === "_" || (IDENTIFIER.test(before) && before !== " ");
}

const hits = [];
const deferred = [];

for (const file of walk(SRC)) {
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  if (EXEMPT.includes(rel)) continue;
  const raw = readFileSync(file, "utf8");
  const stripped = stripComments(raw);
  const rawLines = raw.split("\n");
  stripped.split("\n").forEach((line, idx) => {
    if (/vocab-ok/.test(rawLines[idx] || "")) return;
    const match = findHit(line);
    if (!match) return;
    const hit = { rel, line: idx + 1, text: (rawLines[idx] || "").trim().slice(0, 160), match };
    const later = ROUND_2B.some((p) => rel.startsWith(p))
      || LATER_ROUNDS.some((p) => rel.startsWith(p))
      || LATER_FILES.includes(rel);
    if (later) deferred.push(hit);
    else hits.push(hit);
  });
}

const say = (h) => `  ${h.rel}:${h.line}\n    ${h.text}\n    ↳ hand-written count noun: "${h.match}" — use the formatter from src/constants/vocabulary.ts`;

if (deferred.length) {
  console.log(`\nVOCABULARY — ${deferred.length} deferred hit(s) in files outside this round (allowlisted):`);
  for (const h of deferred) console.log(say(h));
}

if (hits.length) {
  console.error(`\nVOCABULARY GATE FAILED — ${hits.length} hand-written count noun(s):`);
  for (const h of hits) console.error(say(h));
  console.error("\nuse the formatter from src/constants/vocabulary.ts\n");
  process.exit(1);
}

console.log(`\nVOCABULARY GATE OK — no hand-written count nouns outside the deferred allowlist.\n`);
