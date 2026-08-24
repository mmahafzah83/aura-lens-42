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

/** Number-ish on the left: ${...}, {expr}, or a bare digit run. */
const PATTERNS = [
  new RegExp(String.raw`\$\{[^}]{0,80}\}\s*(?:\w+\s+){0,2}${NOUN}\b`, "i"),
  new RegExp(String.raw`\{[^{}]{0,80}\}\s*(?:\w+\s+){0,2}${NOUN}\b`, "i"),
  new RegExp(String.raw`\b\d+\s+(?:\w+\s+){0,1}${NOUN}\b`, "i"),
  new RegExp(String.raw`${NOUN}\b\s*(?::|=)?\s*\$\{`, "i"),
];

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
    // Only member-facing text: something quoted, or JSX text next to a brace.
    if (!/["'`]/.test(line) && !/[{}]/.test(line)) return;
    for (const re of PATTERNS) {
      const m = line.match(re);
      if (!m) continue;
      if (isIdentifierHit(line, m[0])) continue;
      const hit = { rel, line: idx + 1, text: (rawLines[idx] || "").trim().slice(0, 160), match: m[0].trim() };
      if (ROUND_2B.some((p) => rel.startsWith(p))) deferred.push(hit);
      else hits.push(hit);
      break;
    }
  });
}

const say = (h) => `  ${h.rel}:${h.line}\n    ${h.text}\n    ↳ hand-written count noun: "${h.match}" — use the formatter from src/constants/vocabulary.ts`;

if (deferred.length) {
  console.log(`\nVOCABULARY — ${deferred.length} deferred hit(s) in Round 2B files (allowlisted):`);
  for (const h of deferred) console.log(say(h));
}

if (hits.length) {
  console.error(`\nVOCABULARY GATE FAILED — ${hits.length} hand-written count noun(s):`);
  for (const h of hits) console.error(say(h));
  console.error("\nuse the formatter from src/constants/vocabulary.ts\n");
  process.exit(1);
}

console.log(`\nVOCABULARY GATE OK — no hand-written count nouns outside the Round 2B allowlist.\n`);
