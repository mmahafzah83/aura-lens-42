import { OB } from "@/components/onboarding/tokens";

/**
 * The foot of the result. Small, muted, always present.
 * Methods are cited as influences only — never as credentials.
 */
const MethodNote = ({ onNight = false }: { onNight?: boolean }) => (
  <p style={{
    margin: "18px 0 0",
    fontSize: 11.5,
    lineHeight: 1.6,
    color: onNight ? OB.mutedNight : OB.muted,
    textAlign: "start",
  }}>
    <strong style={{ fontWeight: 600 }}>How this was made</strong> — Read from your LinkedIn profile, your recent
    posts, the claims you saved, and your own answers. Built on a combination of established ways of reading
    capability and standing: describing behaviour by example rather than by score, the leadership-pipeline view of
    seniority, archetype method from brand work, and uncontested-space strategy. Aura is not affiliated with any of
    them. This is a professional read, not a clinical or psychological test.
  </p>
);

export default MethodNote;
