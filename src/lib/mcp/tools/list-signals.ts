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
  name: "list_active_signals",
  title: "List active strategic signals",
  description: "List the signed-in user's active strategic signals from Aura, ordered by confidence.",
  inputSchema: {
    limit: z.number().int().min(1).max(50).optional().describe("How many signals to return (default 10)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("strategic_signals")
      .select("id, signal_title, explanation, strategic_implications, confidence, theme_tags, skill_pillars, fragment_count, status, created_at, updated_at")
      .eq("user_id", ctx.getUserId())
      .eq("status", "active")
      .order("confidence", { ascending: false })
      .limit(limit ?? 10);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { signals: data ?? [] },
    };
  },
});