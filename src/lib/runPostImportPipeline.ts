import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type PipeStatus = "pending" | "running" | "done" | "error";

export interface PipelineState {
  voice: PipeStatus;
  positioning: PipeStatus;
  score: PipeStatus;
}

export const PIPELINE_LABELS = {
  voice: "Analyzing your voice...",
  positioning: "Building your positioning...",
  score: "Calculating your score...",
} as const;

/**
 * Shared post-LinkedIn-import pipeline. Runs voice-distill → generate-brand-positioning
 * → calculate-aura-score sequentially. Reports status via onUpdate, and shows a
 * success toast linking to /my-story when all three steps have completed.
 *
 * Errors in individual steps are captured (status: 'error') and the pipeline
 * continues; a generic "Will retry automatically" hint is shown on the row UI.
 */
export async function runPostImportPipeline(
  onUpdate: (state: PipelineState) => void,
  options?: { showToast?: boolean }
): Promise<PipelineState> {
  const showToast = options?.showToast ?? true;
  const state: PipelineState = { voice: "pending", positioning: "pending", score: "pending" };
  const emit = () => onUpdate({ ...state });

  const callFn = async (name: string) => {
    const { error } = await supabase.functions.invoke(name, { body: {} });
    if (error) throw error;
  };

  state.voice = "running"; emit();
  try { await callFn("voice-distill"); state.voice = "done"; }
  catch (e) { console.error("voice-distill failed", e); state.voice = "error"; }
  emit();

  state.positioning = "running"; emit();
  try { await callFn("generate-brand-positioning"); state.positioning = "done"; }
  catch (e) { console.error("generate-brand-positioning failed", e); state.positioning = "error"; }
  emit();

  state.score = "running"; emit();
  try { await callFn("calculate-aura-score"); state.score = "done"; }
  catch (e) { console.error("calculate-aura-score failed", e); state.score = "error"; }
  emit();

  if (showToast) {
    toast.success("Your Aura profile is ready. Explore your Brand Assessment.", {
      action: {
        label: "View",
        onClick: () => { window.location.href = "/my-story"; },
      },
    });
  }

  return state;
}