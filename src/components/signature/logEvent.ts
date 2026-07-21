import { supabase } from "@/integrations/supabase/client";

export type SignatureAction = "suggested" | "picked" | "edited" | "exported" | "published";

export async function logSignatureEvent(
  action: SignatureAction,
  family: string,
  lang: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return;
    await supabase.from("signature_events").insert({
      user_id: uid,
      family,
      lang,
      action,
      payload,
    });
  } catch (err) {
    console.warn("signature_events log failed", err);
  }
}