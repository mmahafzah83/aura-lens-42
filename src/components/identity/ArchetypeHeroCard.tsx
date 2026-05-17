import { Star, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  level?: string | null;
  firm?: string | null;
  sectorFocus?: string | null;
  archetypeName?: string;
  positioningStatement?: string;
  brandPillars?: string[];
  tierLabel?: string | null;
}

/** Convert a third-person statement to first person (best-effort, frontend only). */
function toFirstPerson(text: string, firstName?: string | null): string {
  if (!text) return text;
  let t = text.trim();
  if (firstName) {
    const re = new RegExp(`^${firstName}\\s+`, "i");
    if (re.test(t)) t = t.replace(re, "I ");
  }
  // Common third-person leads
  t = t.replace(/^(He|She|They)\s+/i, "I ");
  // Verb tweaks for the most common patterns
  t = t.replace(/^I tracks\b/, "I track")
       .replace(/^I leads\b/, "I lead")
       .replace(/^I builds\b/, "I build")
       .replace(/^I helps\b/, "I help")
       .replace(/^I works\b/, "I work")
       .replace(/^I focuses\b/, "I focus")
       .replace(/^I delivers\b/, "I deliver")
       .replace(/^I drives\b/, "I drive")
       .replace(/^I advises\b/, "I advise");
  return t;
}

export default function ArchetypeHeroCard({
  firstName, lastName, avatarUrl, level, firm, sectorFocus,
  archetypeName, positioningStatement, brandPillars, tierLabel,
}: Props) {
  const initials = ((firstName?.[0] || "") + (lastName?.[0] || "")).toUpperCase() || "Y";
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || "Your identity";
  const roleLine = [level, firm, sectorFocus].filter(Boolean).join(" · ");
  const description = toFirstPerson(positioningStatement || "", firstName);

  // Theme-aware background + glow
  let theme: "nebula" | "prism" | "terrain" = "prism";
  try { theme = (useTheme() as any).theme || "prism"; } catch {}
  const themeStyle = (() => {
    if (theme === "nebula") {
      return {
        background: "var(--aura-card-glass)",
        glow: "radial-gradient(circle, rgba(162,155,254,0.06) 0%, transparent 70%)",
      };
    }
    if (theme === "terrain") {
      return {
        background: "linear-gradient(150deg, #0A140D, #122018, #0A140D)",
        glow: "radial-gradient(circle, rgba(74,222,128,0.06) 0%, transparent 70%)",
      };
    }
    return {
      background: "linear-gradient(150deg, #12100B, #1F1A12, #2A2318)",
      glow: "radial-gradient(circle, rgba(212,176,86,0.08) 0%, transparent 70%)",
    };
  })();

  return (
    <div
      style={{
        background: themeStyle.background,
        borderRadius: 16,
        padding: "28px 24px",
        position: "relative",
        overflow: "hidden",
        border: "1px solid var(--aura-card-glass)",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute", top: -60, right: -60, width: 200, height: 200,
          background: themeStyle.glow,
          pointerEvents: "none",
        }}
      />
      <div className="relative">
        {/* Top row */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
          <div
            style={{
              width: 56, height: 56, borderRadius: "50%",
              border: "1.5px solid var(--aura-accent)",
              background: "rgba(255,255,255,0.04)",
              display: "flex", alignItems: "center", justifyContent: "center",
              overflow: "hidden", flexShrink: 0,
            }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt={fullName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <span style={{ color: "var(--aura-accent)", fontSize: 18, fontWeight: 600, fontFamily: "var(--aura-font-heading)" }}>
                {initials}
              </span>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "var(--aura-font-heading)", fontSize: 18, color: "var(--aura-t1)", lineHeight: 1.2 }}>
              {fullName}
            </div>
            {roleLine && (
              <div style={{ fontSize: 12, color: "var(--aura-t1)", opacity: 0.55, marginTop: 3 }}>
                {roleLine}
              </div>
            )}
          </div>
          {tierLabel && (
            <div
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "5px 11px", borderRadius: 999,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid var(--aura-accent)",
                color: "var(--aura-accent)", fontSize: 10.5, fontWeight: 600,
                letterSpacing: "0.05em", textTransform: "uppercase",
                flexShrink: 0,
              }}
            >
              <Star className="w-3 h-3" fill="currentColor" /> {tierLabel}
            </div>
          )}
        </div>

        {/* Archetype */}
        <div
          style={{
            fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase",
            color: "var(--aura-accent)", opacity: 0.7, fontWeight: 600, marginBottom: 8,
            display: "inline-flex", alignItems: "center", gap: 6,
          }}
        >
          Your market archetype
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" aria-label="About your archetype" style={{ background: "transparent", border: 0, color: "inherit", cursor: "help", padding: 0, opacity: 0.7 }}>
                  <Info className="w-3 h-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs text-xs">
                AI-generated from your brand assessment and audit scores. Evolves as your intelligence builds. Retake assessment anytime to update.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div
          style={{
            fontFamily: "var(--aura-font-heading)",
            fontSize: 30, color: "var(--aura-accent)", lineHeight: 1.15, marginBottom: 10,
          }}
        >
          {archetypeName || "Complete assessment to reveal your archetype"}
        </div>
        {description && (
          <p style={{ fontSize: 13, color: "var(--aura-t1)", opacity: 0.78, lineHeight: 1.6, margin: 0, marginBottom: 16 }}>
            {description}
          </p>
        )}

        {/* Territory pills */}
        {brandPillars && brandPillars.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {brandPillars.map((p, i) => (
              <span
                key={i}
                style={{
                  border: "1px solid color-mix(in srgb, var(--aura-accent) 20%, transparent)",
                  color: "var(--aura-accent)",
                  borderRadius: 20,
                  padding: "4px 11px",
                  fontSize: 11,
                  whiteSpace: "nowrap",
                }}
              >
                {p}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
