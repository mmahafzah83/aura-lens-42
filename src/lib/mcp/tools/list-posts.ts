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
  name: "list_recent_posts",
  title: "List recent LinkedIn posts",
  description: "List the signed-in user's recent LinkedIn posts tracked by Aura (drafts and published), most recent first.",
  inputSchema: {
    limit: z.number().int().min(1).max(50).optional().describe("How many posts to return (default 10)."),
    tracking_status: z.enum(["draft", "published", "scheduled"]).optional().describe("Filter by tracking status."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, tracking_status }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("linkedin_posts")
      .select("id, post_text, format_type, framework_type, tracking_status, published_at, created_at, like_count, comment_count, repost_count, engagement_score, linkedin_url")
      .eq("user_id", ctx.getUserId())
      .order("created_at", { ascending: false })
      .limit(limit ?? 10);
    if (tracking_status) query = query.eq("tracking_status", tracking_status);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { posts: data ?? [] },
    };
  },
});