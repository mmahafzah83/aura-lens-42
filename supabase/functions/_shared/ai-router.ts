/**
 * Shared AI routing utility for Supabase Edge Functions.
 *
 * Routes calls to either:
 *  - Claude Sonnet via Anthropic API (task: "quality") — for nuanced reasoning,
 *    long-form writing, strategic synthesis.
 *  - Gemini 3 Flash via the Lovable AI Gateway (task: "speed") — for fast,
 *    cheap classification, extraction, and JSON/tool-calling outputs.
 *
 * Import from any edge function with:
 *   import { callAI } from "../_shared/ai-router.ts";
 *
 * NOTE: Folders prefixed with "_" under supabase/functions/ are not deployed
 * as functions — they are bundled into the importing function at deploy time.
 */

export interface CallAIConfig {
  task: "speed" | "quality";
  systemPrompt: string;
  userMessage: string;
  /** Gemini-only: ask the model to return a JSON object */
  jsonMode?: boolean;
  /** Gemini-only: OpenAI-style tools array */
  tools?: any[];
  /** Gemini-only: OpenAI-style tool_choice */
  toolChoice?: any;
  /** Optional override for max output tokens (Anthropic only). Default 4096. */
  maxTokens?: number;
  /** Optional model override. Defaults: claude-sonnet-4-20250514 / google/gemini-3-flash-preview */
  model?: string;
}

export interface CallAIResult {
  content: string;
  raw: any;
}

export async function callAI(config: CallAIConfig): Promise<CallAIResult> {
  if (config.task === "quality") {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const body: Record<string, unknown> = {
      model: config.model ?? "claude-sonnet-4-20250514",
      max_tokens: config.maxTokens ?? 4096,
      system: config.systemPrompt,
      messages: [{ role: "user", content: config.userMessage }],
    };

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${err}`);
    }

    const data = await response.json();
    const text =
      (data.content || [])
        .map((c: any) => (typeof c?.text === "string" ? c.text : ""))
        .join("") || "";
    return { content: text, raw: data };
  }

  // Default: speed → Gemini 3 Flash via Lovable AI Gateway
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const body: Record<string, unknown> = {
    model: config.model ?? "google/gemini-3-flash-preview",
    messages: [
      { role: "system", content: config.systemPrompt },
      { role: "user", content: config.userMessage },
    ],
  };
  if (config.jsonMode) body.response_format = { type: "json_object" };
  if (config.tools) {
    body.tools = config.tools;
    if (config.toolChoice) body.tool_choice = config.toolChoice;
  }

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Lovable AI error: ${response.status} ${err}`);
  }

  const data = await response.json();
  // Prefer tool_call args when tool_choice was used; otherwise plain text content
  const msg = data.choices?.[0]?.message;
  const toolArgs = msg?.tool_calls?.[0]?.function?.arguments;
  const text = (typeof toolArgs === "string" ? toolArgs : msg?.content) || "";
  return { content: text, raw: data };
}