import { useState, useCallback, useEffect } from "react";
import LinkedInConnector from "@/components/LinkedInConnector";
import InfluenceIntelligence from "@/components/InfluenceIntelligence";
import LinkedInExpertAdvisor from "@/components/LinkedInExpertAdvisor";
import LinkedInProfileAnalyzer from "@/components/LinkedInProfileAnalyzer";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Entry = Database["public"]["Tables"]["entries"]["Row"];

interface InfluenceTabNewProps {
  entries: Entry[];
}

const InfluenceTabNew = ({ entries }: InfluenceTabNewProps) => {
  const [linkedInConnected, setLinkedInConnected] = useState(false);
  const [connectionInfo, setConnectionInfo] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [advisorTrigger, setAdvisorTrigger] = useState(0);
  const [hasSnapshots, setHasSnapshots] = useState(false);

  const handleConnectionChange = useCallback((connected: boolean, info?: any) => {
    setLinkedInConnected(connected);
    setConnectionInfo(info || null);
    setSyncFailed(false);
  }, []);

  const handleSyncStateChange = useCallback((isSyncing: boolean, failed?: boolean) => {
    setSyncing(isSyncing);
    if (failed !== undefined) setSyncFailed(failed);
    if (!isSyncing && !failed) {
      setRefreshKey(k => k + 1);
      // Trigger advisor refresh after sync completes
      setAdvisorTrigger(k => k + 1);
    }
  }, []);

  // Listen for realtime changes on entries, documents, master_frameworks
  // to trigger advisor refresh when new content is added
  useEffect(() => {
    const channel = supabase
      .channel("influence-content-events")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "entries" },
        () => setAdvisorTrigger(k => k + 1)
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "documents" },
        () => setAdvisorTrigger(k => k + 1)
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "master_frameworks" },
        () => setAdvisorTrigger(k => k + 1)
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "linkedin_posts" },
        () => setAdvisorTrigger(k => k + 1)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="space-y-12 max-w-4xl mx-auto">
      {/* Section 1: LinkedIn Status */}
      <LinkedInConnector
        onConnectionChange={handleConnectionChange}
        onSyncStateChange={handleSyncStateChange}
      />

      {/* Sections 2–4: Authority Identity, Performance, Content Intelligence */}
      <InfluenceIntelligence
        key={refreshKey}
        linkedInConnected={linkedInConnected}
        connectionInfo={connectionInfo}
        syncing={syncing}
        syncFailed={syncFailed}
        onSnapshotsLoaded={(count) => setHasSnapshots(count > 0)}
      />

      {/* Section 5: Strategic Advisor — continuous intelligence loop */}
      <LinkedInExpertAdvisor
        hasSnapshots={hasSnapshots}
        refreshTrigger={advisorTrigger}
      />

      {/* Section 6: Public Profile Analyzer */}
      <LinkedInProfileAnalyzer />
    </div>
  );
};

export default InfluenceTabNew;
