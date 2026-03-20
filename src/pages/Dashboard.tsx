import { useState, useEffect } from "react";
import { Plus, LogOut, Zap, BarChart3, BookOpen, TrendingUp, GraduationCap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import SkillRadar from "@/components/SkillRadar";
import CaptureModal from "@/components/CaptureModal";
import TrainingModal from "@/components/TrainingModal";
import RecentEntries from "@/components/RecentEntries";
import type { Database } from "@/integrations/supabase/types";

type Entry = Database["public"]["Tables"]["entries"]["Row"];

const Dashboard = () => {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [trainingOpen, setTrainingOpen] = useState(false);
  const [radarKey, setRadarKey] = useState(0);
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

  const stats = [
    { label: "Total Captures", value: entries.length, icon: BookOpen },
    { label: "Links Saved", value: entries.filter(e => e.type === "link").length, icon: BarChart3 },
    { label: "Voice Notes", value: entries.filter(e => e.type === "voice").length, icon: Zap },
    { label: "Strategic Insights", value: entries.filter(e => (e as any).has_strategic_insight === true).length, icon: TrendingUp },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/30 px-8 py-5">
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

      {/* Dashboard */}
      <main className="max-w-7xl mx-auto px-8 py-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 auto-rows-min">
          {/* Stats Row */}
          {stats.map((stat) => (
            <div key={stat.label} className="glass-card rounded-2xl p-6 hover:bg-card-hover transition-colors">
              <div className="flex items-center justify-between mb-4">
                <stat.icon className="w-5 h-5 text-primary" />
              </div>
              <p className="text-3xl font-bold text-foreground tracking-tight">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1.5 tracking-wide uppercase">{stat.label}</p>
            </div>
          ))}

          {/* Capture Button */}
          <div
            className="glass-card rounded-2xl p-10 flex flex-col items-center justify-center text-center gold-glow cursor-pointer hover:bg-card-hover transition-all group"
            onClick={() => setCaptureOpen(true)}
          >
            <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
              <Plus className="w-8 h-8 text-primary-foreground" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-1">Capture</h2>
            <p className="text-xs text-muted-foreground tracking-wide">Link, voice note, or thought</p>
          </div>

          {/* Log Training Button */}
          <div
            className="glass-card rounded-2xl p-10 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-card-hover transition-all group"
            onClick={() => setTrainingOpen(true)}
          >
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-5 group-hover:scale-110 transition-transform border border-border/30">
              <GraduationCap className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-1">Log Training</h2>
            <p className="text-xs text-muted-foreground tracking-wide">Track skill development</p>
          </div>

          {/* Skill Radar — spans 2 cols */}
          <div className="md:col-span-2 glass-card rounded-2xl p-8 min-h-[380px] radar-glow">
            <SkillRadar key={radarKey} />
          </div>

          {/* Recent Entries — full width */}
          <div className="md:col-span-2 lg:col-span-4 glass-card rounded-2xl p-8">
            <RecentEntries entries={entries} />
          </div>
        </div>
      </main>

      <CaptureModal open={captureOpen} onOpenChange={setCaptureOpen} onCaptured={fetchEntries} />
      <TrainingModal open={trainingOpen} onOpenChange={setTrainingOpen} onLogged={() => { setRadarKey(k => k + 1); }} />
    </div>
  );
};

export default Dashboard;
