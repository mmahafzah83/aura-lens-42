import { useState, useEffect } from "react";
import { Plus, LogOut, Zap, BarChart3, BookOpen, TrendingUp, GraduationCap, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import SkillRadar from "@/components/SkillRadar";
import CaptureModal from "@/components/CaptureModal";
import TrainingModal from "@/components/TrainingModal";
import WeeklyTransformationLens from "@/components/WeeklyTransformationLens";
import PotentialUnleashed from "@/components/PotentialUnleashed";
import RecentEntries from "@/components/RecentEntries";
import AuraChatSidebar from "@/components/AuraChatSidebar";
import type { Database } from "@/integrations/supabase/types";

type Entry = Database["public"]["Tables"]["entries"]["Row"];

const Dashboard = () => {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [trainingOpen, setTrainingOpen] = useState(false);
  const [radarKey, setRadarKey] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) navigate("/auth");
      else setUser({ email: session.user.email });
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) navigate("/auth");
      else setUser({ email: session.user.email });
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const fetchEntries = async () => {
    const { data } = await supabase
      .from("entries")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setEntries(data);
  };

  useEffect(() => {
    fetchEntries();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekEntries = entries.filter(e => new Date(e.created_at) >= weekAgo);

  const pillarCounts: Record<string, number> = {};
  weekEntries.forEach(e => {
    if (e.skill_pillar) pillarCounts[e.skill_pillar] = (pillarCounts[e.skill_pillar] || 0) + 1;
  });
  const topPillar = Object.entries(pillarCounts).sort((a, b) => b[1] - a[1])[0];

  const pendingBrandPosts = entries.filter(e => e.summary && e.summary.trim().length > 0).length;

  const stats = [
    { label: "Strategic Focus", value: topPillar ? topPillar[0] : "—", icon: BookOpen },
    { label: "Pending Brand Posts", value: pendingBrandPosts, icon: BarChart3 },
    { label: "Voice Notes", value: entries.filter(e => e.type === "voice").length, icon: Zap },
    { label: "Strategic Insights", value: entries.filter(e => e.has_strategic_insight === true).length, icon: TrendingUp },
  ];

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-0" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <header className="border-b border-border/30 px-4 sm:px-8 py-4 sm:py-5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary-foreground" />
            </div>
            <h1 className="text-2xl tracking-tight text-gradient-gold">Aura</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-muted-foreground hidden sm:block tracking-wider uppercase">{user?.email}</span>
            <button onClick={handleLogout} className="text-muted-foreground hover:text-foreground transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 auto-rows-min">
          {stats.map((stat) => (
            <div key={stat.label} className="glass-card rounded-2xl p-4 sm:p-6 hover:bg-card-hover transition-colors">
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <stat.icon className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
              </div>
              <p className={`font-bold text-foreground tracking-tight ${typeof stat.value === 'string' ? 'text-sm sm:text-base' : 'text-2xl sm:text-3xl'}`}>{stat.value}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 sm:mt-1.5 tracking-wide uppercase">{stat.label}</p>
            </div>
          ))}

          <WeeklyTransformationLens entries={entries} />

          {/* Potential Unleashed Card */}
          <PotentialUnleashed entries={entries} />

          {/* Capture Button — hidden on mobile */}
          <div
            className="hidden md:flex glass-card rounded-2xl p-10 flex-col items-center justify-center text-center gold-glow cursor-pointer hover:bg-card-hover transition-all group"
            onClick={() => setCaptureOpen(true)}
          >
            <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
              <Plus className="w-8 h-8 text-primary-foreground" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-1">Capture</h2>
            <p className="text-xs text-muted-foreground tracking-wide">Link, voice note, or thought</p>
          </div>

          <div
            className="col-span-2 md:col-span-1 glass-card rounded-2xl p-6 sm:p-10 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-card-hover transition-all group"
            onClick={() => setTrainingOpen(true)}
          >
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-secondary flex items-center justify-center mb-3 sm:mb-5 group-hover:scale-110 transition-transform border border-border/30">
              <GraduationCap className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
            </div>
            <h2 className="text-lg sm:text-xl font-semibold text-foreground mb-1">Log Training</h2>
            <p className="text-[10px] sm:text-xs text-muted-foreground tracking-wide">Track skill development</p>
          </div>

          <div className="col-span-2 md:col-span-2 glass-card rounded-2xl p-4 sm:p-8 min-h-[250px] sm:min-h-[380px] radar-glow">
            <SkillRadar key={radarKey} />
          </div>

          <div className="col-span-2 lg:col-span-4 glass-card rounded-2xl p-4 sm:p-8">
            <RecentEntries entries={entries} onRefresh={fetchEntries} />
          </div>
        </div>
      </main>

      <button
        onClick={() => setCaptureOpen(true)}
        className="md:hidden fixed bottom-6 right-6 w-16 h-16 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 flex items-center justify-center active:scale-95 transition-transform z-50"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      >
        <Plus className="w-8 h-8" />
      </button>

      <CaptureModal open={captureOpen} onOpenChange={setCaptureOpen} onCaptured={fetchEntries} />
      <TrainingModal open={trainingOpen} onOpenChange={setTrainingOpen} onLogged={() => { setRadarKey(k => k + 1); }} />
    </div>
  );
};

export default Dashboard;
