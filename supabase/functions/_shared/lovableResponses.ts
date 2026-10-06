import { createOpenAI } from "npm:@ai-sdk/openai";
import { streamText, type ModelMessage } from "npm:ai";
import { createLovableAiGatewayRunIdFetch } from "./lovableRunId.ts";

export function createLovableResponsesCall(config: {
  apiKey: string;
  model: string;
  instructions: string;
  messages: ModelMessage[];
  signal?: AbortSignal;
  initialRunId?: string;
}) {
  const gateway = createLovableAiGatewayRunIdFetch(config.initialRunId);
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey: config.apiKey,
    headers: { "Lovable-API-Key": config.apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: gateway.fetch,
  });
  const result = streamText({
    model: provider.responses(config.model),
    instructions: config.instructions,
    messages: config.messages,
    abortSignal: config.signal,
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });
  return { result, getRunId: gateway.getRunId };
}