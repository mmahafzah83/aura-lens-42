/**
 * Voice & Writing — three subpages behind one underline tab row.
 *
 * Your Voice is what Aura believes; Teach Aura is where that belief comes
 * from; Test & Improve is where it is checked and corrected. The active
 * subpage lives in the URL (`?story=voice&voice=<key>`) so a recommendation
 * can link straight to it.
 */
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import YourVoice from "@/components/voice/YourVoice";
import TeachAura from "@/components/voice/TeachAura";
import TestImprove from "@/components/voice/TestImprove";
import VoiceStyles from "@/components/voice/VoiceStyles";
import ErrorBoundary from "@/components/ErrorBoundary";
import { BLUE, LINE, MUTED, TYPE } from "@/components/voice/tokens";

const TABS = [
  { key: "voice", label: "Your Voice" },
  { key: "teach", label: "Teach Aura" },
  { key: "test", label: "Test & Improve" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function VoiceWorkspace({ userId, onWrite }: { userId: string | null; onWrite: () => void }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get("voice");
  const active: TabKey = useMemo(
    () => (TABS.some((t) => t.key === raw) ? (raw as TabKey) : "voice"),
    [raw],
  );

  const go = (key: TabKey) => {
    const params = new URLSearchParams(searchParams);
    params.set("story", "voice");
    if (key === "voice") params.delete("voice");
    else params.set("voice", key);
    setSearchParams(params, { replace: false });
  };

  return (
    <div>
      <VoiceStyles />
      <div className="vd-tabrow" style={{ borderBlockEnd: `1px solid ${LINE}`, marginBlockEnd: 16 }}>
        <div role="tablist" aria-label="Voice subpages" style={{ display: "flex", gap: 18 }}>
          {TABS.map((t) => {
            const on = t.key === active;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`voice-tab-${t.key}`}
                aria-selected={on}
                aria-controls={`voice-panel-${t.key}`}
                tabIndex={on ? 0 : -1}
                onClick={() => go(t.key)}
                style={{
                  flex: "0 0 auto", whiteSpace: "nowrap", background: "transparent", border: "none",
                  borderBlockEnd: on ? `2px solid ${BLUE}` : "2px solid transparent",
                  color: on ? BLUE : MUTED, fontSize: TYPE.body, fontWeight: 600,
                  padding: "12px 0", minBlockSize: 44, cursor: "pointer",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div role="tabpanel" id={`voice-panel-${active}`} aria-labelledby={`voice-tab-${active}`}>
        <ErrorBoundary>
          {active === "voice" && <YourVoice userId={userId} onNavigate={go} />}
          {active === "teach" && <TeachAura userId={userId} />}
          {active === "test" && <TestImprove userId={userId} onWrite={onWrite} onNavigate={go} />}
        </ErrorBoundary>
      </div>
    </div>
  );
}
