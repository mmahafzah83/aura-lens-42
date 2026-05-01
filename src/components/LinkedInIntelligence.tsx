import { useState, useEffect } from "react";
import {
  Linkedin, Users, TrendingUp, MessageSquare, Target,
  Eye, BarChart3, Zap, ArrowUpRight, ArrowDownRight,
  Minus, ChevronRight, Lightbulb, Loader2, WifiOff
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";

const EmptySection = ({ icon: Icon, message }: { icon: any; message: string }) => (
  <div className="text-center py-8">
    <Icon className="w-8 h-8 text-primary/20 mx-auto mb-2" />
    <p className="text-xs text-muted-foreground/50">{message}</p>
  </div>
);

const LinkedInIntelligence = () => {
  const [activeSection, setActiveSection] = useState<"audience" | "content" | "strategy">("audience");
  const [latestSnapshot, setLatestSnapshot] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }

      // Check connection
      const { data: connData } = await supabase.functions.invoke("linkedin-oauth", {
        body: { action: "status" },
      });
      setConnected(connData?.connected || false);

      // Get latest snapshot
      const { data: snapshots } = await supabase
        .from("influence_snapshots")
        .select("*")
        .order("snapshot_date", { ascending: false })
        .limit(1);

      setLatestSnapshot(snapshots?.[0] || null);
    } catch {
      // silent
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-6 sm:p-8 flex items-center justify-center min-h-[200px]">
        <Loader2 className="w-5 h-5 animate-spin text-primary/40" />
      </div>
    );
  }

  if (!connected && !latestSnapshot) {
    return (
      <div className="glass-card rounded-2xl p-6 sm:p-8 text-center py-12">
        <WifiOff className="w-10 h-10 text-primary/20 mx-auto mb-3" />
        <p className="text-sm font-medium text-foreground mb-1">No LinkedIn data</p>
        <p className="text-xs text-muted-foreground/50">Connect and sync your LinkedIn account to see intelligence here.</p>
      </div>
    );
  }

  if (!latestSnapshot) {
    return (
      <div className="glass-card rounded-2xl p-6 sm:p-8 text-center py-12">
        <Linkedin className="w-10 h-10 text-[#0A66C2]/30 mx-auto mb-3" />
        <p className="text-sm font-medium text-foreground mb-1">LinkedIn connected — awaiting first sync</p>
        <p className="text-xs text-muted-foreground/50">Click "Sync Now" in the connection panel to pull analytics.</p>
      </div>
    );
  }

  const audienceBreakdown = latestSnapshot.audience_breakdown || {};
  const followers = latestSnapshot.followers || 0;
  const growth = latestSnapshot.follower_growth || 0;
  const engagement = Number(latestSnapshot.engagement_rate) || 0;
  const recommendations = (latestSnapshot.recommendations || []) as string[];

  const sections = [
    { key: "audience" as const, label: "Audience", icon: Users },
    { key: "content" as const, label: "Content", icon: BarChart3 },
    { key: "strategy" as const, label: "Strategy", icon: Target },
  ];

  return (
    <div className="space-y-6">
      <div className="glass-card rounded-2xl p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-xl bg-[#0A66C2]/15 flex items-center justify-center border border-[#0A66C2]/20">
            <Linkedin className="w-4 h-4 text-[#0A66C2]" />
          </div>
          <h2 className="text-lg font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
            LinkedIn Intelligence
          </h2>
        </div>
        <p className="text-[11px] text-muted-foreground/50 tracking-wide ml-11">
          Synced LinkedIn data · Last snapshot: {latestSnapshot.snapshot_date}
        </p>

        <div className="mt-6 flex items-center gap-6 flex-wrap">
          <div>
            <p className="text-2xl font-bold text-foreground tabular-nums">{followers.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground/50">Followers</p>
          </div>
          {growth !== 0 && (
            <div className="flex items-center gap-1.5">
              {growth > 0 ? <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" /> : <ArrowDownRight className="w-3.5 h-3.5 text-red-400" />}
              <span className={`text-sm font-semibold ${growth > 0 ? "text-emerald-400" : "text-red-400"}`}>
                {growth > 0 ? "+" : ""}{growth}
              </span>
              <span className="text-[10px] text-muted-foreground/40">last period</span>
            </div>
          )}
          {engagement > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-foreground tabular-nums">{engagement.toFixed(1)}%</span>
              <span className="text-[10px] text-muted-foreground/40">engagement</span>
            </div>
          )}
        </div>

        <div className="flex gap-1.5 mt-6 overflow-x-auto pb-1 -mx-1 px-1">
          {sections.map((s) => (
            <button
              key={s.key}
              onClick={() => setActiveSection(s.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap tactile-press ${
                activeSection === s.key
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-muted-foreground/60 hover:text-foreground hover:bg-secondary/30"
              }`}
            >
              <s.icon className="w-3.5 h-3.5" />
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {activeSection === "audience" && (
        <div className="glass-card rounded-2xl p-6 sm:p-8 animate-fade-in space-y-6">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Users className="w-4 h-4 text-primary/70" />
            Audience Intelligence
          </h3>
          {audienceBreakdown.industries || audienceBreakdown.seniority || audienceBreakdown.geography ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {[
                { title: "Industries", data: audienceBreakdown.industries || [] },
                { title: "Seniority", data: audienceBreakdown.seniority || [] },
                { title: "Geography", data: audienceBreakdown.geography || [] },
              ].filter(g => g.data.length > 0).map((group) => (
                <div key={group.title} className="space-y-3">
                  <p className="text-[10px] font-semibold text-muted-foreground/50 tracking-widest uppercase">{group.title}</p>
                  {group.data.map((item: any) => (
                    <div key={item.name} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-foreground/80">{item.name}</span>
                        <span className="text-[10px] text-muted-foreground/50 tabular-nums">{item.pct}%</span>
                      </div>
                      <Progress value={item.pct} className="h-1" />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <EmptySection icon={Users} message="No audience breakdown data in latest sync." />
          )}
        </div>
      )}

      {activeSection === "content" && (
        <div className="glass-card rounded-2xl p-6 sm:p-8 animate-fade-in space-y-5">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary/70" />
            Content Performance
          </h3>
          {latestSnapshot.top_topic || latestSnapshot.top_format ? (
            <div className="space-y-3">
              {latestSnapshot.top_topic && (
                <div className="flex items-center gap-4 p-3 rounded-xl bg-secondary/15 border border-border/10">
                  <div className="flex-1">
                    <p className="text-xs font-medium text-foreground">Top Topic</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">{latestSnapshot.top_topic}</p>
                  </div>
                </div>
              )}
              {latestSnapshot.top_format && (
                <div className="flex items-center gap-4 p-3 rounded-xl bg-secondary/15 border border-border/10">
                  <div className="flex-1">
                    <p className="text-xs font-medium text-foreground">Top Format</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">{latestSnapshot.top_format}</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <EmptySection icon={BarChart3} message="No content performance data in latest sync." />
          )}
        </div>
      )}

      {activeSection === "strategy" && (
        <div className="glass-card rounded-2xl p-6 sm:p-8 animate-fade-in space-y-5">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Target className="w-4 h-4 text-primary/70" />
            Strategic Recommendations
          </h3>
          {recommendations.length > 0 ? (
            <div className="space-y-3">
              {recommendations.map((rec: string, i: number) => (
                <div key={i} className="p-4 rounded-xl bg-secondary/15 border border-border/10 hover:border-primary/15 transition-all duration-300">
                  <div className="flex items-start gap-3">
                    <Lightbulb className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                    <p className="text-xs text-foreground/80 leading-relaxed">{rec}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptySection icon={Target} message="No recommendations generated from synced data yet." />
          )}
        </div>
      )}
    </div>
  );
};

export default LinkedInIntelligence;
