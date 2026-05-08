import { useEffect, useState } from "react";
import { User, LogOut, UserCog, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import SetPasswordModal from "@/components/SetPasswordModal";
import QuestLog from "@/components/QuestLog";
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
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onSignOut: () => void;
  onEditProfile?: () => void;
  onQuestAction?: (questId: string) => void;
  onViewFullJourney?: () => void;
}

export default function ProfileMenu({
  fullName,
  email,
  avatarUrl,
  userId,
  theme,
  onToggleTheme,
  onSignOut,
  onEditProfile,
  onQuestAction,
  onViewFullJourney,
}: ProfileMenuProps) {
  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [hasPassword, setHasPassword] = useState<boolean>(() => {
    try { return localStorage.getItem("password_set") === "1"; } catch { return false; }
  });
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(userId ?? null);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const meta = (data.user?.user_metadata || {}) as Record<string, unknown>;
      if (meta.password_set === true) {
        setHasPassword(true);
        try { localStorage.setItem("password_set", "1"); } catch {}
      }
      if (!userId && data.user?.id) setResolvedUserId(data.user.id);
    });
    return () => { active = false; };
  }, [userId]);

  const fn = (fullName || "").trim();
  const parts = fn.split(/\s+/).filter(Boolean);
  const initials =
    parts.length >= 2
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : parts.length === 1
        ? parts[0][0]?.toUpperCase()
        : "";

  const setTheme = (target: "light" | "dark") => {
    if (target !== theme) onToggleTheme();
  };

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="aura-initials-avatar focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] rounded-full"
          title={fn || email || "Account"}
          aria-label={fn || "Account menu"}
        >
          {initials || <User className="w-4 h-4" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="p-0 border-0 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95"
        style={{
          minWidth: 240,
          maxWidth: "calc(100vw - 24px)",
          background: "var(--surface-ink-raised, var(--paper, #fff))",
          border: "0.5px solid var(--brand-line, rgba(0,0,0,0.1))",
          borderRadius: 12,
          boxShadow: "var(--shadow-lift, 0 10px 30px -10px rgba(0,0,0,0.25))",
          padding: 8,
        }}
      >
        {/* HEADER */}
        <div style={{ padding: 12, display: "flex", alignItems: "center", gap: 12 }}>
          <div
            aria-hidden
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "var(--brand-surface, var(--brand-pale, #f3ecd9))",
              color: "var(--brand)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 600,
              fontSize: 14,
              flexShrink: 0,
              overflow: "hidden",
              border: "0.5px solid var(--brand-line, rgba(0,0,0,0.1))",
            }}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={fn || "Avatar"}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : initials ? (
              initials
            ) : (
              <User className="w-4 h-4" />
            )}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            {fn && (
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: "var(--foreground)",
                  lineHeight: 1.3,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {fn}
              </div>
            )}
            {email && (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--muted-foreground)",
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

        {/* THEME / APPEARANCE */}
        <div style={{ padding: "0 12px 12px" }}>
          <div
            style={{
              fontSize: 12,
              color: "var(--muted-foreground)",
              marginBottom: 6,
            }}
          >
            Appearance
          </div>
          <div
            role="group"
            aria-label="Theme"
            style={{
              display: "flex",
              width: "100%",
              padding: 3,
              borderRadius: 999,
              background: "var(--brand-ghost, rgba(0,0,0,0.04))",
              border: "0.5px solid var(--brand-line, rgba(0,0,0,0.08))",
            }}
          >
            {(["light", "dark"] as const).map((mode) => {
              const active = theme === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  data-testid={mode === "light" ? "nav-theme-toggle" : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    setTheme(mode);
                  }}
                  aria-pressed={active}
                  style={{
                    flex: 1,
                    minHeight: 32,
                    padding: "6px 10px",
                    fontSize: 12,
                    fontWeight: 500,
                    border: "none",
                    borderRadius: 999,
                    cursor: "pointer",
                    background: active ? "var(--brand-surface, var(--brand-pale, #f3ecd9))" : "transparent",
                    color: active ? "var(--brand)" : "var(--muted-foreground)",
                    transition: "background 150ms ease, color 150ms ease",
                    textTransform: "capitalize",
                  }}
                >
                  {mode}
                </button>
              );
            })}
          </div>
        </div>

        {/* DIVIDER */}
        <div
          style={{
            height: 0,
            borderTop: "0.5px solid var(--brand-line, rgba(0,0,0,0.08))",
            margin: "0 4px",
          }}
        />

        {/* QUEST LOG */}
        <div style={{ padding: "8px 4px 4px" }}>
          <QuestLog
            userId={resolvedUserId}
            compact
            onQuestAction={onQuestAction}
            onViewFullJourney={onViewFullJourney}
          />
        </div>

        {/* DIVIDER */}
        <div
          style={{
            height: 0,
            borderTop: "0.5px solid var(--brand-line, rgba(0,0,0,0.08))",
            margin: "8px 4px 0",
          }}
        />

        {/* EDIT PROFILE */}
        {onEditProfile && (
          <button
            type="button"
            onClick={onEditProfile}
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
              color: "var(--foreground)",
              fontSize: 13,
              fontWeight: 500,
            }}
            className="hover:bg-[var(--brand-ghost,rgba(0,0,0,0.04))] transition-colors"
          >
            <UserCog className="w-4 h-4" />
            Edit profile
          </button>
        )}

        {/* SET / CHANGE PASSWORD */}
        <button
          type="button"
          onClick={() => setPwModalOpen(true)}
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
            color: "var(--foreground)",
            fontSize: 13,
            fontWeight: 500,
          }}
          className="hover:bg-[var(--brand-ghost,rgba(0,0,0,0.04))] transition-colors"
        >
          <KeyRound className="w-4 h-4" />
          {hasPassword ? "Change password" : "Set password"}
        </button>

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
            color: "var(--danger, #c0392b)",
            fontSize: 13,
            fontWeight: 500,
          }}
          className="hover:bg-[var(--brand-ghost,rgba(0,0,0,0.04))] transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </DropdownMenuContent>
    </DropdownMenu>
    <SetPasswordModal
      open={pwModalOpen}
      onClose={() => { setPwModalOpen(false); setHasPassword(true); }}
      isFirstTime={!hasPassword}
    />
    </>
  );
}