import { useState } from "react";
import { User, Brain, Settings } from "lucide-react";
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
      <div className="flex gap-2 border-b border-border/10 pb-0 overflow-x-auto scrollbar-hide w-full">
        {sections.map((section) => (
          <button
            key={section.key}
            onClick={() => setActiveSection(section.key)}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-all duration-300 tactile-press whitespace-nowrap flex-1 sm:flex-none justify-center sm:justify-start ${
              activeSection === section.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <section.icon className="w-3.5 h-3.5 shrink-0" />
            <span className="text-xs font-medium tracking-wide">{section.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      {activeSection === "identity" && (
        <div className="space-y-6 animate-fade-in">
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
