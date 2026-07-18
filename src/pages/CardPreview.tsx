import AuraCard from "@/components/AuraCard";

export default function CardPreview() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#E8E2D5",
      padding: "48px 24px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 40,
      fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
    }}>
      <div style={{ fontSize: 11, letterSpacing: "0.2em", color: "rgba(27,23,18,0.6)", textTransform: "uppercase" }}>
        Aura Card · Preview
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 32, justifyContent: "center" }}>
        <AuraCard variant="voice" />
        <AuraCard variant="skills" />
      </div>
    </div>
  );
}