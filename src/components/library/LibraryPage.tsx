import React from "react";
import { useSearchParams } from "react-router-dom";
import { ButtonPrimary } from "@/components/systemb";
import { Plus } from "lucide-react";
import SourcesSubTab from "@/components/tabs/SourcesSubTab";

/**
 * LibraryPage — everything the user captured, in one list.
 *
 * The library and the old Signals "Sources" section were the same universe
 * shown twice. SourcesSubTab is now the single library experience: its
 * search, type filters and list render here and nowhere else.
 */

const MONO: React.CSSProperties = { fontFamily: "var(--ff-mono)", fontVariantNumeric: "tabular-nums" };

interface Props {
  onOpenCapture?: (prefillUrl?: string, prefillText?: string) => void;
}

const LibraryPage: React.FC<Props> = ({ onOpenCapture }) => {
  const [searchParams, setSearchParams] = useSearchParams();

  const openSignal = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", "intelligence");
    next.set("signal", id);
    setSearchParams(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <section data-testid="library-page" style={{ fontFamily: "var(--ff-ui)", marginBottom: 26 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ ...MONO, fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--text-muted)" }}>
            Library
          </div>
          <h1 style={{ margin: "8px 0 0", fontSize: 26, lineHeight: 1.15, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-.01em" }}>
            Everything you've kept
          </h1>
          <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--text-secondary)", maxWidth: 620 }}>
            Every link, note, voice memo and document you captured — and what Aura made of it.
          </p>
        </div>
        <ButtonPrimary onClick={() => onOpenCapture?.()}><Plus size={13} />Capture something</ButtonPrimary>
      </div>

      <SourcesSubTab
        onOpenCapture={() => onOpenCapture?.()}
        onSwitchToSignal={openSignal}
      />
    </section>
  );
};

export default LibraryPage;
