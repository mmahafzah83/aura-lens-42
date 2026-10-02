import { readFileSync } from "node:fs";

/* The public backend address and publishable key, from the environment or .env.
   Both are public by design — the app ships them to every browser. */
export function backend(): { url: string; key: string } {
  let url = process.env.VITE_SUPABASE_URL || "";
  let key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
  if (!url || !key) {
    try {
      for (const line of readFileSync(".env", "utf8").split("\n")) {
        const m = line.match(/^\s*(VITE_SUPABASE_URL|VITE_SUPABASE_PUBLISHABLE_KEY)\s*=\s*"?([^"\n]*)"?/);
        if (m && m[1] === "VITE_SUPABASE_URL" && !url) url = m[2];
        if (m && m[1] === "VITE_SUPABASE_PUBLISHABLE_KEY" && !key) key = m[2];
      }
    } catch { /* no .env */ }
  }
  return { url, key };
}

export async function rpc(fn: string, body: Record<string, unknown>) {
  const { url, key } = backend();
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${fn} ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

export type QRow = {
  id: string; position: number; kind: string; prompt: string;
  options: { label: string; value: string }[] | null; allow_none: boolean | null;
};

export async function questionsFor(band: string): Promise<QRow[]> {
  const { url, key } = backend();
  const q = `select=id,position,kind,prompt,options,allow_none&band=eq.${band}&active=eq.true&sector=is.null&order=position`;
  const res = await fetch(`${url}/rest/v1/onboarding_questions?${q}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`onboarding_questions ${res.status}`);
  return res.json();
}

/** A free anonymous session, seeded at the questions screen. No read is spent. */
export async function seedQuestionsSession(band = "work"): Promise<string> {
  const token: string = await rpc("create_assessment_session", {});
  const ok = await rpc("save_assessment_session", {
    p_token: token,
    p_state: { step: "onboarding", journey_screen: 11, q_idx: 0, answers: {}, profile: { seniority_band: band } },
  });
  if (ok !== true) throw new Error("save_assessment_session refused");
  return token;
}
