import { useState } from "react";
import { User, Brain, Settings, ClipboardList } from "lucide-react";
import ProfileIntelligence from "@/components/ProfileIntelligence";
import ProfileManagement from "@/components/ProfileManagement";
import OnboardingProfileSection from "@/components/OnboardingProfileSection";
import AuditRadarWidget from "@/components/AuditRadarWidget";
import BrandArchetypeWidget from "@/components/BrandArchetypeWidget";
import ObjectiveAuditModal from "@/components/ObjectiveAuditModal";
import BrandAssessmentModal from "@/components/BrandAssessmentModal";
import PageHeader from "@/components/PageHeader";
import VoiceEngineSection from "@/components/VoiceEngineSection";

interface IdentityTabProps {
  onResetDiagnostic: () => void;
  onSwitchTab?: (tab: string) => void;
  onDraftToStudio?: (prefill: { topic: string; context: string; sourceType?: string; sourceTitle?: string }) => void;
}

const IdentityTab = ({ onResetDiagnostic, onSwitchTab, onDraftToStudio }: IdentityTabProps) => {
  const [activeSection, setActiveSection] = useState<"profile" | "identity" | "settings">("profile");
  const [auditOpen, setAuditOpen] = useState(false);
  const [brandOpen, setBrandOpen] = useState(false);

  const sections = [
    { key: "profile" as const, label: "Your Profile", icon: ClipboardList },
    { key: "identity" as const, label: "Strategic Identity", icon: Brain },
    { key: "settings" as const, label: "Profile Settings", icon: Settings },
  ];

  const handleNavigate = (target: string) => {
    if (target === "settings" || target === "identity" || target === "profile") {
      setActiveSection(target);
    } else if (target === "intelligence" && onSwitchTab) {
      onSwitchTab("intelligence");
    }
  };

  const handleGenerateContent = (topic: string, context?: string) => {
    if (onDraftToStudio) {
      onDraftToStudio({
        topic,
        context: context || "",
        sourceType: "authority_next",
        sourceTitle: topic,
      });
    } else if (onSwitchTab) {
      sessionStorage.setItem("aura_prefill_topic", topic);
      onSwitchTab("authority");
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        icon={User}
        title="My Story"
        question="Build your foundation"
        processLogic="My Story → Signals → Strategy → Publish → Impact"
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
      {activeSection === "profile" && (
        <div className="space-y-6 animate-fade-in">
          <OnboardingProfileSection onRetakeAudit={() => setAuditOpen(true)} onRetakeBrand={() => setBrandOpen(true)} />
          <VoiceEngineSection />
        </div>
      )}

      {activeSection === "identity" && (
        <div className="space-y-6 animate-fade-in">
          <ProfileIntelligence onGenerateContent={handleGenerateContent} />
          <BrandArchetypeWidget onStartAssessment={() => setBrandOpen(true)} />
          <AuditRadarWidget onStartAudit={() => setAuditOpen(true)} />
        </div>
      )}

      {activeSection === "settings" && (
        <div className="animate-fade-in">
          <ProfileManagement onResetDiagnostic={onResetDiagnostic} onNavigate={handleNavigate} />
        </div>
      )}

      <ObjectiveAuditModal
        open={auditOpen}
        onOpenChange={setAuditOpen}
        onNavigate={handleNavigate}
      />
      <BrandAssessmentModal
        open={brandOpen}
        onOpenChange={setBrandOpen}
        onNavigate={handleNavigate}
      />
    </div>
  );
};

export default IdentityTab;
