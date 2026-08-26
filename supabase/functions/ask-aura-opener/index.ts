import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { nCaptures, nSignals } from "../_shared/vocabulary.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Chip = { label: string; prompt: string };
type Opener = { kind: string; text: string; chips: Chip[] };

const ELSE: Chip = { label: "Something else", prompt: "Let's talk about something else." };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const daysSince = (iso: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Not authenticated" }, 401);

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) return json({ error: "Invalid session" }, 401);

    // user_id comes only from the verified JWT, never from the request body.
    const user_id = userRes.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    /* ── RULE 1 — promise ── */
    const since14 = new Date(Date.now() - 14 * 86400000).toISOString();
    const { data: memRows } = await admin
      .from("aura_conversation_memory")
      .select("actions_committed, created_at")
      .eq("user_id", user_id)
      .is("role", null)
      .not("actions_committed", "is", null)
      .gte("created_at", since14)
      .order("created_at", { ascending: false })
      .limit(5);

    const promiseRow = (memRows || []).find(
      (r: any) =>
        Array.isArray(r.actions_committed) &&
        r.actions_committed.length > 0 &&
        typeof r.actions_committed[0] === "string" &&
        r.actions_committed[0].trim(),
    );
    if (promiseRow) {
      const first = String((promiseRow as any).actions_committed[0]).trim();
      const out: Opener = {
        kind: "promise",
        text: `You said you would ${first}. Still the right move?`,
        chips: [
          { label: "Help me finish it", prompt: `Help me finish this: ${first}` },
          { label: "What changed since?", prompt: "What has changed in my signals since I said that?" },
          ELSE,
        ],
      };
      return json(out);
    }

    /* ── RULE 2 — draft ── */
    const { data: draftRows } = await admin
      .from("linkedin_posts")
      .select("title, post_text, created_at")
      .eq("user_id", user_id)
      .eq("tracking_status", "draft")
      .order("created_at", { ascending: false })
      .limit(1);

    const draft: any = draftRows?.[0] || null;
    if (draft) {
      const title = typeof draft.title === "string" ? draft.title.trim() : "";
      const body = typeof draft.post_text === "string" ? draft.post_text.trim() : "";
      const label = title || (body ? `${body.slice(0, 60)}…` : "");
      if (label) {
        const out: Opener = {
          kind: "draft",
          text: `You have a draft waiting — "${label}" — and nothing planned for it.`,
          chips: [
            { label: "Open it", prompt: `Show me my draft "${label}" and tell me honestly whether it is ready.` },
            { label: "Tighten it first", prompt: `Tighten my draft "${label}" — cut anything that is not carrying weight.` },
            ELSE,
          ],
        };
        return json(out);
      }
    }

    /* ── RULE 3 — unwritten signal ── */
    const { data: sigRows } = await admin
      .from("strategic_signals")
      .select("id, signal_title, fragment_count, created_at, priority_score")
      .eq("user_id", user_id)
      .eq("status", "active")
      .order("priority_score", { ascending: false })
      .limit(25);

    const signals = (sigRows || []) as any[];
    if (signals.length) {
      const { data: usedRows } = await admin
        .from("linkedin_posts")
        .select("source_signal_id")
        .eq("user_id", user_id)
        .in("source_signal_id", signals.map((s) => s.id));
      const used = new Set((usedRows || []).map((r: any) => r.source_signal_id));
      const unwritten = signals.find((s) => !used.has(s.id));
      if (unwritten) {
        const n = daysSince(unwritten.created_at);
        const frags = Number(unwritten.fragment_count ?? 0);
        const t = String(unwritten.signal_title);
        const out: Opener = {
          kind: "unwritten signal",
          text: out2text,
          const subject = `${t} signal`;
        const out2text = `Your ${subject} has been live ${n} days with ${nCaptures(frags, "en")} behind it, and you have not written from it yet.`;
        void 0;
          chips: [
            { label: "Draft it", prompt: `Draft a post from my signal "${t}" using the evidence behind it.` },
            { label: "Show me the evidence", prompt: `What evidence sits behind "${t}"?` },
            ELSE,
          ],
        };
        return json(out);
      }
    }

    /* ── RULE 4 — quiet radar ── */
    const { data: lastEntry } = await admin
      .from("entries")
      .select("created_at")
      .eq("user_id", user_id)
      .order("created_at", { ascending: false })
      .limit(1);
    const lastAt = lastEntry?.[0]?.created_at as string | undefined;
    if (lastAt) {
      const n = daysSince(lastAt);
      if (n > 7) {
        const out: Opener = {
          kind: "quiet radar",
          text: `Your last capture was ${n} days ago. There is still plenty here to work with.`,
          chips: [
            { label: "What is still live?", prompt: "Which of my signals are still worth acting on right now?" },
            { label: "What should I write?", prompt: "From what I have already captured, what should I write next?" },
            ELSE,
          ],
        };
        return json(out);
      }
    }

    /* ── RULE 5 — cold start ── */
    const [{ count: entryCount }, { count: signalCount }] = await Promise.all([
      admin.from("entries").select("id", { count: "exact", head: true }).eq("user_id", user_id),
      admin
        .from("strategic_signals")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user_id)
        .eq("status", "active"),
    ]);
    const E = entryCount ?? 0;
    const S = signalCount ?? 0;

    if (E === 0 && S === 0) {
      return json({
        kind: "cold start",
        text: "I do not have anything of yours to read yet. Capture one article and I will have something to say about it.",
        chips: [
          {
            label: "What should I capture?",
            prompt: "What kind of sources are actually worth capturing for someone in my position?",
          },
        ],
      } satisfies Opener);
    }

    return json({
      kind: "cold start",
      text: `I can see ${nCaptures(E, "en")} and ${S} live ${nSignals(S, "en").replace(/^\d+\s/, "")} of yours. Ask me anything inside that.`,
      chips: [
        { label: "What can you see?", prompt: "What can you actually see in my graph right now?" },
        { label: "What should I write?", prompt: "From what I have already captured, what should I write next?" },
      ],
    } satisfies Opener);
  } catch (e) {
    console.error("ask-aura-opener failed:", e);
    return json({ error: "opener unavailable" }, 500);
  }
});
