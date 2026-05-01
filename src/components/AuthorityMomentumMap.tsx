import { useState, useEffect } from "react";
import { Crown, Loader2, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ThemeData {
  theme: string;
  signalCount: number;
  frameworkCount: number;
  contentCount: number;
  totalStrength: number;
}

const AuthorityMomentumMap = () => {
  const [themes, setThemes] = useState<ThemeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredTheme, setHoveredTheme] = useState<string | null>(null);

  useEffect(() => {
    loadThemes();
  }, []);

  const loadThemes = async () => {
    try {
      const [signalsRes, frameworksRes, activationsRes] = await Promise.all([
        supabase.from("strategic_signals").select("theme_tags, confidence").eq("status", "active"),
        supabase.from("master_frameworks").select("tags"),
        supabase.from("framework_activations").select("title, output_type").limit(50),
      ]);

      const themeCounts: Record<string, { signals: number; frameworks: number; content: number; totalConf: number }> = {};

      (signalsRes.data || []).forEach((s: any) => {
        (s.theme_tags || []).forEach((tag: string) => {
          if (!themeCounts[tag]) themeCounts[tag] = { signals: 0, frameworks: 0, content: 0, totalConf: 0 };
          themeCounts[tag].signals++;
          themeCounts[tag].totalConf += Number(s.confidence) || 0.7;
        });
      });

      (frameworksRes.data || []).forEach((f: any) => {
        (f.tags || []).forEach((tag: string) => {
          if (!themeCounts[tag]) themeCounts[tag] = { signals: 0, frameworks: 0, content: 0, totalConf: 0 };
          themeCounts[tag].frameworks++;
        });
      });

      const contentCount = (activationsRes.data || []).length;
      const topThemes = Object.entries(themeCounts).sort((a, b) => b[1].signals - a[1].signals);
      topThemes.slice(0, 3).forEach(([, v]) => { v.content = Math.ceil(contentCount / 3); });

      const result: ThemeData[] = Object.entries(themeCounts)
        .map(([theme, v]) => ({
          theme,
          signalCount: v.signals,
          frameworkCount: v.frameworks,
          contentCount: v.content,
          totalStrength: v.signals * 3 + v.frameworks * 5 + v.content * 2 + v.totalConf,
        }))
        .sort((a, b) => b.totalStrength - a.totalStrength)
        .slice(0, 8);

      setThemes(result);
    } catch (err) {
      console.error("Authority momentum error:", err);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="glass-card rounded-2xl card-pad flex items-center justify-center min-h-[200px]">
        <Loader2 className="w-5 h-5 animate-spin text-primary/40" />
      </div>
    );
  }

  if (!themes.length) {
    return (
      <div className="glass-card rounded-2xl card-pad text-center min-h-[160px] flex flex-col items-center justify-center gap-3">
        <Crown className="w-6 h-6 text-primary/20" />
        <p className="text-meta">Build more signals and frameworks to see authority momentum.</p>
      </div>
    );
  }

  const maxStrength = themes[0]?.totalStrength || 1;

  return (
    <div className="glass-card rounded-2xl card-pad border border-border/8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/15">
          <Crown className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="text-card-title text-foreground">Authority Momentum</h3>
          <p className="text-meta">Themes gaining traction</p>
        </div>
      </div>

      <div className="space-y-5">
        {themes.map((t, i) => {
          const pct = Math.round((t.totalStrength / maxStrength) * 100);
          const isHovered = hoveredTheme === t.theme;

          return (
            <div
              key={t.theme}
              onMouseEnter={() => setHoveredTheme(t.theme)}
              onMouseLeave={() => setHoveredTheme(null)}
              className="group cursor-default"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {i === 0 && <TrendingUp className="w-4 h-4 text-primary" />}
                  <span
                    className={`text-body font-medium transition-colors duration-200 ${
                      isHovered ? "text-foreground" : "text-foreground/70"
                    }`}
                    style={i === 0 ? { fontFamily: "var(--font-display)" } : undefined}
                  >
                    {t.theme}
                  </span>
                </div>
                <span className="text-meta tabular-nums">{pct}%</span>
              </div>

              <div className="relative h-3 rounded-full bg-secondary/30 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out relative"
                  style={{
                    width: `${pct}%`,
                    background: i === 0
                      ? "linear-gradient(90deg, hsl(var(--primary) / 0.6), hsl(var(--primary)))"
                      : i < 3
                        ? "linear-gradient(90deg, hsl(var(--primary) / 0.3), hsl(var(--primary) / 0.6))"
                        : "hsl(var(--primary) / 0.25)",
                  }}
                >
                  {i === 0 && (
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-[shimmer_3s_ease-in-out_infinite]" />
                  )}
                </div>
                {isHovered && (
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{ boxShadow: "0 0 12px hsl(var(--primary) / 0.2)" }}
                  />
                )}
              </div>

              {isHovered && (
                <div className="flex items-center gap-4 mt-2 text-meta animate-fade-in">
                  <span>{t.signalCount} signals</span>
                  <span>{t.frameworkCount} frameworks</span>
                  <span>{t.contentCount} content pieces</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AuthorityMomentumMap;
