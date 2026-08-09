/** System-B tokens shared by the Voice pages. One definition, several files. */
export const NIGHT = "#0F1519";
export const CYAN = "#00CEC9";
export const BLUE = "#0670C4";
export const LINE = "#E2E7EE";
export const MUTED = "#5B6673";
export const INK = "#0F1519";
export const GREEN = "#12805C";
export const AMBER = "#9A6F12";
export const RED = "#C0392B";
export const MONO = "'IBM Plex Mono', ui-monospace, monospace";

export const monoNum: React.CSSProperties = { fontFamily: MONO, fontVariantNumeric: "tabular-nums" };

export const cardStyle: React.CSSProperties = {
  background: "#FFFFFF", border: `1px solid ${LINE}`, borderRadius: 16, padding: 16,
};

export const microLabel: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 600, letterSpacing: ".16em", textTransform: "uppercase", color: MUTED,
};

/** The only quiet button on the page — the single primary lives in VoiceDna. */
export const ghostButton: React.CSSProperties = {
  background: "#FFFFFF", color: MUTED, border: `1px solid ${LINE}`, borderRadius: 8,
  padding: "5px 10px", fontSize: 11.5, fontWeight: 600, cursor: "pointer",
};