import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Crown } from "lucide-react";

interface BrandArchetypeWidgetProps {
  onStartAssessment?: () => void;
}

const BrandArchetypeWidget = ({ onStartAssessment }: BrandArchetypeWidgetProps) => {
  const [results, setResults] = useState<any>(null);
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await (supabase.from("diagnostic_profiles" as any) as any)
      .select("brand_assessment_results, brand_assessment_completed_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data?.brand_assessment_completed_at && data?.brand_assessment_results && typeof data.brand_assessment_results === 'object' && Object.keys(data.brand_assessment_results).length > 0) {
      setResults(data.brand_assessment_results);
      setCompleted(true);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (loading) return null;

  if (!completed) {
    return (
      <div className="rounded-xl border border-[#252525] bg-[#141414] p-4 mb-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-[#888]">Complete Brand Assessment to reveal your positioning</p>
          <button
            onClick={onStartAssessment}
            className="text-xs text-[#C5A55A] font-medium hover:underline flex items-center gap-1"
          >
            <Crown className="w-3.5 h-3.5" /> Start Assessment →
          </button>
        </div>
      </div>
    );
  }

  const primary = results?.primary_archetype || "";
  const secondary = results?.secondary_archetype || "";
  const positioningStatement = (() => {
    const directStatement = typeof results?.positioning_statement === "string" ? results.positioning_statement.trim() : "";
    if (directStatement) return directStatement;

    const interpretation = typeof results?.interpretation === "string" ? results.interpretation : "";
    const match = interpretation.match(/YOUR POSITIONING STATEMENT\s*\n\*\*(.*?)\*\*/s);
    return match?.[1]?.trim() || "";
  })();

  return (
    <div className="rounded-xl border border-[#C5A55A]/20 bg-[#141414] p-5 mb-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <Crown className="w-4 h-4 text-[#C5A55A]" />
          <span className="text-[11px] text-[#666] tracking-wider uppercase">How I am positioned</span>
        </div>
        <button
          onClick={onStartAssessment}
          className="text-[10px] text-[#666] hover:text-[#C5A55A] transition-colors"
        >
          Regenerate
        </button>
      </div>
      {positioningStatement ? (
        <p className="text-base text-[#C5A55A] font-semibold leading-relaxed mb-2">{positioningStatement}</p>
      ) : (
        <p className="text-base text-[#C5A55A] font-semibold mb-2">Complete your assessment to reveal your positioning</p>
      )}
      {(primary || secondary) && (
        <p className="text-[11px] text-[#666]">
          Archetype: {[primary, secondary].filter(Boolean).join(" · ")}
        </p>
      )}
    </div>
  );
};

export default BrandArchetypeWidget;
