/**
 * Subject aliases, read once per session.
 *
 * The table is a convenience, never a dependency: if the read fails the matcher
 * runs exactly as it did before aliases existed. A reference table must never
 * be able to break the card.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  buildAliasIndex,
  EMPTY_ALIASES,
  type AliasIndex,
  type AliasPair,
} from "../../supabase/functions/_shared/textMatch";

let cached: Promise<AliasIndex> | null = null;

export function loadThemeAliases(): Promise<AliasIndex> {
  if (cached) return cached;
  cached = (async () => {
    try {
      const { data, error } = await supabase
        .from("theme_aliases")
        .select("canonical, alias, locale")
        .eq("active", true)
        .limit(1000);
      if (error || !data) return EMPTY_ALIASES;
      return buildAliasIndex(data as AliasPair[]);
    } catch {
      return EMPTY_ALIASES;
    }
  })();
  return cached;
}

export default loadThemeAliases;
