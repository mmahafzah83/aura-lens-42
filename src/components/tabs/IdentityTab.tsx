import { useState } from "react";
import { User, Brain, Settings, Sparkles } from "lucide-react";
import ProfileIntelligence from "@/components/ProfileIntelligence";
import ProfileManagement from "@/components/ProfileManagement";
import PageHeader from "@/components/PageHeader";

interface IdentityTabProps {
  onResetDiagnostic: () => void;
}

const IdentityTab = ({ onResetDiagnostic }: IdentityTabProps) => {
  const [activeSection, setActiveSection] = useState<"identity" | "profile">("identity");

  const sections = [
    { key: "identity" as const, label: "Strategic Identity", icon: Brain },
    { key: "profile" as const, label: "Profile Settings", icon: Settings },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        icon={User}
        title="Identity"
        question="Who are you becoming as a strategist?"
        processLogic="Identity → Intelligence → Strategy → Authority → Growth"
      />

      {/* Sub Navigation */}
      <div className="flex gap-2 border-b border-border/10 pb-0">
        {sections.map((section) => (
          <button
            key={section.key}
            onClick={() => setActiveSection(section.key)}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-all duration-300 tactile-press ${
              activeSection === section.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <section.icon className="w-3.5 h-3.5" />
            <span className="text-xs font-medium tracking-wide">{section.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      {activeSection === "identity" && (
        <div className="space-y-6 animate-fade-in">
          {/* Pipeline Position Indicator */}
          <div className="glass-card rounded-2xl p-5 border border-primary/10">
            <div className="flex items-center gap-3 mb-3">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-xs font-semibold text-muted-foreground tracking-widest uppercase">Strategic Pipeline</span>
            </div>
            <div className="flex items-center gap-2">
              {["Identity", "Intelligence", "Strategy", "Authority", "Growth"].map((stage, i) => (
                <div key={stage} className="flex items-center gap-2">
                  <span className={`text-[11px] font-medium px-3 py-1.5 rounded-full ${
                    i === 0
                      ? "bg-primary/15 text-primary border border-primary/20"
                      : "bg-secondary/50 text-muted-foreground border border-border/10"
                  }`}>
                    {stage}
                  </span>
                  {i < 4 && <span className="text-muted-foreground/30 text-[10px]">→</span>}
                </div>
              ))}
            </div>
          </div>

          <ProfileIntelligence />
        </div>
      )}

      {activeSection === "profile" && (
        <div className="animate-fade-in">
          <ProfileManagement onResetDiagnostic={onResetDiagnostic} />
        </div>
      )}
    </div>
  );
};

export default IdentityTab;
