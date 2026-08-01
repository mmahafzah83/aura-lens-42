import React from "react";
import { RoomLens, ShapeLens } from "@/components/home/lenses";
import { MovesCard, OwnCard, NightCard, StandCard, WidgetsCard } from "@/components/home/shelf";
import type { HomeFacts, HomeMove } from "@/hooks/useHomeAddress";

const facts = {
  imprint: 62, tier: "Strategist", points_to_next_band: 8, next_band_name: "Voice",
  components: { signal: 71, content: 40, capture: 88 },
  top_signal: { id: "00000000-0000-0000-0000-000000000000", title: "Grid capacity is the constraint on data centre growth", fragment_count: 42, gained_last_7d: true },
  facets: [
    { facet: "edge", value: 1 }, { facet: "identity", value: 1 }, { facet: "voice", value: 1 },
    { facet: "focus", value: 1 }, { facet: "audience", value: 0.01 },
    { facet: "discernment", value: 0.22 }, { facet: "conviction", value: 0.22 },
  ],
  facets_dormant: ["audience"],
  last_night: { sources_read: 41, themes_strengthened: 6, drafts_written: 1 },
  drafts_total: 6,
} as unknown as HomeFacts;

const moves: HomeMove[] = [{
  what: "Send the draft on grid capacity", why: "You have six drafts waiting and only one has ever gone out.",
  how: "Read it once, cut the first line, publish.", outcome: "Your record shows a post this week.",
  est_minutes: 9, cta_route: "/dashboard?tab=composer",
} as unknown as HomeMove];

export default function HomeProof() {
  return (
    <div style={{ background: "var(--surface-page)", minHeight: "100dvh", padding: 24 }}>
      <div style={{ display: "grid", gap: 22, maxWidth: 760, margin: "0 auto" }}>
        <ShapeLens facts={facts} userId={null} />
        <RoomLens facts={facts} userId={null} memberName="Ammar" onWriteOnSignal={() => {}} />
        <MovesCard moves={moves} onGo={() => {}} />
        <MovesCard moves={[]} onGo={() => {}} />
        <OwnCard themes={[]} onOpen={() => {}} />
        <NightCard facts={null} generatedAt={null} onOpen={() => {}} />
        <StandCard facts={null} />
        <WidgetsCard layout={{}} metrics={null} onEdit={() => {}} />
      </div>
    </div>
  );
}
