import { useMemo, useRef, useState } from "react";
import { Download, Copy, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import VisualCardRenderer from "./VisualCardRenderer";
import type { CardStyleName } from "./styles/cardStyles";
import type { CardType } from "./types";
import { exportCardAsPng, downloadBlob, extractDataPoints, extractStat, trunc, deriveContentForType } from "./exportCard";

interface CardPreviewPanelProps {
  postText: string;
  topicLabel?: string;
  language: 'en' | 'ar';
  authorName: string;
  authorTitle: string;
  recommendedStyle?: CardStyleName;
  recommendedType?: CardType;
  recommendedHighlight?: string;
}

const STYLES: { name: CardStyleName; label: string; swatch: string; border?: boolean }[] = [
  { name: 'blackboard', label: 'Blackboard', swatch: '#0d0d0d' },
  { name: 'ember',      label: 'Ember',      swatch: '#2d1108' },
  { name: 'teal',       label: 'Teal',       swatch: '#0A2E2E' },
  { name: 'paper',      label: 'Paper',      swatch: '#FAF6EE', border: true },
  { name: 'navy',       label: 'Navy',       swatch: '#0C1B33' },
  { name: 'sand',       label: 'Sand',       swatch: '#E8DCC8', border: true },
];

const CARD_TYPES: CardType[] = ['insight', 'framework', 'stat', 'comparison', 'question', 'principles', 'cycle', 'equation'];

function defaultStyleFor(language: 'en' | 'ar', recommended?: CardStyleName): CardStyleName {
  if (recommended) return recommended;
  return language === 'ar' ? 'sand' : 'blackboard';
}

export default function CardPreviewPanel(props: CardPreviewPanelProps) {
  const { postText, topicLabel, language, authorName, authorTitle } = props;
  const [style, setStyle] = useState<CardStyleName>(defaultStyleFor(language, props.recommendedStyle));
  const [cardType, setCardType] = useState<CardType>(props.recommendedType ?? 'insight');
  const [exporting, setExporting] = useState<null | 'download' | 'copy'>(null);
  const [copied, setCopied] = useState(false);
  const cardWrapperRef = useRef<HTMLDivElement>(null);

  const { headline, body } = useMemo(() => {
    if (props.recommendedHighlight && cardType === (props.recommendedType ?? 'insight')) {
      const remaining = (postText || '').replace(props.recommendedHighlight, '').trim();
      return { headline: trunc(props.recommendedHighlight, 140), body: trunc(remaining, 220) };
    }
    return deriveContentForType(postText, cardType, language);
  }, [postText, cardType, props.recommendedHighlight, props.recommendedType, language]);

  const dataPoints = useMemo(() => {
    if (cardType === 'stat') {
      const s = extractStat(postText);
      return s ? { items: [{ value: s.value, label: s.label }] } : undefined;
    }
    if (cardType === 'framework' || cardType === 'principles' || cardType === 'cycle' || cardType === 'equation' || cardType === 'comparison') {
      return extractDataPoints(postText);
    }
    return undefined;
  }, [cardType, postText]);

  // Top label: keep topic if it matches the card language; otherwise fall back
  // to a generic localized label so an English title never lands on an Arabic card.
  const hasArabicChars = (s?: string) => !!s && /[\u0600-\u06FF]/.test(s);
  const labelLanguageMatches =
    !topicLabel ||
    (language === 'ar' ? hasArabicChars(topicLabel) : !hasArabicChars(topicLabel));
  const tag = labelLanguageMatches
    ? (topicLabel ?? (language === 'ar' ? 'فكرة استراتيجية' : 'Strategic Insight'))
    : (language === 'ar' ? 'فكرة استراتيجية' : 'Strategic Insight');

  // Footer: name stays as-is (proper noun), but if the role is in the wrong
  // script for the card language, swap to a generic localized role.
  const displayedAuthorTitle = (() => {
    if (language === 'ar' && authorTitle && !hasArabicChars(authorTitle)) {
      return 'خبير استراتيجي';
    }
    return authorTitle;
  })();

  const findInner = (): HTMLElement | null => {
    return cardWrapperRef.current?.querySelector<HTMLElement>('.card-preview-inner') ?? null;
  };

  const handleDownload = async () => {
    const inner = findInner();
    if (!inner) return;
    setExporting('download');
    try {
      const blob = await exportCardAsPng(inner, undefined, { language });
      if (!blob) throw new Error('Export failed');
      downloadBlob(blob, `aura-card-${style}-${cardType}.png`);
      toast.success('Card downloaded');
    } catch (e: any) {
      toast.error(e.message || 'Export failed');
    } finally {
      setExporting(null);
    }
  };

  const handleCopy = async () => {
    const inner = findInner();
    if (!inner) return;
    setExporting('copy');
    try {
      const blob = await exportCardAsPng(inner, undefined, { language });
      if (!blob) throw new Error('Export failed');
      // @ts-ignore — ClipboardItem typing
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopied(true);
      toast.success('Card copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch (e: any) {
      toast.error(e.message || 'Copy failed — try Download instead');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Style swatches */}
      <div>
        <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/50 font-semibold mb-2">Style</p>
        <div className="flex flex-wrap gap-2">
          {STYLES.map(s => {
            const active = style === s.name;
            return (
              <button
                key={s.name}
                onClick={() => setStyle(s.name)}
                title={s.label}
                className={`h-9 w-9 rounded-lg transition-all ${active ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : 'opacity-70 hover:opacity-100'}`}
                style={{
                  background: s.swatch,
                  border: s.border ? '1px solid hsl(var(--border))' : 'none',
                }}
                aria-label={s.label}
              />
            );
          })}
        </div>
      </div>

      {/* Card type pills */}
      <div>
        <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/50 font-semibold mb-2">Card type</p>
        <div className="flex flex-wrap gap-1.5">
          {CARD_TYPES.map(t => {
            const active = cardType === t;
            return (
              <button
                key={t}
                onClick={() => setCardType(t)}
                className={`px-3 py-1 rounded-full text-[11px] capitalize transition-colors ${
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/40 text-muted-foreground hover:bg-muted/60'
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      {/* Live preview */}
      <div className="flex justify-center py-2">
        <div ref={cardWrapperRef}>
          <VisualCardRenderer
            content={headline || trunc(postText, 140)}
            bodyText={body || undefined}
            style={style}
            cardType={cardType}
            language={language}
            authorName={authorName}
            authorTitle={displayedAuthorTitle}
            tag={tag}
            dataPoints={dataPoints}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleDownload}
          disabled={exporting !== null}
          className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {exporting === 'download' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5" />
          )}
          Download PNG
        </button>
        <button
          onClick={handleCopy}
          disabled={exporting !== null}
          className="flex-1 h-9 rounded-lg border border-border bg-background text-foreground text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-50 hover:bg-muted/40 transition-colors"
        >
          {exporting === 'copy' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : copied ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
          {copied ? 'Copied!' : 'Copy to clipboard'}
        </button>
      </div>
    </div>
  );
}