/**
 * INTEREST IS A RANKING SIGNAL AND NOTHING ELSE.
 *
 * What a man reads and says he wants tells us which of two equally provable
 * records to put in front of him first. It is never proof that he can do the
 * work, it is never cited as evidence, and it may never open or close a gate.
 * The line it produces is a fact about him — "you have read six things on this
 * subject since July" — never a claim about the employer.
 */
import { subjectOverlap, SUBJECT_OVERLAP_MIN } from "./writeValue.ts";

export type FaceRow = { face: string; summary?: string | null; keywords?: unknown };
export type CaptureRow = { title?: string | null; summary?: string | null; content?: string | null; created_at?: string | null };

export type Interest = {
  /** 0 … 1, the strongest overlap with what he reads and wants */
  score: number;
  /** the words the record and his own reading share */
  terms: string[];
  /** how many of his own captures touch the same subject */
  captures: number;
  /** the first of those captures, so the line can say "since July" */
  since: string | null;
  faces: string[];
};

const textOf = (face: FaceRow) =>
  [String(face.summary ?? ""), Array.isArray(face.keywords) ? (face.keywords as string[]).join(" ") : ""]
    .join(" ").trim();

export function interestOf(
  opportunity: { title?: string | null; scope?: string | null; sector?: string | null },
  faces: FaceRow[],
  captures: CaptureRow[],
): Interest {
  const subject = [opportunity?.title, opportunity?.scope, opportunity?.sector]
    .filter(Boolean).join(" ");
  let score = 0;
  const terms = new Set<string>();
  const hitFaces: string[] = [];

  for (const face of faces) {
    if (!["reads", "wants"].includes(String(face.face))) continue;
    const body = textOf(face);
    if (!body) continue;
    const overlap = subjectOverlap(subject, body);
    if (overlap.score > score) score = overlap.score;
    if (overlap.score >= SUBJECT_OVERLAP_MIN) {
      hitFaces.push(String(face.face));
      for (const term of overlap.shared ?? []) terms.add(term);
    }
  }

  let captureCount = 0;
  let since: string | null = null;
  for (const row of captures) {
    const body = [row.title, row.summary, row.content].filter(Boolean).join(" ").slice(0, 2_000);
    if (!body) continue;
    if (subjectOverlap(subject, body).score < SUBJECT_OVERLAP_MIN) continue;
    captureCount++;
    const at = row.created_at ? String(row.created_at) : null;
    if (at && (!since || at < since)) since = at;
  }

  return {
    score: +score.toFixed(3),
    terms: [...terms].slice(0, 8),
    captures: captureCount,
    since,
    faces: hitFaces,
  };
}
