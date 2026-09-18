export type OpportunityTap = "right" | "not_quite" | "not_my_area" | "less_from_here";
export type OpportunityScope = "issuer" | "level" | "place" | "type" | "just_this";

export type WhyLine = { text?: string; cites?: Array<string | { kind?: string; id?: string }> };

/** One thing the record asks for, and whether his own material shows it. */
export type RequirementRow = {
  requirement: string;
  met: boolean;
  cite?: { kind?: string; id?: string } | null;
  quote?: string;
};

export type WarmthRow = { kind: string; strength?: number | null; detail?: unknown };

export type OpportunityCardData = {
  id: string;
  opportunity_id: string | null;
  card_date: string;
  why_lines: WhyLine[] | null;
  /** The distance: the one thing his own material does not show. */
  gap_line: WhyLine | null;
  quote: string | null;
  clock_text: string | null;
  fit_band: string | null;
  win_band: string | null;
  lane?: string | null;
  cited_ids?: unknown;
  explore_slot?: boolean | null;
  tap_token: string;
  oe_opportunities?: {
    id?: string;
    title?: string;
    chair_type?: string;
    time_kind?: string;
    source_url?: string;
    route_url?: string | null;
    route_kind?: string | null;
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
