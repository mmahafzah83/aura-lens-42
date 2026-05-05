import type { CardStyleName } from "./styles/cardStyles";

export type CardType =
  | 'insight'
  | 'framework'
  | 'stat'
  | 'comparison'
  | 'question'
  | 'principles'
  | 'cycle'
  | 'equation';

export interface DataPoint {
  label: string;
  value?: string;
  highlighted?: boolean;
}

export interface VisualCardProps {
  content: string;
  bodyText?: string;
  style?: CardStyleName;
  cardType?: CardType;
  language?: 'en' | 'ar';
  authorName: string;
  authorTitle: string;
  tag?: string;
  dataPoints?: { items: DataPoint[] };
}