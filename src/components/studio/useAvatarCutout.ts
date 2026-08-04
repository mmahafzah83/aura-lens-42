/**
 * Z1 — THE CLOSING SLIDE ACTUALLY GETS THE PORTRAIT.
 *
 * The closing slide draws `profile.avatar_cutout_url`. That column was only
 * ever filled if a member happened to accept the cut-out offer at the moment
 * they uploaded their photo in Account, so most members had a photo and no
 * portrait, and the slide silently fell back to the signature block.
 *
 * This hook closes that gap: when the member's own row has an `avatar_url`
 * but no `avatar_cutout_url`, the cut-out is produced ONCE, in the
 * background, in this browser, and written back to that member's own row.
 * It blocks nothing — the member keeps writing while it runs, and the
 * inspector reports "preparing" / "shows your portrait" / a plain failure.
 *
 * MULTI-TENANCY: every read and write is keyed on the requesting user's own
 * `user_id`, and the storage path is namespaced by that id. No value here is
 * shared between members.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cutOutBackground } from "@/lib/imagePrep";

export type PortraitState = "none" | "preparing" | "ready" | "failed";

/** Guard against a second run for the same member within one page life. */
const attempted = new Set<string>();

export function useAvatarCutout(): { state: PortraitState; cutoutUrl: string | null } {
  const [state, setState] = useState<PortraitState>("none");
  const [cutoutUrl, setCutoutUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const userId = sess.session?.user?.id;
      if (!userId) return;

      const { data } = await (supabase.from("diagnostic_profiles" as any) as any)
        .select("avatar_url, avatar_cutout_url")
        .eq("user_id", userId)
        .maybeSingle();
      if (!alive) return;

      const avatar: string | null = data?.avatar_url ?? null;
      const existing: string | null = data?.avatar_cutout_url ?? null;
      if (existing) { setCutoutUrl(existing); setState("ready"); return; }
      if (!avatar) { setState("none"); return; }
      if (attempted.has(userId)) { setState("failed"); return; }
      attempted.add(userId);

      setState("preparing");
      try {
        const res = await fetch(avatar);
        if (!res.ok) throw new Error("avatar unreadable");
        const cut = await cutOutBackground(await res.blob());
        if (!cut) throw new Error("no clean cut-out");

        const path = `${userId}/avatar-cutout.png`;
        const { error: upErr } = await supabase.storage
          .from("avatars")
          .upload(path, cut, { upsert: true, contentType: "image/png" });
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
        const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
        await (supabase.from("diagnostic_profiles" as any) as any)
          .update({ avatar_cutout_url: publicUrl }).eq("user_id", userId);
        if (!alive) return;
        setCutoutUrl(publicUrl);
        setState("ready");
      } catch {
        if (alive) setState("failed");
      }
    })();
    return () => { alive = false; };
  }, []);

  return { state, cutoutUrl };
}