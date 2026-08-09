/**
 * Voice & Writing — four subpages behind one underline tab row.
 *
 * Only Voice Overview is built in this step. Voice DNA holds the existing
 * engine untouched; Teach Aura and Test & Improve say plainly that they are
 * not built yet rather than showing invented data.
 *
 * The active subpage lives in the URL (`?story=voice&voice=<key>`) so a
 * recommendation can link straight to it.
 */
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import VoiceOverview from "@/components/voice/VoiceOverview";
import VoiceDna from "@/components/voice/VoiceDna";
import TeachAura from "@/components/voice/TeachAura";

const BLUE = "#0670C4";
const MUTED = "#5B6673";
const LINE = "#E2E7EE";

const TABS = [
  { key: "overview", label: "Voice Overview" },
  { key: "dna", label: "Voice DNA" },
  { key: "teach", label: "Teach Aura" },
  { key: "test", label: "Test & Improve" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function Placeholder({ title }: { title: string }) {
  return (
    <div
      style={{
        background: "#FFFFFF", border: `1px solid ${LINE}`, borderRadius: 16, padding: 20,
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 600, color: "#0F1519" }}>{title}</div>
      <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, marginBlockStart: 6, marginBlockEnd: 0 }}>
        Coming in this build. Nothing here yet — Aura won't show you numbers it hasn't measured.
      </p>
    </div>
  );
}

export default function VoiceWorkspace({
  userId,
  onWrite,
}: {
  userId: string | null;
  onWrite: () => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get("voice");
  const active: TabKey = useMemo(
    () => (TABS.some((t) => t.key === raw) ? (raw as TabKey) : "overview"),
    [raw],
  );

  const go = (key: TabKey) => {
    const params = new URLSearchParams(searchParams);
    params.set("story", "voice");
    if (key === "overview") params.delete("voice");
    else params.set("voice", key);
    setSearchParams(params, { replace: false });
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label="Voice subpages"
        style={{
          display: "flex", gap: 20, overflowX: "auto", borderBlockEnd: `1px solid ${LINE}`,
          marginBlockEnd: 16, WebkitOverflowScrolling: "touch",
        }}
      >
        {TABS.map((t) => {
          const on = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => go(t.key)}
              style={{
                flex: "0 0 auto", whiteSpace: "nowrap", background: "transparent", border: "none",
                borderBlockEnd: on ? `2px solid ${BLUE}` : "2px solid transparent",
                color: on ? BLUE : MUTED, fontSize: 13, fontWeight: 600,
                padding: "8px 0", cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {active === "overview" && <VoiceOverview userId={userId} onNavigate={go} />}
      {active === "dna" && <VoiceDna userId={userId} onWrite={onWrite} onNavigate={go} />}
      {active === "teach" && <TeachAura userId={userId} />}
      {active === "test" && <Placeholder title="Test & Improve" />}
    </div>
  );
}