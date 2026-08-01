import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RecordLens } from "@/components/home/RecordLens";

export default function RecordProof() {
  const [uid, setUid] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id ?? null));
  }, []);
  return (
    <div style={{ padding: 24, background: "var(--surface-page)", minHeight: "100vh" }}>
      <RecordLens
        facts={null} userId={uid} draftDismissed={false}
        onPublishDraft={() => {}} onDismissDraft={() => {}} onOpenSignals={() => {}}
      />
    </div>
  );
}
