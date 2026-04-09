import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Brain, RefreshCw, Loader2, Sparkles, Target, Globe, Lightbulb, Users, Star, Compass, Layers, Edit2, Save, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface AuthorityTheme {
  theme: string;
  rationale: string;
}

interface IdentityModel {
  primary_role: string;
  secondary_strengths: string[];
  identity_summary: string;
  expertise_areas: string[];
  industries: string[];
  knowledge_domains: string[];
  values: string[];
  authority_ambitions: string[];
  strategic_goals: string[];
  authority_themes: AuthorityTheme[];
  capabilities: string[];
  clients: string[];
  generated_at?: string;
}

const EMPTY_IDENTITY: IdentityModel = {
  primary_role: "",
  secondary_strengths: [],
  identity_summary: "",
  expertise_areas: [],
  industries: [],
  knowledge_domains: [],
  values: [],
  authority_ambitions: [],
  strategic_goals: [],
  authority_themes: [],
  capabilities: [],
  clients: [],
};

const SECTION_CONFIG = [
  { key: "expertise_areas", label: "Expertise Areas", icon: Layers, color: "text-primary" },
  { key: "industries", label: "Industries", icon: Globe, color: "text-emerald-400" },
  { key: "knowledge_domains", label: "Knowledge Domains", icon: Lightbulb, color: "text-amber-400" },
  { key: "capabilities", label: "Capabilities", icon: Star, color: "text-violet-400" },
  { key: "clients", label: "Target Clients", icon: Users, color: "text-sky-400" },
  { key: "values", label: "Core Values", icon: Compass, color: "text-rose-400" },
  { key: "authority_ambitions", label: "Authority Ambitions", icon: Target, color: "text-primary" },
  { key: "strategic_goals", label: "Strategic Goals", icon: Target, color: "text-emerald-400" },
] as const;

type EditableArrayKey = typeof SECTION_CONFIG[number]["key"];

interface ProfileIntelligenceProps {
  onGenerateContent?: (topic: string) => void;
}

const ProfileIntelligence = ({ onGenerateContent }: ProfileIntelligenceProps) => {
  const [identity, setIdentity] = useState<IdentityModel>(EMPTY_IDENTITY);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [editing, setEditing] = useState<EditableArrayKey | null>(null);
  const [editItems, setEditItems] = useState<string[]>([]);
  const [newItem, setNewItem] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadIdentity();
  }, []);

  const loadIdentity = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await (supabase.from("diagnostic_profiles" as any) as any)
      .select("identity_intelligence")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profile?.identity_intelligence && Object.keys(profile.identity_intelligence).length > 0) {
      setIdentity({ ...EMPTY_IDENTITY, ...profile.identity_intelligence });
    }
    setLoading(false);
  };

  const generateIdentity = async () => {
    setGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-identity-intelligence`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({}),
      });
      if (!resp.ok) throw new Error("Failed to generate");
      const data = await resp.json();
      if (data.identity) {
        setIdentity({ ...EMPTY_IDENTITY, ...data.identity });
        toast({ title: "Identity Model Generated", description: "Your strategic identity has been analyzed." });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const startEdit = (key: EditableArrayKey) => {
    setEditing(key);
    setEditItems([...(identity[key] as string[])]);
    setNewItem("");
  };

  const saveEdit = async (key: EditableArrayKey) => {
    setSaving(true);
    const updated = { ...identity, [key]: editItems };
    setIdentity(updated);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await (supabase.from("diagnostic_profiles" as any) as any)
        .update({ identity_intelligence: updated })
        .eq("user_id", user.id);
    }
    setEditing(null);
    setSaving(false);
    toast({ title: "Saved" });
  };

  const addItem = () => {
    if (!newItem.trim()) return;
    setEditItems(prev => [...prev, newItem.trim()]);
    setNewItem("");
  };

  const removeItem = (idx: number) => setEditItems(prev => prev.filter((_, i) => i !== idx));

  const hasIdentity = identity.primary_role !== "";

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-8 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl p-6 sm:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
            <Brain className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Profile Intelligence</h3>
            <p className="text-xs text-muted-foreground">Executive positioning model</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={generateIdentity}
          disabled={generating}
          className="gap-2 border-primary/30 text-primary hover:bg-primary/10"
        >
          {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {hasIdentity ? "Refresh" : "Analyze"}
        </Button>
      </div>

      {!hasIdentity ? (
        <div className="text-center py-12 space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto border border-primary/20">
            <Sparkles className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h4 className="text-base font-semibold text-foreground">Discover Your Strategic Identity</h4>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              Aura will analyze your captures, frameworks, and signals to build your strategic identity model.
            </p>
          </div>
          <Button onClick={generateIdentity} disabled={generating} className="gap-2">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
            Generate Identity Model
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Identity Summary Card */}
          <div className="p-5 rounded-xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <div>
                <h4 className="text-base font-semibold text-foreground">{identity.primary_role}</h4>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {identity.secondary_strengths.map((s, i) => (
                    <span key={i} className="text-[10px] px-2.5 py-1 rounded-full bg-primary/15 text-primary border border-primary/20 font-medium">{s}</span>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{identity.identity_summary}</p>
              </div>
            </div>
          </div>

          {/* Sections Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {SECTION_CONFIG.map(({ key, label, icon: Icon, color }) => (
              <div key={key} className="p-4 rounded-xl bg-secondary/30 border border-border/10">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${color}`} />
                    <span className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">{label}</span>
                  </div>
                  {editing !== key && (
                    <button onClick={() => startEdit(key)} className="text-muted-foreground hover:text-primary transition-colors">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {editing === key ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {editItems.map((item, i) => (
                        <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-secondary text-foreground border border-border/20 flex items-center gap-1.5">
                          {item}
                          <button onClick={() => removeItem(i)} className="hover:text-destructive"><X className="w-3 h-3" /></button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Add…"
                        value={newItem}
                        onChange={(e) => setNewItem(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addItem()}
                        className="h-7 text-xs bg-secondary border-border/30 flex-1"
                      />
                      <Button size="sm" variant="ghost" onClick={addItem} className="h-7 px-2 text-xs">+</Button>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => saveEdit(key)} disabled={saving} className="h-7 text-xs gap-1">
                        <Save className="w-3 h-3" /> Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)} className="h-7 text-xs">Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {(identity[key] as string[]).length > 0 ? (
                      (identity[key] as string[]).map((item, i) => (
                        <span key={i} className="text-[11px] px-2.5 py-1 rounded-full bg-secondary/60 text-foreground/80 border border-border/10">{item}</span>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground italic">Not yet analyzed</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Authority Theme Suggestions */}
          {identity.authority_themes.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" />
                <h4 className="text-sm font-semibold text-foreground">Where to build authority next</h4>
              </div>
              <div className="space-y-2">
                {identity.authority_themes.map((at, i) => (
                  <div key={i} className="p-4 rounded-xl bg-secondary/30 border border-border/10">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <h5 className="text-sm font-medium text-foreground">{at.theme}</h5>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{at.rationale}</p>
                      </div>
                      {onGenerateContent && (
                        <button
                          onClick={() => onGenerateContent(at.theme)}
                          className="text-[11px] font-medium flex items-center gap-1 shrink-0 mt-0.5 hover:underline"
                          style={{ color: "#C5A55A" }}
                        >
                          Create post on this <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Generated timestamp */}
          {identity.generated_at && (
            <p className="text-[10px] text-muted-foreground text-right">
              Last analyzed: {new Date(identity.generated_at).toLocaleDateString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default ProfileIntelligence;
