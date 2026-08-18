// TEMPORARY QA probe — runs one English generation end to end so the gate
// verdict can be read. Deleted immediately after the run.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async () => {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-authority-content`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
    body: JSON.stringify({
      action: "generate_content",
      user_id: "08ba578b-281c-45a1-b95a-031564ea844f",
      language: "en",
      content_type: "post",
      stream: false,
      topic: "Why AI pilots stall between proof of concept and production in government technology programmes",
    }),
  });
  const text = await res.text();
  return new Response(text, { status: res.status, headers: { "Content-Type": "application/json" } });
});
