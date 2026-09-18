import { WhatYouCanHold } from "@/features/opportunities/WhatYouCanHold";

/** Temporary visual harness for the "What you can hold" panel. */
export default function HoldHarness() {
  return (
    <div style={{ background: "var(--canvas)", minHeight: "100vh", padding: 16 }}>
      <WhatYouCanHold userId="9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3" language="en" />
    </div>
  );
}
