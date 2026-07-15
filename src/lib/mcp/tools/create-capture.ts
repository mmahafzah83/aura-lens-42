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
  name: "create_capture",
  title: "Capture a note into Aura",
  description: "Save a note, article link, or observation into the signed-in user's Aura knowledge base as an entry. Aura uses these captures to detect strategic signals.",
  inputSchema: {
    content: z.string().min(1).describe("The note text, quote, or article body to capture."),
    title: z.string().optional().describe("Optional short title for the capture."),
    type: z.enum(["note", "article", "observation", "quote"]).optional().describe("What kind of capture this is (default note)."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ content, title, type }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("entries")
      .insert({
        user_id: ctx.getUserId(),
        content,
        title: title ?? null,
        type: type ?? "note",
      })
      .select("id, title, type, created_at")
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Captured entry ${data.id}.` }],
      structuredContent: { entry: data },
    };
  },
});