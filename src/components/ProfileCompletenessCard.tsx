import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ProfileCompletenessCardProps {
  onAction?: (action: string) => void;
}

interface FieldStatus {
  key: string;
  label: string;
  filled: boolean;
  action: string;
  priority: number;
}

const ProfileCompletenessCard = ({ onAction }: ProfileCompletenessCardProps) => {
  const [fields, setFields] = useState<FieldStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [profileRes, entriesRes, signalsRes] = await Promise.all([
        (supabase.from("diagnostic_profiles") as any)
          .select("first_name, level, sector_focus, north_star_goal, firm, core_practice, primary_strength, brand_pillars, audit_completed_at, brand_assessment_completed_at")
          .eq("user_id", user.id)
          .maybeSingle(),
        (supabase.from("entries") as any)
          .select("id")
          .eq("user_id", user.id)
          .limit(1),
        (supabase.from("strategic_signals") as any)
          .select("id")
          .eq("user_id", user.id)
          .eq("status", "active")
          .limit(1),
      ]);

      const p = profileRes.data || {};
      const hasEntries = (entriesRes.data?.length || 0) > 0;
      const hasSignals = (signalsRes.data?.length || 0) > 0;

      // Check if brand_pillars is a non-empty array (used as proxy for communication_style)
      const brandPillarsNotEmpty = Array.isArray(p.brand_pillars) && p.brand_pillars.length > 0;

      // Check if primary_strength is set (proxy for primary_strengths array)
      const hasStrength = !!p.primary_strength && p.primary_strength.trim().length > 0;

      const fieldList: FieldStatus[] = [
        { key: "first_name", label: "Name", filled: !!p.first_name, action: "edit_name", priority: 3 },
        { key: "level", label: "Role", filled: !!p.level, action: "edit_role", priority: 1 },
        { key: "sector_focus", label: "Industry", filled: !!p.sector_focus, action: "edit_industry", priority: 0 },
        { key: "north_star_goal", label: "Career target", filled: !!p.north_star_goal, action: "edit_career_target", priority: 4 },
        { key: "firm", label: "Firm", filled: !!p.firm, action: "edit_firm", priority: 7 },
        { key: "core_practice", label: "Core practice", filled: !!p.core_practice, action: "edit_core_practice", priority: 8 },
        { key: "primary_strength", label: "Primary strength", filled: hasStrength, action: "edit_strength", priority: 6 },
        { key: "brand_pillars", label: "Brand pillars", filled: brandPillarsNotEmpty, action: "edit_pillars", priority: 9 },
        { key: "audit_completed_at", label: "Evidence Audit", filled: !!p.audit_completed_at, action: "open_audit", priority: 2 },
        { key: "brand_assessment_completed_at", label: "Brand Assessment", filled: !!p.brand_assessment_completed_at, action: "open_brand", priority: 5 },
        { key: "entries", label: "First capture", filled: hasEntries, action: "go_capture", priority: 10 },
        { key: "signals", label: "Active signal", filled: hasSignals, action: "go_signals", priority: 11 },
      ];

      setFields(fieldList);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return null;

  const filledCount = fields.filter((f) => f.filled).length;
  const total = fields.length;
  const pct = Math.round((filledCount / total) * 100);

  const fillColor = "var(--brand)";

  const emptyFields = fields
    .filter((f) => !f.filled)
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 3);

  return (
    <div
      className="mb-6"
      style={{
        background: "var(--surface-ink-raised)",
        border: "1px solid var(--ink-3)",
        borderRadius: 10,
        padding: 14,
      }}
    >
      <p style={{ fontSize: 12, color: "var(--ink-7)", fontWeight: 500, marginBottom: 8 }}>
        Foundation strength
      </p>

      {/* Progress bar */}
      <div style={{ height: 8, background: "var(--surface-ink-subtle)", borderRadius: 4, overflow: "hidden", marginBottom: 6 }}>
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            minWidth: pct > 0 ? "8px" : "0",
            background: fillColor,
            borderRadius: 4,
            transition: "width 0.5s ease, background 0.3s ease",
          }}
        />
      </div>

      <p style={{ fontSize: 11, color: "var(--ink-5)", marginBottom: emptyFields.length > 0 ? 10 : 0 }}>
        Profile complete · Voice engine active · 3 assessments done
      </p>

      {/* Nudges */}
      {emptyFields.length > 0 && (
        <div className="space-y-1.5">
          {emptyFields.map((f) => (
            <button
              key={f.key}
              onClick={() => onAction?.(f.action)}
              className="flex items-center gap-2 w-full text-left group"
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: "var(--danger)", opacity: 0.6 }}
              />
              <span style={{ fontSize: 11, color: "var(--ink-5)", flex: 1 }}>{f.label}</span>
              <span
                className="group-hover:underline"
                style={{ fontSize: 11, color: "var(--brand)", fontWeight: 500 }}
              >
                Add →
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProfileCompletenessCard;
