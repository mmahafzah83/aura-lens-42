import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "get_signal_details",
  title: "Get signal details with evidence",
  description: "Get one Aura strategic signal by id, including its full explanation, strategic implications, and supporting evidence fragments.",
  inputSchema: {
    signal_id: z.string().uuid().describe("The strategic signal id."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ signal_id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data: signal, error } = await supabase
      .from("strategic_signals")
      .select("id, signal_title, explanation, strategic_implications, supporting_evidence_ids, theme_tags, skill_pillars, confidence, fragment_count, framework_opportunity, content_opportunity, status, created_at, updated_at")
      .eq("id", signal_id)
      .eq("user_id", ctx.getUserId())
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!signal) return { content: [{ type: "text", text: "Signal not found." }], isError: true };

    const evidenceIds: string[] = (signal as any).supporting_evidence_ids ?? [];
    let evidence: any[] = [];
    if (evidenceIds.length > 0) {
      const { data: frags } = await supabase
        .from("evidence_fragments")
        .select("id, title, content, source_type, created_at")
        .in("id", evidenceIds)
        .limit(20);
      evidence = frags ?? [];
    }
    const payload = { signal, evidence };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});