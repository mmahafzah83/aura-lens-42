import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Sprint F4 — slowly drifting blurred gradient orbs for atmospheric depth.
 * Reads tokens.effects.orbs_enabled / orb_color_1 / orb_color_2 / orbs_opacity
 * from design_system. Renders 3 orbs only on Home + Impact pages.
 */
interface AmbientOrbsProps {
  theme: "dark" | "light";
  /** Pass the active page so we only render on Home + Impact. */
  pageKey: "home" | "identity" | "intelligence" | "authority" | "influence" | string;
}

type ThemeValue = string | { dark: string; light: string };

let cachedFx: Record<string, ThemeValue | boolean> | null = null;
let inflight: Promise<Record<string, ThemeValue | boolean> | null> | null = null;
async function loadEffects() {
  if (cachedFx) return cachedFx;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data } = await supabase
        .from("design_system")
        .select("tokens")
        .eq("scope", "global")
        .eq("is_active", true)
        .maybeSingle();
      const tokens = (data?.tokens as { effects?: Record<string, ThemeValue | boolean> }) || {};
      cachedFx = tokens.effects || {};
      return cachedFx;
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

function resolve(v: ThemeValue | undefined, theme: "dark" | "light"): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") return v;
  return v[theme];
}

export function AmbientOrbs({ theme, pageKey }: AmbientOrbsProps) {
  const allowed = pageKey === "home" || pageKey === "influence";
  const [fx, setFx] = useState<Record<string, ThemeValue | boolean> | null>(cachedFx);

  useEffect(() => {
    if (!allowed || cachedFx) return;
    loadEffects().then((f) => setFx(f));
  }, [allowed]);

  if (!allowed) return null;

  // Defaults: enabled true, warm bronze pair, subtle opacity.
  const enabledRaw = fx?.orbs_enabled;
  let enabled = true;
  if (typeof enabledRaw === "boolean") enabled = enabledRaw;
  else if (enabledRaw && typeof enabledRaw === "object") {
    const v = (enabledRaw as { dark?: unknown; light?: unknown })[theme];
    enabled = v === true || v === "true";
  }
  if (!enabled) return null;

  const c1 =
    resolve(fx?.orb_color_1 as ThemeValue, theme) ||
    (theme === "dark" ? "#C5A55A" : "#D4B670");
  const c2 =
    resolve(fx?.orb_color_2 as ThemeValue, theme) ||
    (theme === "dark" ? "#7A5C2E" : "#E8D9B4");
  const opacityStr =
    resolve(fx?.orbs_opacity as ThemeValue, theme) ||
    (theme === "dark" ? "0.18" : "0.12");

  return (
    <div
      aria-hidden="true"
      className="aura-ambient-orbs"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 0,
        ["--orb-base-op" as string]: String(Number(opacityStr) || 0.15),
        opacity: "var(--orb-base-op)",
      }}
    >
      <span
        className="aura-orb aura-orb-1"
        style={{ background: `radial-gradient(circle, ${c1} 0%, transparent 70%)` }}
      />
      <span
        className="aura-orb aura-orb-2"
        style={{ background: `radial-gradient(circle, ${c2} 0%, transparent 70%)` }}
      />
      <span
        className="aura-orb aura-orb-3"
        style={{ background: `radial-gradient(circle, ${c1} 0%, transparent 70%)` }}
      />
    </div>
  );
}

export default AmbientOrbs;