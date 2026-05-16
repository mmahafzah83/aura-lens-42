import { Star } from "lucide-react";

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

  return (
    <div
      style={{
        background: "linear-gradient(160deg, #1A1610, #2C2418 40%, #3D3226)",
        borderRadius: 16,
        padding: "28px 24px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute", top: -60, right: -60, width: 200, height: 200,
          background: "radial-gradient(circle, rgba(212,176,86,0.08) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <div className="relative">
        {/* Top row */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
          <div
            style={{
              width: 56, height: 56, borderRadius: "50%",
              border: "1.5px solid rgba(212,176,86,0.3)",
              background: "rgba(212,176,86,0.08)",
              display: "flex", alignItems: "center", justifyContent: "center",
              overflow: "hidden", flexShrink: 0,
            }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt={fullName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <span style={{ color: "#D4B056", fontSize: 18, fontWeight: 600, fontFamily: "'Cormorant Garamond', serif" }}>
                {initials}
              </span>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: "#E8DCC8", lineHeight: 1.2 }}>
              {fullName}
            </div>
            {roleLine && (
              <div style={{ fontSize: 12, color: "rgba(232,220,200,0.55)", marginTop: 3 }}>
                {roleLine}
              </div>
            )}
          </div>
          {tierLabel && (
            <div
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "5px 11px", borderRadius: 999,
                background: "rgba(212,176,86,0.12)",
                border: "1px solid rgba(212,176,86,0.35)",
                color: "#D4B056", fontSize: 10.5, fontWeight: 600,
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
            color: "rgba(212,176,86,0.7)", fontWeight: 600, marginBottom: 8,
          }}
        >
          Your market archetype
        </div>
        <div
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 28, color: "#D4B056", lineHeight: 1.15, marginBottom: 10,
          }}
        >
          {archetypeName || "Complete assessment to reveal your archetype"}
        </div>
        {description && (
          <p style={{ fontSize: 13, color: "rgba(232,220,200,0.75)", lineHeight: 1.6, margin: 0, marginBottom: 16 }}>
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
                  border: "1px solid rgba(212,176,86,0.35)",
                  color: "#D4B056",
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
