import { UserCog, LogOut, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Avatar from "@/components/systemb/Avatar";
import AuraRing from "@/components/systemb/AuraRing";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ProfileMenuProps {
  fullName?: string | null;
  email?: string;
  avatarUrl?: string | null;
  userId?: string | null;
  theme?: "light" | "dark";
  onToggleTheme?: () => void;
  onSignOut: () => void;
  onOpenAccount?: () => void;
  onOpenPreferences?: () => void;
  onQuestAction?: (questId: string) => void;
  onViewFullJourney?: () => void;
}

export default function ProfileMenu({
  fullName,
  email,
  avatarUrl,
  userId,
  onSignOut,
  onOpenAccount,
  // Preferences now lives as the first tab inside Settings.
  onOpenPreferences: _onOpenPreferences,
  // onQuestAction and onViewFullJourney are accepted for backwards
  // compatibility but no longer rendered — the dropdown no longer
  // hosts its own progress tracker. Home checklist + My Story
  // milestones are the single sources of truth.
  onQuestAction: _onQuestAction,
  onViewFullJourney: _onViewFullJourney,
}: ProfileMenuProps) {
  const fn = (fullName || "").trim();
  const firstName = fn.split(/\s+/).filter(Boolean)[0] || "";

  const navigate = useNavigate();

  const itemStyle: React.CSSProperties = {
    width: "100%",
    minHeight: 44,
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    marginTop: 4,
    background: "transparent",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    color: "var(--ink)",
    fontSize: 14,
    fontWeight: 500,
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] rounded-full"
          title={fn || email || "Account"}
          aria-label={fn || "Account menu"}
        >
          <AuraRing userId={userId} size={36} gap="var(--paper)">
            <Avatar src={avatarUrl} name={fn || email || null} size="md" />
          </AuraRing>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="p-0 border-0 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95"
        style={{
          minWidth: 240,
          maxWidth: "calc(100vw - 24px)",
          background: "var(--paper-2)",
          border: "0.5px solid var(--rule)",
          borderRadius: 12,
          boxShadow: "var(--shadow-lift, 0 10px 30px -10px rgba(0,0,0,0.25))",
          color: "var(--ink)",
          padding: 8,
        }}
      >
        {/* HEADER */}
        <div style={{ padding: 12, display: "flex", alignItems: "center", gap: 12 }}>
          <Avatar src={avatarUrl} name={fn || email || null} size="lg" />
          <div style={{ minWidth: 0, flex: 1 }}>
            {(firstName || fn) && (
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: "var(--ink)",
                  lineHeight: 1.3,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {firstName || fn}
              </div>
            )}
            {email && (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--ink-3)",
                  marginTop: 2,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {email}
              </div>
            )}
          </div>
        </div>

        {/* DIVIDER */}
        <div
          style={{
            height: 0,
            borderTop: "0.5px solid var(--rule)",
            margin: "8px 4px 8px",
          }}
        />

        {/* ACCOUNT */}
        <button
          type="button"
          onClick={() => (onOpenAccount ? onOpenAccount() : navigate("/settings?tab=account"))}
          style={itemStyle}
          className="hover:bg-[var(--paper-3)] transition-colors"
        >
          <UserCog className="w-4 h-4" />
          Account
        </button>

        {/* SETTINGS */}
        <button
          type="button"
          onClick={() => navigate("/settings")}
          style={{
            width: "100%",
            minHeight: 44,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            marginTop: 4,
            background: "transparent",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            color: "var(--ink)",
            fontSize: 14,
            fontWeight: 500,
          }}
          className="hover:bg-[var(--paper-3)] transition-colors"
        >
          <Settings className="w-4 h-4" />
          Settings
        </button>

        <div style={{ height: 0, borderTop: "0.5px solid var(--rule)", margin: "8px 4px" }} />

        {/* SIGN OUT */}
        <button
          type="button"
          onClick={onSignOut}
          style={{
            width: "100%",
            minHeight: 44,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            marginTop: 4,
            background: "transparent",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            color: "var(--spot)",
            fontSize: 14,
            fontWeight: 500,
          }}
          className="hover:bg-[var(--paper-3)] transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}