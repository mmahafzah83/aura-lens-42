import { useEffect } from "react";
import CoverCard from "@/components/signature/renderers/CoverCard";
import LineCard from "@/components/signature/renderers/LineCard";
import FrameCard from "@/components/signature/renderers/FrameCard";
import SignatureCard from "@/components/signature/renderers/SignatureCard";
import type { Lang, Mood } from "@/components/signature/renderers/shared";
import { ensureCardFontsLoaded } from "@/components/signature/fitText";

const AR_LINE = "بناء منظومات رقمية متكاملة لقطاع المياه تتجاوز الحلول التقنية المنعزلة";
const EN_LINE = "Building integrated digital ecosystems for water utilities beyond isolated point solutions";

function Cell({ label, w = 360, children }: { label: string; w?: number; children: React.ReactNode }) {
  return (
    <div data-cell={label} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontFamily: "monospace", fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "#666" }}>{label}</div>
      <div style={{ width: w, height: w * (1350 / 1080), background: "#f6f2e8", border: "1px solid #ccc", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function SignatureHarness() {
  useEffect(() => { void ensureCardFontsLoaded(); }, []);
  const common = { name: "Rashid Al Mansoori", title: "PARTNER", meta: "GCC Water Advisory" };
  const rows: Array<{ label: string; lang: Lang; mood: Mood; Comp: any; lines: string[] }> = [
    { label: "Cover EN oxblood", lang: "en", mood: "oxblood", Comp: CoverCard, lines: [EN_LINE] },
    { label: "Cover EN teal",    lang: "en", mood: "teal",    Comp: CoverCard, lines: [EN_LINE] },
    { label: "Cover EN amber",   lang: "en", mood: "amber",   Comp: CoverCard, lines: [EN_LINE] },
    { label: "Cover AR amber",   lang: "ar", mood: "amber",   Comp: CoverCard, lines: [AR_LINE] },
    { label: "Line EN teal",     lang: "en", mood: "teal",    Comp: LineCard,  lines: [EN_LINE] },
    { label: "Line AR teal",     lang: "ar", mood: "teal",    Comp: LineCard,  lines: [AR_LINE] },
    { label: "Frame EN oxblood", lang: "en", mood: "oxblood", Comp: FrameCard, lines: [EN_LINE] },
    { label: "Frame AR oxblood", lang: "ar", mood: "oxblood", Comp: FrameCard, lines: [AR_LINE] },
    { label: "Signature EN amber", lang: "en", mood: "amber", Comp: SignatureCard, lines: [EN_LINE, "GCC Water Advisory · 20 years"] },
  ];
  return (
    <div style={{ minHeight: "100vh", background: "#eeeae0", padding: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 20 }}>
        {rows.map((r) => (
          <Cell key={r.label} label={r.label}>
            <r.Comp lang={r.lang} mood={r.mood} name={common.name} title={common.title} meta={common.meta} lines={r.lines} />
          </Cell>
        ))}
      </div>
    </div>
  );
}