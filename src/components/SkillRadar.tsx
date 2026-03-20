import { useEffect, useState } from "react";
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer } from "recharts";
import { supabase } from "@/integrations/supabase/client";

const PILLARS = ["Strategy", "Technology", "Utilities", "Leadership", "Brand"];

const SkillRadar = () => {
  const [data, setData] = useState(PILLARS.map((p) => ({ skill: p, value: 0 })));

  useEffect(() => {
    const fetchHours = async () => {
      const { data: logs } = await supabase
        .from("training_logs" as any)
        .select("pillar, duration_hours") as any;

      if (!logs || logs.length === 0) return;

      const totals: Record<string, number> = {};
      PILLARS.forEach((p) => (totals[p] = 0));
      logs.forEach((l: any) => {
        if (totals[l.pillar] !== undefined) {
          totals[l.pillar] += Number(l.duration_hours) || 0;
        }
      });

      // Normalize: max pillar = 100
      const maxVal = Math.max(...Object.values(totals), 1);
      setData(PILLARS.map((p) => ({ skill: p, value: Math.round((totals[p] / maxVal) * 100) })));
    };

    fetchHours();
  }, []);

  return (
    <div className="w-full h-full flex flex-col">
      <h3 className="text-lg font-semibold text-foreground mb-1">Skill Radar</h3>
      <p className="text-xs text-muted-foreground mb-4 tracking-wide uppercase">Training hours by pillar</p>
      <div className="flex-1 min-h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
            <PolarGrid stroke="hsl(0 0% 20%)" strokeDasharray="3 3" />
            <PolarAngleAxis
              dataKey="skill"
              tick={{ fill: "hsl(40 15% 65%)", fontSize: 11, fontFamily: "Inter" }}
            />
            <Radar
              name="Skills"
              dataKey="value"
              stroke="hsl(43 72% 52%)"
              fill="hsl(43 72% 52%)"
              fillOpacity={0.12}
              strokeWidth={2}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default SkillRadar;
