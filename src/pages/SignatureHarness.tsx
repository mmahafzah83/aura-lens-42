import { useEffect } from "react";
import CoverCard from "@/components/signature/renderers/CoverCard";
import LineCard from "@/components/signature/renderers/LineCard";
import FrameCard, { type FrameDecision } from "@/components/signature/renderers/FrameCard";
import SignatureCard from "@/components/signature/renderers/SignatureCard";
import type { Lang, Mood } from "@/components/signature/renderers/shared";
import { ensureCardFontsLoaded } from "@/components/signature/fitText";

const AR_LINE = "بناء منظومات رقمية متكاملة لقطاع المياه تتجاوز الحلول التقنية المنعزلة";
const EN_LINE = "Building integrated digital ecosystems for water utilities beyond isolated point solutions";
const EN_LINE2 = "Directing enterprise transformation through digital capital investment";
const PORTRAIT_PHOTO = "/hero-head.png";
const BRIGHT_PHOTO = "/test-bright.jpg";

const FRAME_EN_DECISION: FrameDecision = {
  textZone: "upper-left",
  scrim: "soft",
  cropFocusY: 0.65,
  emphasis: [{ phrase: "isolated pilots", style: "color" }],
};
const FRAME_AR_DECISION: FrameDecision = {
  textZone: "upper-right",
  scrim: "strong",
  cropFocusY: 0.35,
  emphasis: [{ phrase: "بنية", style: "color" }],
};
const FRAME_EN_LINE = "Water utilities must move beyond isolated pilots toward integrated ecosystems";
const FRAME_AR_LINE = "الثقة لم تعد قيمة أخلاقية.. أصبحت بنية تحتية";

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
  const portraits = [
    {
      label: "Portrait EN oxblood",
      lang: "en" as Lang, mood: "oxblood" as Mood,
      name: "Mohammad Mahafzah",
      title: "Director of Digital Transformation",
      meta: "EY",
      lines: ["Architecting integrated digital ecosystems for modern water and energy utilities", EN_LINE2],
      photoUrl: PORTRAIT_PHOTO,
    },
    {
      label: "Portrait AR teal",
      lang: "ar" as Lang, mood: "teal" as Mood,
      name: "محمد محافظة",
      title: "مدير التحول الرقمي",
      meta: "",
      lines: [AR_LINE],
      photoUrl: PORTRAIT_PHOTO,
    },
  ];
  return (
    <div style={{ minHeight: "100vh", background: "#eeeae0", padding: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 20 }}>
        {rows.map((r) => (
          <Cell key={r.label} label={r.label}>
            <r.Comp lang={r.lang} mood={r.mood} name={common.name} title={common.title} meta={common.meta} lines={r.lines} />
          </Cell>
        ))}
        {portraits.map((p) => (
          <Cell key={p.label} label={p.label}>
            <SignatureCard lang={p.lang} mood={p.mood} name={p.name} title={p.title} meta={p.meta} lines={p.lines} photoUrl={p.photoUrl} />
          </Cell>
        ))}
      </div>
      {/* Full-size render targets for Playwright proof (on-screen so element.screenshot works) */}
      <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 40 }}>
        <div id="portrait-en" style={{ width: 1080, height: 1350 }}>
          <SignatureCard
            lang="en" mood="oxblood"
            name="Mohammad Mahafzah"
            title="Director of Digital Transformation"
            meta="EY"
            lines={["Architecting integrated digital ecosystems for modern water and energy utilities", EN_LINE2]}
            photoUrl={PORTRAIT_PHOTO}
          />
        </div>
        <div id="portrait-ar" style={{ width: 1080, height: 1350 }}>
          <SignatureCard
            lang="ar" mood="teal"
            name="محمد محافظة"
            title="مدير التحول الرقمي"
            meta=""
            lines={[AR_LINE]}
            photoUrl={PORTRAIT_PHOTO}
          />
        </div>
        <div id="frame-en" style={{ width: 1080, height: 1350 }}>
          <FrameCard
            lang="en" mood="amber"
            name="Mohammad Mahafzah"
            title="Director of Digital Transformation"
            meta="EY"
            lines={[FRAME_EN_LINE]}
            photoUrl={BRIGHT_PHOTO}
            decision={FRAME_EN_DECISION}
          />
        </div>
        <div id="frame-ar" style={{ width: 1080, height: 1350 }}>
          <FrameCard
            lang="ar" mood="teal"
            name="محمد محافظة"
            title="مدير التحول الرقمي"
            meta=""
            lines={[FRAME_AR_LINE]}
            photoUrl={PORTRAIT_PHOTO}
            decision={FRAME_AR_DECISION}
          />
        </div>
        <div id="frame-default" style={{ width: 1080, height: 1350 }}>
          <FrameCard
            lang="en" mood="oxblood"
            name="Rashid Al Mansoori"
            title="Partner"
            meta="GCC Water Advisory"
            lines={[FRAME_EN_LINE]}
            photoUrl={BRIGHT_PHOTO}
          />
        </div>
        <div id="frame-lower-right" style={{ width: 1080, height: 1350 }}>
          <FrameCard
            lang="en" mood="amber"
            name="Mohammad Mahafzah"
            title="Director"
            meta="EY"
            lines={[FRAME_EN_LINE]}
            photoUrl={BRIGHT_PHOTO}
            decision={{
              textZone: "lower-right",
              scrim: "soft",
              cropFocusY: 0.35,
              emphasis: [{ phrase: "integrated ecosystems", style: "color" }],
            }}
          />
        </div>
      </div>
    </div>
  );
}