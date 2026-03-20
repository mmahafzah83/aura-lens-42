import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer } from "recharts";

const data = [
  { skill: "Strategy", value: 92 },
  { skill: "Technology", value: 88 },
  { skill: "Utilities", value: 75 },
  { skill: "Leadership", value: 85 },
  { skill: "Personal Brand", value: 78 },
];

const SkillRadar = () => {
  return (
    <div className="w-full h-full flex flex-col">
      <h3 className="text-lg font-semibold text-foreground mb-2">Skill Radar</h3>
      <p className="text-sm text-muted-foreground mb-4">Executive competency map</p>
      <div className="flex-1 min-h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
            <PolarGrid stroke="hsl(220 15% 22%)" />
            <PolarAngleAxis
              dataKey="skill"
              tick={{ fill: "hsl(40 20% 75%)", fontSize: 11, fontFamily: "Inter" }}
            />
            <Radar
              name="Skills"
              dataKey="value"
              stroke="hsl(40 60% 55%)"
              fill="hsl(40 60% 55%)"
              fillOpacity={0.15}
              strokeWidth={2}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default SkillRadar;
