/** Deck lifecycle telemetry. Best-effort: a logging failure never blocks an export. */
import { supabase } from "@/integrations/supabase/client";
import type { DeckIR } from "../deckIR";

export type DeckEvent =
  | "generated"
  | "validation_failed"
  | "rendered"
  | "exported"
  | "export_failed"
  | "published"
  | "publish_failed"
  | "abandoned";

export async function logDeckEvent(
  event: DeckEvent,
  deck: DeckIR,
  extra: {
    theme?: string;
    fitSteps?: number;
    durationMs?: number;
    invariantFailures?: string[];
    /** Size of the produced PDF. Logged on every publish attempt, pass or fail. */
    pdfBytes?: number;
  } = {},
): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user?.id;
    if (!userId) return; // anonymous dev harness — nothing to attribute
    await supabase.from("deck_events").insert({
      user_id: userId,
      deck_id: deck.deck_id,
      event,
      lang: deck.primary_lang,
      theme: extra.theme ?? deck.theme,
      length: deck.slides.length,
      fit_steps: extra.fitSteps ?? null,
      duration_ms: extra.durationMs ?? null,
      invariant_failures: extra.invariantFailures ?? null,
      pdf_bytes: extra.pdfBytes ?? null,
    });
  } catch {
    /* telemetry must never break the export */
  }
}
