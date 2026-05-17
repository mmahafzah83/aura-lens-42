import { Check, Circle } from "lucide-react";

export type StepState = "done" | "active" | "waiting";

interface Step { key: string; label: string; state: StepState }

interface Props {
  hasEntries: boolean;
  hasSignals: boolean;
  publishedThisWeek: boolean;
  hasLinkedInData: boolean;
  scoreGrowing: boolean;
  authorityScore: number;
}

export default function JourneyCycle({
  hasEntries, hasSignals, publishedThisWeek, hasLinkedInData, scoreGrowing, authorityScore,
}: Props) {
  // Resolve states
  const capture: StepState = hasEntries ? "done" : "active";
  const signal: StepState = hasSignals ? "done" : (hasEntries ? "active" : "waiting");
  const publish: StepState = publishedThisWeek ? "done"
    : (hasSignals ? "active" : "waiting");
  const track: StepState = hasLinkedInData ? "done"
    : (publishedThisWeek ? "active" : "waiting");
  const authority: StepState = authorityScore > 0 && scoreGrowing ? "active"
    : authorityScore >= 80 ? "done" : "waiting";

  const steps: Step[] = [
    { key: "capture", label: "Capture", state: capture },
    { key: "signal", label: "Signal", state: signal },
    { key: "publish", label: "Publish", state: publish },
    { key: "track", label: "Track", state: track },
    { key: "authority", label: "Authority", state: authority },
  ];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        background: "var(--aura-card)",
        borderRadius: 10,
        padding: "14px 16px",
        border: "1px solid var(--aura-border)",
        gap: 0,
      }}
    >
      {steps.map((s, i) => (
        <div key={s.key} style={{ display: "flex", alignItems: "center", flex: i === steps.length - 1 ? "0 0 auto" : "1 1 auto" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, flex: "0 0 auto" }}>
            <Node state={s.state} />
            <div
              style={{
                fontSize: 9.5,
                color: s.state === "active" ? "var(--aura-accent)" : "var(--aura-t2)",
                fontWeight: s.state === "active" ? 500 : 400,
                whiteSpace: "nowrap",
              }}
            >
              {s.label}
            </div>
          </div>
          {i < steps.length - 1 && (
            <div
              style={{
                flex: 1,
                height: 2,
                background: s.state === "done" ? "var(--aura-accent)" : "var(--aura-border)",
                margin: "0 6px",
                marginBottom: 18,
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function Node({ state }: { state: StepState }) {
  if (state === "done") {
    return (
      <div style={{
        width: 32, height: 32, borderRadius: "50%",
        background: "color-mix(in srgb, var(--aura-accent) 18%, transparent)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Check size={16} color="var(--aura-accent)" strokeWidth={2.5} />
      </div>
    );
  }
  if (state === "active") {
    return (
      <div style={{
        width: 32, height: 32, borderRadius: "50%",
        background: "var(--aura-accent)",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 0 0 4px color-mix(in srgb, var(--aura-accent) 22%, transparent)",
      }}>
        <Circle size={10} fill="#fff" color="#fff" />
      </div>
    );
  }
  return (
    <div style={{
      width: 32, height: 32, borderRadius: "50%",
      background: "var(--aura-bg)",
      border: "1.5px solid var(--aura-border)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <Circle size={10} color="var(--aura-t3)" />
    </div>
  );
}