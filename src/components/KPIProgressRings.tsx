import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Activity } from "lucide-react";

interface RingData {
  label: string;
  value: number;
  max: number;
  color: string;
}

const ProgressRing = ({ value, max, color, size = 80, strokeWidth = 6 }: {
  value: number; max: number; color: string; size?: number; strokeWidth?: number;
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(value / max, 1);
  const offset = circumference * (1 - pct);

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="hsl(0 0% 14%)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="transition-all duration-1000 ease-out"
        style={{ filter: `drop-shadow(0 0 6px ${color}40)` }}
      />
    </svg>
  );
};

const KPIProgressRings = () => {
  const [rings, setRings] = useState<RingData[]>([
    { label: "Authority Index", value: 0, max: 100, color: "hsl(43 72% 52%)" },
    { label: "Market Voice", value: 0, max: 100, color: "hsl(200 70% 55%)" },
    { label: "Intel Velocity", value: 0, max: 100, color: "hsl(150 60% 45%)" },
  ]);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [
        { data: entries },
        { data: intelligence },
        { data: frameworks },
        { data: profile },
      ] = await Promise.all([
        supabase.from("entries").select("type, created_at, has_strategic_insight"),
        supabase.from("learned_intelligence").select("id, created_at"),
        supabase.from("master_frameworks").select("id"),
        (supabase.from("diagnostic_profiles" as any) as any).select("skill_ratings, brand_pillars").maybeSingle(),
      ]);

      // Authority Index: based on skill ratings average + frameworks count
      const ratings = profile?.skill_ratings || profile?.data?.skill_ratings || {};
      const ratingValues = Object.values(ratings).filter((v): v is number => typeof v === "number");
      const avgRating = ratingValues.length > 0 ? ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length : 0;
      const frameworkBonus = Math.min((frameworks || []).length * 5, 20);
      const authorityIndex = Math.min(100, Math.round(avgRating + frameworkBonus));

      // Market Voice: based on entries with strategic insight + brand pillar alignment
      const strategicEntries = (entries || []).filter((e: any) => e.has_strategic_insight).length;
      const totalEntries = (entries || []).length;
      const voiceScore = totalEntries > 0
        ? Math.min(100, Math.round((strategicEntries / Math.max(totalEntries, 1)) * 100) + Math.min(totalEntries * 2, 30))
        : 0;

      // Intelligence Velocity: intelligence items in last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const recentIntel = (intelligence || []).filter((i: any) => new Date(i.created_at) >= thirtyDaysAgo).length;
      const velocityScore = Math.min(100, recentIntel * 10);

      setRings([
        { label: "Authority Index", value: authorityIndex, max: 100, color: "hsl(43 72% 52%)" },
        { label: "Market Voice", value: voiceScore, max: 100, color: "hsl(200 70% 55%)" },
        { label: "Intel Velocity", value: velocityScore, max: 100, color: "hsl(150 60% 45%)" },
      ]);
    };
    load();
  }, []);

  return (
    <div className="glass-card rounded-2xl p-6 sm:p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
          <Activity className="w-4 h-4 text-primary" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">Performance Command</h3>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {rings.map((ring) => (
          <div key={ring.label} className="flex flex-col items-center gap-3">
            <div className="relative">
              <ProgressRing value={ring.value} max={ring.max} color={ring.color} size={80} strokeWidth={6} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-semibold text-foreground">{ring.value}</span>
              </div>
            </div>
            <span className="text-[10px] text-muted-foreground text-center tracking-wider uppercase leading-tight">
              {ring.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default KPIProgressRings;
