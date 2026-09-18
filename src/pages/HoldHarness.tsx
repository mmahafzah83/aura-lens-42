import { WhatYouCanHold } from "@/features/opportunities/WhatYouCanHold";

/** Temporary visual harness for the "What you can hold" panel. */
export default function HoldHarness() {
  return (
    <div style={{ background: "var(--canvas)", minHeight: "100vh", padding: 16 }}>
      <WhatYouCanHold userId={null} language="en" />
    </div>
  );
}
