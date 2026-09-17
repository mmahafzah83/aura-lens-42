export type OpportunityTap = "right" | "not_quite" | "not_my_area" | "less_from_here";
export type OpportunityScope = "issuer" | "level" | "place" | "type" | "just_this";

export type WhyLine = { text?: string; cites?: string[] };

export type OpportunityCardData = {
  id: string;
  opportunity_id: string | null;
  card_date: string;
  why_lines: WhyLine[] | null;
  gap_line: WhyLine | null;
  quote: string | null;
  clock_text: string | null;
  fit_band: string | null;
  win_band: string | null;
  explore_slot?: boolean | null;
  tap_token: string;
  oe_opportunities?: {
    id?: string;
    title?: string;
    chair_type?: string;
    time_kind?: string;
    source_url?: string;
    issuer_id?: string | null;
    seniority_band?: string | null;
    location?: string | null;
  } | null;
  oe_taps?: Array<{ tap: OpportunityTap; scope?: OpportunityScope | null; tapped_at?: string }> | null;
};

export type PublicOpportunityCard = {
  card_id: string;
  title: string | null;
  chair_type: string | null;
  time_kind: string | null;
  language: string | null;
  current_tap: OpportunityTap | null;
  current_scope: OpportunityScope | null;
  issuer_id: string | null;
  seniority_band: string | null;
  location: string | null;
  opportunity_id: string | null;
  quote: string | null;
  source_url: string | null;
};