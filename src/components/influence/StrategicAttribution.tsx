import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Loader2, Layers, Eye, FileText, Grid3X3, Lightbulb,
  Crown, ArrowUpRight, BarChart3
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/* ── Types ── */
interface Post {
  id: string;
  hook: string | null;
  title: string | null;
  post_text: string | null;
  theme: string | null;
  topic_label: string | null;
  framework_type: string | null;
  format_type: string | null;
  content_type: string | null;
  visual_style: string | null;
  media_type: string | null;
  engagement_score: number;
  like_count: number;
  comment_count: number;
  repost_count: number;
  published_at: string | null;
  carousel_structure_type: string | null;
  hook_style: string | null;
  cta_style: string | null;
  content_engine_output_type: string | null;
  visual_strategy_type: string | null;
}

interface BucketStats {
  label: string;
  count: number;
  avgEng: number;
  avgComments: number;
  avgReposts: number;
  topPost?: Post;
}

/* ── Helpers ── */
const Fade = ({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.45, delay }}
  >
    {children}
  </motion.div>
);

const bucketize = (posts: Post[], field: keyof Post): BucketStats[] => {
  const map: Record<string, Post[]> = {};
  posts.forEach(p => {
    const val = (p[field] as string) || null;
    if (!val) return;
    if (!map[val]) map[val] = [];
    map[val].push(p);
  });
  return Object.entries(map)
    .map(([label, items]) => ({
      label,
      count: items.length,
      avgEng: Math.round(items.reduce((s, p) => s + Number(p.engagement_score || 0), 0) / items.length * 10) / 10,
      avgComments: Math.round(items.reduce((s, p) => s + (p.comment_count || 0), 0) / items.length * 10) / 10,
      avgReposts: Math.round(items.reduce((s, p) => s + (p.repost_count || 0), 0) / items.length * 10) / 10,
      topPost: [...items].sort((a, b) => Number(b.engagement_score || 0) - Number(a.engagement_score || 0))[0],
    }))
    .sort((a, b) => b.avgEng - a.avgEng);
};

/* ── Section Component ── */
const AttributionSection = ({
  icon: Icon,
  title,
  subtitle,
  data,
  delay,
}: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  data: BucketStats[];
  delay: number;
}) => {
  if (data.length === 0) return null;
  const maxEng = Math.max(...data.map(d => d.avgEng), 1);

  return (
    <Fade delay={delay}>
      <div className="glass-card rounded-2xl card-pad border border-border/8 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/8 flex items-center justify-center border border-primary/10">
            <Icon className="w-4 h-4 text-primary/50" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <p className="text-[10px] text-muted-foreground/30">{subtitle}</p>
          </div>
        </div>

        <div className="space-y-2.5">
          {data.slice(0, 6).map((d, i) => {
            const pct = Math.round((d.avgEng / maxEng) * 100);
            return (
              <motion.div
                key={d.label}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: delay + 0.05 + i * 0.04 }}
                className="space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {i === 0 && <Crown className="w-3 h-3 text-primary/40" />}
                    <span className="text-xs text-foreground/60 capitalize">{d.label}</span>
                  </div>
                  <div className="flex items-center gap-4 text-[10px] text-muted-foreground/25 tabular-nums">
                    <span>{d.count} assets</span>
                    <span>{d.avgComments} avg comments</span>
                    <span className="text-foreground/50 font-medium">{d.avgEng}% eng</span>
                  </div>
                </div>
                <div className="h-1 rounded-full bg-secondary/12 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.6, delay: delay + 0.1 + i * 0.04 }}
                    className="h-full rounded-full bg-primary/20"
                  />
                </div>
              </motion.div>
            );
          })}
        </div>

        {data.length > 0 && data[0].topPost && (
          <div className="pt-2 border-t border-border/5">
            <p className="text-[10px] text-muted-foreground/20">
              Best performer: "{(data[0].topPost.hook || data[0].topPost.title || data[0].topPost.post_text?.slice(0, 60) || "—")}…"
            </p>
          </div>
        )}
      </div>
    </Fade>
  );
};

/* ═══════════════════════════════════════════
   STRATEGIC ATTRIBUTION LAYER
   ═══════════════════════════════════════════ */

const StrategicAttribution = () => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("linkedin_posts")
        .select("id, hook, title, post_text, theme, topic_label, framework_type, format_type, content_type, visual_style, media_type, engagement_score, like_count, comment_count, repost_count, published_at, carousel_structure_type, hook_style, cta_style, content_engine_output_type, visual_strategy_type")
        .order("published_at", { ascending: false })
        .limit(500);
      setPosts((data || []) as Post[]);
      setLoading(false);
    };
    load();
  }, []);

  // Buckets
  const frameworkPerf = useMemo(() => bucketize(posts, "framework_type"), [posts]);
  const visualPerf = useMemo(() => bucketize(posts, "visual_strategy_type").length > 0
    ? bucketize(posts, "visual_strategy_type")
    : bucketize(posts, "visual_style"), [posts]);
  const narrativePerf = useMemo(() => {
    const byHook = bucketize(posts, "hook_style");
    const byFormat = bucketize(posts, "format_type");
    return byHook.length > 0 ? byHook : byFormat;
  }, [posts]);
  const carouselPerf = useMemo(() => bucketize(posts, "carousel_structure_type"), [posts]);

  // Theme × Format matrix
  const themeFormatMatrix = useMemo(() => {
    const map: Record<string, Record<string, { count: number; totalEng: number }>> = {};
    posts.forEach(p => {
      const theme = p.theme || p.topic_label;
      const format = p.framework_type || p.format_type || p.content_type;
      if (!theme || !format) return;
      if (!map[theme]) map[theme] = {};
      if (!map[theme][format]) map[theme][format] = { count: 0, totalEng: 0 };
      map[theme][format].count++;
      map[theme][format].totalEng += Number(p.engagement_score || 0);
    });

    // Flatten to top combos
    const combos: { theme: string; format: string; count: number; avgEng: number }[] = [];
    for (const [theme, formats] of Object.entries(map)) {
      for (const [format, d] of Object.entries(formats)) {
        if (d.count >= 1) {
          combos.push({ theme, format, count: d.count, avgEng: Math.round(d.totalEng / d.count * 10) / 10 });
        }
      }
    }
    return combos.sort((a, b) => b.avgEng - a.avgEng).slice(0, 8);
  }, [posts]);

  // Recommendation
  const recommendation = useMemo(() => {
    const bestFramework = frameworkPerf[0];
    const bestVisual = visualPerf[0];
    const bestNarrative = narrativePerf[0];
    const bestCombo = themeFormatMatrix[0];

    if (!bestFramework && !bestVisual && !bestNarrative && !bestCombo) return null;

    const parts: string[] = [];
    if (bestCombo) {
      parts.push(`Your strongest theme-format combination is "${bestCombo.theme}" delivered as "${bestCombo.format}" (${bestCombo.avgEng}% avg engagement).`);
    }
    if (bestFramework) {
      parts.push(`Framework-led content using "${bestFramework.label}" structures is earning ${bestFramework.avgComments} avg comments.`);
    }
    if (bestVisual) {
      parts.push(`"${bestVisual.label}" visual strategies generate the strongest response.`);
    }
    if (bestNarrative && bestNarrative.label !== bestFramework?.label) {
      parts.push(`"${bestNarrative.label}" narrative structures outperform other formats.`);
    }

    return parts.join(" ");
  }, [frameworkPerf, visualPerf, narrativePerf, themeFormatMatrix]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-5 h-5 animate-spin text-primary/20" />
      </div>
    );
  }

  const hasAnyData = frameworkPerf.length > 0 || visualPerf.length > 0 || narrativePerf.length > 0;

  if (!hasAnyData && posts.length === 0) {
    return (
      <Fade>
        <div className="text-center py-16 space-y-3">
          <Layers className="w-8 h-8 text-primary/15 mx-auto" />
          <p className="text-foreground font-medium">No attribution data yet</p>
          <p className="text-sm text-muted-foreground/40 max-w-sm mx-auto">
            As Aura creates content and LinkedIn data flows in, this layer will reveal which strategic structures build the strongest authority.
          </p>
        </div>
      </Fade>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <Fade>
        <div>
          <h2
            className="text-xl sm:text-2xl font-semibold text-foreground tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Strategic Attribution
          </h2>
          <p className="text-[11px] text-muted-foreground/30 mt-1 max-w-lg">
            Which frameworks, visual strategies, and narrative structures are compounding your authority.
          </p>
        </div>
      </Fade>

      {/* Framework Performance */}
      <AttributionSection
        icon={Layers}
        title="Framework Performance"
        subtitle="How maturity models, operating models, roadmaps, flywheels, and ecosystem maps perform"
        data={frameworkPerf}
        delay={0.06}
      />

      {/* Visual Strategy Performance */}
      <AttributionSection
        icon={Eye}
        title="Visual Strategy Performance"
        subtitle="Comparing split slides, framework diagrams, statistic panels, and infographic layouts"
        data={visualPerf}
        delay={0.12}
      />

      {/* Narrative Structure Performance */}
      <AttributionSection
        icon={FileText}
        title="Narrative Structure Performance"
        subtitle="Hook styles, problem-insight flows, framework-led carousels, and POV formats"
        data={narrativePerf}
        delay={0.18}
      />

      {/* Carousel Structure (if data exists) */}
      {carouselPerf.length > 0 && (
        <AttributionSection
          icon={BarChart3}
          title="Carousel Structure Performance"
          subtitle="Comparing before/after, step-by-step, comparison, and deep-dive structures"
          data={carouselPerf}
          delay={0.24}
        />
      )}

      {/* Theme × Format Matrix */}
      {themeFormatMatrix.length > 0 && (
        <Fade delay={0.28}>
          <div className="glass-card rounded-2xl card-pad border border-border/8 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/8 flex items-center justify-center border border-primary/10">
                <Grid3X3 className="w-4 h-4 text-primary/50" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Theme × Format Matrix</h3>
                <p className="text-[10px] text-muted-foreground/30">Which topics perform best in which structure</p>
              </div>
            </div>

            <div className="space-y-2">
              {themeFormatMatrix.map((combo, i) => (
                <motion.div
                  key={`${combo.theme}-${combo.format}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 + i * 0.04 }}
                  className="flex items-center justify-between p-3 rounded-xl bg-secondary/6 border border-border/[0.03]"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {i === 0 && <ArrowUpRight className="w-3 h-3 text-primary/40 flex-shrink-0" />}
                    <span className="text-xs text-foreground/55 capitalize truncate">
                      {combo.theme}
                    </span>
                    <span className="text-[10px] text-muted-foreground/20">×</span>
                    <span className="text-xs text-foreground/40 capitalize truncate">
                      {combo.format}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] tabular-nums flex-shrink-0">
                    <span className="text-muted-foreground/25">{combo.count} assets</span>
                    <span className="text-foreground/50 font-medium">{combo.avgEng}% eng</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </Fade>
      )}

      {/* Recommendation */}
      {recommendation && (
        <Fade delay={0.34}>
          <div className="glass-card rounded-2xl card-pad border border-primary/8 bg-gradient-to-br from-primary/[0.02] to-transparent space-y-3">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-primary/40" />
              <h3 className="text-sm font-semibold text-foreground">Strategic Recommendation</h3>
            </div>
            <p className="text-sm text-foreground/55 leading-relaxed">{recommendation}</p>
            <button className="flex items-center gap-2 text-[11px] font-medium text-primary/60 hover:text-primary px-4 py-2 rounded-lg bg-primary/5 hover:bg-primary/10 border border-primary/10 transition-all tactile-press mt-1">
              <FileText className="w-3.5 h-3.5" />
              Draft Content
            </button>
          </div>
        </Fade>
      )}
    </div>
  );
};

export default StrategicAttribution;
