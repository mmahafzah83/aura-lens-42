import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const RATES: Record<string, { in: number; out: number }> = {
  "claude-sonnet-4-5-20250929": { in: 3, out: 15 },
  "claude-sonnet-4-20250514":   { in: 3, out: 15 },
};
function estimateCost(model: string, i: number, o: number) {
  const r = RATES[model] || { in: 0, out: 0 };
  return +(((i * r.in) + (o * r.out)) / 1_000_000).toFixed(6);
}
export async function logAIUsage(e: {
  user_id?: string | null; function_name: string; provider: string;
  model?: string; input_tokens?: number; output_tokens?: number;
  success?: boolean; metadata?: Record<string, unknown>;
}) {
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const i = e.input_tokens ?? 0, o = e.output_tokens ?? 0;
    await admin.from("ai_usage_log").insert({
      user_id: e.user_id ?? null, function_name: e.function_name, provider: e.provider,
      model: e.model ?? null, input_tokens: i, output_tokens: o,
      est_cost_usd: estimateCost(e.model ?? "", i, o), success: e.success ?? true,
      metadata: e.metadata ?? {},
    });
  } catch (err) { console.error("logAIUsage failed (non-blocking):", err); }
}