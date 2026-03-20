import { useState, useEffect } from "react";
import { Plus, LogOut, Zap, BarChart3, BookOpen, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import SkillRadar from "@/components/SkillRadar";
import CaptureModal from "@/components/CaptureModal";
import RecentEntries from "@/components/RecentEntries";
import type { Database } from "@/integrations/supabase/types";

type Entry = Database["public"]["Tables"]["entries"]["Row"];

const Dashboard = () => {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [captureOpen, setCaptureOpen] = useState(false);
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
    { label: "Total Captures", value: entries.length, icon: BookOpen, color: "text-primary" },
    { label: "Links Saved", value: entries.filter(e => e.type === "link").length, icon: BarChart3, color: "text-primary" },
    { label: "Voice Notes", value: entries.filter(e => e.type === "voice").length, icon: Zap, color: "text-primary" },
    { label: "Insights", value: entries.filter(e => e.summary).length, icon: TrendingUp, color: "text-primary" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary-foreground" />
            </div>
            <h1 className="text-2xl tracking-tight text-gradient-gold">Aura</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden sm:block">{user?.email}</span>
            <button onClick={handleLogout} className="text-muted-foreground hover:text-foreground transition-colors">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Dashboard */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 auto-rows-min">
          {/* Stats Row */}
          {stats.map((stat) => (
            <div key={stat.label} className="glass-card rounded-xl p-5 hover:bg-card-hover transition-colors">
              <div className="flex items-center justify-between mb-3">
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
              <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
            </div>
          ))}

          {/* Capture Button — spans 2 cols */}
          <div className="md:col-span-2 glass-card rounded-xl p-8 flex flex-col items-center justify-center text-center gold-glow cursor-pointer hover:bg-card-hover transition-all group"
               onClick={() => setCaptureOpen(true)}>
            <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Plus className="w-8 h-8 text-primary-foreground" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-1">Capture</h2>
            <p className="text-sm text-muted-foreground">Save a link, voice note, or thought</p>
          </div>

          {/* Skill Radar — spans 2 cols */}
          <div className="md:col-span-2 glass-card rounded-xl p-6 min-h-[340px]">
            <SkillRadar />
          </div>

          {/* Recent Entries — spans full width on lg */}
          <div className="md:col-span-2 lg:col-span-4 glass-card rounded-xl p-6">
            <RecentEntries entries={entries} />
          </div>
        </div>
      </main>

      <CaptureModal open={captureOpen} onOpenChange={setCaptureOpen} onCaptured={fetchEntries} />
    </div>
  );
};

export default Dashboard;
