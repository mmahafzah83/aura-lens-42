import { useState } from "react";
import { TrendingUp } from "lucide-react";
import InfluenceIntelligence from "@/components/InfluenceIntelligence";
import KPIProgressRings from "@/components/KPIProgressRings";
import SkillRadar from "@/components/SkillRadar";
import WeeklyTransformationLens from "@/components/WeeklyTransformationLens";
import YearlyRoadmap from "@/components/YearlyRoadmap";
import TrainingModal from "@/components/TrainingModal";
import type { Database } from "@/integrations/supabase/types";

type Entry = Database["public"]["Tables"]["entries"]["Row"];

interface InfluenceTabNewProps {
  entries: Entry[];
}

const InfluenceTabNew = ({ entries }: InfluenceTabNewProps) => {
  const [trainingOpen, setTrainingOpen] = useState(false);
  const [radarKey, setRadarKey] = useState(0);

  return (
    <div className="space-y-6">
      <InfluenceIntelligence />
      <KPIProgressRings />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card rounded-2xl p-6 sm:p-10 min-h-[400px] radar-glow animate-data-pulse">
          <SkillRadar key={radarKey} />
        </div>
        <div className="space-y-6">
          <div
            className="glass-card rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover-lift tactile-press transition-all group"
            onClick={() => setTrainingOpen(true)}
          >
            <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mb-4 group-hover:scale-105 transition-transform duration-300 border border-border/20">
              <TrendingUp className="w-6 h-6 text-primary" />
            </div>
            <h2 className="text-base font-semibold text-foreground mb-1">Log Training</h2>
            <p className="text-xs text-muted-foreground tracking-wide">Track your growth hours</p>
          </div>
          <WeeklyTransformationLens entries={entries} />
        </div>
      </div>
      <YearlyRoadmap />
      <TrainingModal open={trainingOpen} onOpenChange={setTrainingOpen} onLogged={() => setRadarKey(k => k + 1)} />
    </div>
  );
};

export default InfluenceTabNew;
