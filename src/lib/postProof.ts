/**
 * Proof lines for the wait — every figure computed from the member's own
 * posts. A figure that cannot be computed is omitted, never invented.
 */
import { supabase } from "@/integrations/supabase/client";

export interface PostProof {
  posts: number;
  words: number;
  pctWithNumber: number | null;
  bestMultiple: number | null;
  ownOfTotal: { own: number; total: number } | null;
  cadence: { peakMonth: string; peakCount: number; recentCount: number } | null;
  lines: string[];
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const wordsOf = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

export async function loadPostProof(userId: string): Promise<PostProof> {
  const { data } = await supabase
    .from("linkedin_posts")
    .select("post_text, like_count, published_at, acquisition")
    .eq("user_id", userId)
    .limit(500);
  const rows = ((data as any[]) || []).filter((r) => String(r.post_text || "").trim());
  const posts = rows.length;
  const words = rows.reduce((n, r) => n + wordsOf(String(r.post_text || "")), 0);

  const withNumber = rows.filter((r) => /\d/.test(String(r.post_text))).length;
  const pctWithNumber = posts >= 5 ? Math.round((withNumber / posts) * 100) : null;

  const likes = rows.map((r) => Number(r.like_count) || 0);
  const avg = likes.length ? likes.reduce((a, b) => a + b, 0) / likes.length : 0;
  const best = likes.length ? Math.max(...likes) : 0;
  const bestMultiple = avg > 0 && best / avg >= 1.5 ? Math.round((best / avg) * 10) / 10 : null;

  const own = rows.filter((r) => String(r.acquisition || "") !== "reshare").length;
  const ownOfTotal = posts > 0 && own < posts ? { own, total: posts } : null;

  const byMonth = new Map<string, number>();
  for (const r of rows) {
    const d = r.published_at ? new Date(r.published_at) : null;
    if (!d || Number.isNaN(d.getTime())) continue;
    const k = `${d.getFullYear()}-${d.getMonth()}`;
    byMonth.set(k, (byMonth.get(k) || 0) + 1);
  }
  let cadence: PostProof["cadence"] = null;
  if (byMonth.size >= 3) {
    const [k, peakCount] = [...byMonth.entries()].sort((a, b) => b[1] - a[1])[0];
    const since = Date.now() - 90 * 864e5;
    const recentCount = rows.filter((r) => r.published_at && new Date(r.published_at).getTime() >= since).length;
    if (peakCount > recentCount) {
      cadence = { peakMonth: MONTHS[Number(k.split("-")[1])], peakCount, recentCount };
    }
  }

  const lines: string[] = [];
  if (posts > 0) lines.push(`${posts} posts read · ${words.toLocaleString()} words in your own voice`);
  if (pctWithNumber !== null) lines.push(`${pctWithNumber}% of your posts contain a number`);
  if (bestMultiple !== null) lines.push(`Your best post got ${bestMultiple}× your average`);
  if (ownOfTotal) lines.push(`${ownOfTotal.own} of ${ownOfTotal.total} were your own words, not reshares`);
  if (cadence) {
    lines.push(`You posted ${cadence.peakCount} times in ${cadence.peakMonth} and ${cadence.recentCount} times since`);
  }

  return { posts, words, pctWithNumber, bestMultiple, ownOfTotal, cadence, lines };
}
