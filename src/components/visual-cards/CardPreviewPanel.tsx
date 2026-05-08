import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Copy, Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import VisualCardRenderer from "./VisualCardRenderer";
import type { CardStyleName } from "./styles/cardStyles";
import type { CardType, DataPoint } from "./types";
import { exportCardAsPng, downloadBlob, extractDataPoints, extractStat, trunc, deriveContentForType } from "./exportCard";
import { supabase } from "@/integrations/supabase/client";

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

type StructuredCards = Partial<Record<CardType, any>>;

interface MappedContent {
  headline: string;
  body?: string;
  dataPoints?: { items: DataPoint[] };
}

function mapAiToProps(cardType: CardType, payload: any): MappedContent | null {
  if (!payload || typeof payload !== "object") return null;
  try {
    switch (cardType) {
      case "insight": {
        const headline = payload.headline || "";
        if (!headline) return null;
        return { headline: trunc(headline, 200), body: payload.attribution ? trunc(payload.attribution, 220) : undefined };
      }
      case "framework": {
        const items: any[] = Array.isArray(payload.items) ? payload.items : [];
        if (!payload.headline || items.length < 2) return null;
        return {
          headline: trunc(payload.headline, 120),
          body: payload.description ? trunc(payload.description, 200) : undefined,
          dataPoints: {
            items: items.slice(0, 6).map((it) => ({
              label: trunc(it?.title || it?.detail || "", 80),
            })),
          },
        };
      }
      case "stat": {
        if (!payload.number) return null;
        return {
          headline: trunc(payload.headline || payload.context || "", 160),
          body: payload.source ? trunc(payload.source, 160) : (payload.context ? trunc(payload.context, 200) : undefined),
          dataPoints: {
            items: [{ value: String(payload.number), label: trunc(payload.label || "", 80) }],
          },
        };
      }
      case "comparison": {
        const pairs: any[] = Array.isArray(payload.pairs) ? payload.pairs : [];
        if (!payload.left_label || !payload.right_label || pairs.length < 2) return null;
        const leftPts = pairs.slice(0, 3).map((p) => ({ label: trunc(p?.wrong || "", 80) }));
        const rightPts = pairs.slice(0, 3).map((p) => ({ label: trunc(p?.right || "", 80) }));
        return {
          headline: trunc(payload.headline || "", 140),
          dataPoints: {
            items: [
              { label: trunc(payload.left_label, 40) },
              { label: trunc(payload.right_label, 40) },
              ...leftPts,
              ...rightPts,
            ],
          },
        };
      }
      case "question": {
        if (!payload.question) return null;
        return {
          headline: trunc(payload.question, 240),
          body: payload.context ? trunc(payload.context, 220) : undefined,
        };
      }
      case "principles": {
        const items: any[] = Array.isArray(payload.principles) ? payload.principles : [];
        if (!payload.headline || items.length < 2) return null;
        return {
          headline: trunc(payload.headline, 120),
          dataPoints: {
            items: items.slice(0, 6).map((p) => {
              if (typeof p === "string") return { label: trunc(p, 100) };
              return { label: trunc(p?.title || "", 100), value: p?.detail ? trunc(p.detail, 160) : undefined };
            }),
          },
        };
      }
      case "cycle": {
        const items: any[] = Array.isArray(payload.steps) ? payload.steps : [];
        if (!payload.headline || items.length < 3) return null;
        return {
          headline: trunc(payload.headline, 120),
          dataPoints: {
            items: items.slice(0, 6).map((s) => ({ label: trunc(s?.label || "", 60), value: s?.detail ? trunc(s.detail, 120) : undefined })),
          },
        };
      }
      case "equation": {
        const comps: any[] = Array.isArray(payload.components) ? payload.components : [];
        if (!payload.result || comps.length < 2) return null;
        const items: DataPoint[] = comps
          .slice(0, 4)
          .map((c) => ({ label: trunc(typeof c === "string" ? c : (c?.label || ""), 40) }));
        items.push({ label: trunc(payload.result, 40) });
        return {
          headline: trunc(payload.headline || "", 120),
          body: payload.footnote ? trunc(payload.footnote, 200) : undefined,
          dataPoints: { items },
        };
      }
    }
  } catch {
    return null;
  }
  return null;
}

export default function CardPreviewPanel(props: CardPreviewPanelProps) {
  const { postText, topicLabel, language, authorName, authorTitle } = props;
  const [style, setStyle] = useState<CardStyleName>(defaultStyleFor(language, props.recommendedStyle));
  const [cardType, setCardType] = useState<CardType>(props.recommendedType ?? 'insight');
  const [exporting, setExporting] = useState<null | 'download' | 'copy'>(null);
  const [copied, setCopied] = useState(false);
  const [aiCards, setAiCards] = useState<StructuredCards | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const cardWrapperRef = useRef<HTMLDivElement>(null);

  // Reset + fetch AI-structured content whenever the post text changes.
  useEffect(() => {
    setAiCards(null);
    if (!postText || postText.trim().length < 40) return;
    let cancelled = false;
    (async () => {
      try {
        setAiLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-authority-content`;
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            action: "extract_card_content",
            post_text: postText,
            language,
            topic: topicLabel || "",
          }),
        });
        if (!resp.ok) return;
        const json = await resp.json();
        if (!cancelled && json?.cards) setAiCards(json.cards as StructuredCards);
      } catch (e) {
        console.warn("Card AI extraction failed, falling back to heuristic:", e);
      } finally {
        if (!cancelled) setAiLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [postText, language, topicLabel]);

  // AI-mapped content takes precedence; fall back to existing heuristic when absent.
  const aiMapped = useMemo<MappedContent | null>(() => {
    if (!aiCards) return null;
    return mapAiToProps(cardType, aiCards[cardType]);
  }, [aiCards, cardType]);

  const { headline, body } = useMemo(() => {
    if (aiMapped) return { headline: aiMapped.headline, body: aiMapped.body };
    if (props.recommendedHighlight && cardType === (props.recommendedType ?? 'insight')) {
      const remaining = (postText || '').replace(props.recommendedHighlight, '').trim();
      return { headline: trunc(props.recommendedHighlight, 140), body: trunc(remaining, 220) };
    }
    return deriveContentForType(postText, cardType, language);
  }, [aiMapped, postText, cardType, props.recommendedHighlight, props.recommendedType, language]);

  const dataPoints = useMemo(() => {
    if (aiMapped?.dataPoints) return aiMapped.dataPoints;
    if (cardType === 'stat') {
      const s = extractStat(postText);
      return s ? { items: [{ value: s.value, label: s.label }] } : undefined;
    }
    if (cardType === 'framework' || cardType === 'principles' || cardType === 'cycle' || cardType === 'equation' || cardType === 'comparison') {
      return extractDataPoints(postText);
    }
    return undefined;
  }, [aiMapped, cardType, postText]);

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
        <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/50 font-semibold mb-2 flex items-center gap-1.5">
          Card type
          {aiLoading && (
            <span className="inline-flex items-center gap-1 text-muted-foreground/70 normal-case tracking-normal">
              <Sparkles className="w-3 h-3 animate-pulse" />
              <span>structuring…</span>
            </span>
          )}
        </p>
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