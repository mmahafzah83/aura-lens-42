/**
 * The rendering of a public read — shared by the standalone Mirror surface and
 * by step one of the assessment. One source, so the two can never drift.
 */
import { useRef, useState } from "react";
import RevealCard, {
  shareRevealCard, rasteriseRevealCard, type RevealData,
} from "@/components/onboarding/RevealCard";

export const CANVAS = "#F2F5F9";
export const CARD = "#FFFFFF";
export const LINE = "#E2E7EE";
export const INK = "#0F1519";
export const INK2 = "#5B6673";
export const BLUE = "#0670C4";
export const CYAN = "#00CEC9";
export const AMBER = "#E0A82E";
export const UI = "Inter, system-ui, sans-serif";

const ARABIC_RE = /[\u0600-\u06FF]/;

export type Read = {
  archetype?: string;
  market_read?: string;
  themes?: string[];
  uncontested_space?: string;
  honest_gap?: string;
  own_words_quote?: string;
  own_words_read?: string;
};

export const Card = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <section style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 20, padding: 20, ...style }}>
    {children}
  </section>
);

export const Dot = ({ color }: { color: string }) => (
  <span aria-hidden style={{
    display: "inline-block", inlineSize: 8, blockSize: 8, borderRadius: 999,
    background: color, marginInlineEnd: 9, verticalAlign: "middle",
  }} />
);

export const Heading = ({ children, dot }: { children: React.ReactNode; dot?: string }) => (
  <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: "0.02em", color: INK }}>
    {dot ? <Dot color={dot} /> : null}
    {children}
  </h2>
);

export const Body = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <p style={{ margin: "10px 0 0", fontSize: 15, lineHeight: 1.65, color: INK, ...style }}>{children}</p>
);

/** "18 August 2026" — the same shape the engine uses in its own notices. */
const longDate = (iso?: string | null): string | undefined => {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
};

const slugOf = (name?: string | null): string =>
  String(name ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 40) || "my-read";

/** The read itself: the card, the signals, the honest gap, the own words. */
export default function ReadResult({
  read, postsRead = 0, sparse = false,
  name, headline, avatarUrl, generatedAt, ageNote,
}: {
  read: Read; postsRead?: number; sparse?: boolean;
  /** Whose read this is — name, headline and picture, when Aura holds them. */
  name?: string | null;
  headline?: string | null;
  avatarUrl?: string | null;
  /** When the read was written. */
  generatedAt?: string | null;
  /** Quiet line about the age of a cached read. */
  ageNote?: string | null;
}) {
  const exportRef = useRef<HTMLDivElement>(null);
  const [shareNote, setShareNote] = useState<string>();

  const dateLine = longDate(generatedAt);
  const cardData: RevealData = {
    archetype: read.archetype ?? "",
    name: name ?? undefined,
    headline: headline ?? undefined,
    avatarUrl: avatarUrl ?? undefined,
    dateLine,
    ageNote: ageNote ?? undefined,
    marketRead: read.market_read ?? "",
    ownWordsQuote: read.own_words_quote,
    ownWordsRead: read.own_words_read,
    subjects: (read.themes ?? []).slice(0, 3),
    softGround: [],
    figures: postsRead > 0 ? [{ value: String(postsRead), label: "posts of yours read" }] : [],
  };

  const fileName = `aura-read-${slugOf(name)}-${(generatedAt ? new Date(generatedAt) : new Date())
    .toISOString().slice(0, 10)}.png`;

  /** Give before you ask: the file is his before we ask him to pass it on. */
  const save = async () => {
    if (!exportRef.current) return;
    setShareNote(undefined);
    try {
      const { dataUrl } = await rasteriseRevealCard(exportRef.current);
      const blob = await (await fetch(dataUrl)).blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      setShareNote("Saved to your device.");
    } catch {
      setShareNote("The card didn't render. Try once more.");
    }
  };

  const share = async () => {
    if (!exportRef.current) return;
    setShareNote(undefined);
    try {
      const outcome = await shareRevealCard(exportRef.current, {
        fileName,
        caption:
          "I had something read my LinkedIn and tell me how my field actually sees me. This is what came back.",
      });
      setShareNote(outcome === "shared" ? "Shared." : "Saved to your device, caption copied.");
    } catch {
      setShareNote("The card didn't render. Try once more.");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: UI, color: INK }}>
      {/* off-screen export node — one builder, two paths */}
      <div style={{ position: "fixed", insetInlineStart: -10000, insetBlockStart: 0 }} aria-hidden>
        <RevealCard ref={exportRef} data={cardData} forExport emptyFiguresLine={read.uncontested_space ?? ""} />
      </div>

      <RevealCard data={cardData} emptyFiguresLine={read.uncontested_space ?? ""} />

      {sparse ? (
        <Card>
          <Heading>Your profile is quieter than your career.</Heading>
          <Body>Aura can see the shape but not the substance. Two questions or one CV would change that.</Body>
        </Card>
      ) : (
        <>
          {read.own_words_quote ? (
            <Card>
              <Heading>In your own words</Heading>
              {(() => {
                const arabic = ARABIC_RE.test(read.own_words_quote ?? "");
                const script: React.CSSProperties = arabic
                  ? { fontFamily: "Cairo, 'IBM Plex Sans Arabic', sans-serif", lineHeight: 1.9, textAlign: "start" }
                  : {};
                return (
                  <>
                    <p dir="auto" style={{ margin: "10px 0 0", fontSize: 15, lineHeight: 1.65,
                      color: INK, fontStyle: arabic ? "normal" : "italic", ...script }}>
                      {`“${read.own_words_quote}”`}
                    </p>
                    {read.own_words_read ? (
                      <p dir="auto" style={{ margin: "10px 0 0", fontSize: 14, lineHeight: 1.65, color: INK2, ...script }}>
                        {read.own_words_read}
                      </p>
                    ) : null}
                  </>
                );
              })()}
            </Card>
          ) : null}

          {read.uncontested_space ? (
            <Card>
              <Heading dot={CYAN}>The space nobody has claimed</Heading>
              <Body>{read.uncontested_space}</Body>
            </Card>
          ) : null}

          {read.honest_gap ? (
            <Card>
              <Heading dot={AMBER}>One honest gap</Heading>
              <Body>{read.honest_gap}</Body>
            </Card>
          ) : null}
        </>
      )}

      <div>
        <button
          onClick={save}
          style={{
            inlineSize: "100%", padding: "13px 18px", borderRadius: 8,
            border: `1px solid ${BLUE}`, background: BLUE, color: "#FFFFFF",
            fontFamily: UI, fontSize: 15, fontWeight: 600, cursor: "pointer",
          }}
        >Save this card</button>
        <button
          onClick={share}
          style={{
            display: "block", marginBlockStart: 10, marginInline: "auto",
            background: "none", border: "none", padding: 0, color: INK2,
            fontFamily: UI, fontSize: 13.5, textDecoration: "underline", cursor: "pointer",
          }}
        >Or share it</button>
        {shareNote ? <p style={{ margin: "8px 0 0", fontSize: 12.5, color: INK2 }}>{shareNote}</p> : null}
      </div>
    </div>
  );
}
