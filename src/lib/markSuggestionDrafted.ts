import { supabase } from "@/integrations/supabase/client";

/**
 * Mark a narrative_suggestions row as 'drafted'. Best-effort: errors logged, not thrown.
 */
export const markSuggestionDrafted = (id: string): void => {
  if (!id) return;
  (supabase.from("narrative_suggestions" as any) as any)
    .update({ status: "drafted" })
    .eq("id", id)
    .then(({ error }: { error: unknown }) => {
      if (error) console.error("Failed to mark suggestion drafted:", error);
    });
};