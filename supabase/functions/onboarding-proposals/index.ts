/**
 * Three spaces the member could own — proposed from their own posts and the
 * claims they saved during the journey. The member keeps one; the two they
 * drop are recorded, because a rejection is a signal too.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Not authenticated" }, 401);
    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await anon.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return json({ error: "Not authenticated" }, 401);

    const body = await req.json().catch(() => ({} as any));
    const claims: string[] = Array.isArray(body?.claims) ? body.claims.slice(0, 8).map(String) : [];
    const sector = typeof body?.sector === "string" ? body.sector : "";
    const level = typeof body?.level === "string" ? body.level : "";

    const { data: posts } = await anon
      .from("linkedin_posts")
      .select("post_text")
      .eq("user_id", user.id)
      .order("published_at", { ascending: false })
      .limit(15);
    const excerpts = ((posts as any[]) || [])
      .map((p) => String(p.post_text || "").trim().slice(0, 400))
      .filter(Boolean);

    if (excerpts.length === 0 && claims.length === 0) return json({ options: [] });

    const KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!KEY) return json({ options: [] });

    const prompt = [
      `This person is a ${level || "senior professional"}${sector ? ` in ${sector}` : ""}.`,
      excerpts.length ? `Recent posts they wrote:\n${excerpts.map((e, i) => `${i + 1}. ${e}`).join("\n")}` : "",
      claims.length ? `Claims they saved as true of themselves:\n${claims.map((c) => `- ${c}`).join("\n")}` : "",
      "",
      "Propose exactly 3 distinct spaces this person could credibly own in their market — each grounded in the evidence above, not generic.",
      "Each option: a short name (max 5 words) and one sentence of why it fits them, in plain English, second person.",
      'Return ONLY JSON: {"options":[{"label":"...","why":"..."},{"label":"...","why":"..."},{"label":"...","why":"..."}]}',
    ].filter(Boolean).join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`AI gateway failed [${res.status}]: ${text}`);
      return json({ options: [] });
    }
    const data = await res.json();
    const content: string = data?.choices?.[0]?.message?.content ?? "";
    const match = content.match(/\{[\s\S]*\}/);
    let options: { label: string; why: string }[] = [];
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        options = (Array.isArray(parsed?.options) ? parsed.options : [])
          .map((o: any) => ({ label: String(o?.label ?? "").trim(), why: String(o?.why ?? "").trim() }))
          .filter((o: any) => o.label)
          .slice(0, 3);
      } catch { /* fall through to empty */ }
    }
    return json({ options });
  } catch (e) {
    console.error("onboarding-proposals error:", e);
    return json({ options: [] });
  }
});
