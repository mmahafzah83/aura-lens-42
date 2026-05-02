import { User, LogOut, Sun, Moon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface ProfileMenuProps {
  fullName?: string | null;
  email?: string;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onSignOut: () => void;
}

export default function ProfileMenu({
  fullName,
  email,
  theme,
  onToggleTheme,
  onSignOut,
}: ProfileMenuProps) {
  const fn = (fullName || "").trim();
  const parts = fn.split(/\s+/).filter(Boolean);
  const initials =
    parts.length >= 2
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : parts.length === 1
        ? parts[0][0]?.toUpperCase()
        : "";

  return (
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
        className="p-0 border-0"
        style={{
          minWidth: 220,
          background: "var(--surface-ink-raised, var(--paper, #fff))",
          border: "0.5px solid var(--brand-line, rgba(0,0,0,0.1))",
          borderRadius: 10,
          boxShadow: "var(--shadow-lift, 0 10px 30px -10px rgba(0,0,0,0.25))",
          padding: "12px 0",
        }}
      >
        {/* User info */}
        <div style={{ padding: "4px 16px 8px" }}>
          {fn && (
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--foreground)",
                lineHeight: 1.3,
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
                wordBreak: "break-all",
              }}
            >
              {email}
            </div>
          )}
        </div>

        <DropdownMenuSeparator
          style={{ background: "var(--brand-line, rgba(0,0,0,0.08))", margin: "4px 0" }}
        />

        {/* Theme toggle row */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onToggleTheme();
          }}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 16px",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--foreground)",
            fontSize: 13,
          }}
          className="hover:bg-[var(--brand-ghost,rgba(0,0,0,0.04))] transition-colors"
        >
          <span>Appearance</span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: "var(--muted-foreground)",
            }}
          >
            {theme === "light" ? (
              <Sun className="w-3.5 h-3.5" />
            ) : (
              <Moon className="w-3.5 h-3.5" />
            )}
            {theme === "light" ? "Light" : "Dark"}
          </span>
        </button>

        <DropdownMenuSeparator
          style={{ background: "var(--brand-line, rgba(0,0,0,0.08))", margin: "4px 0" }}
        />

        {/* Sign out */}
        <button
          type="button"
          onClick={onSignOut}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 16px",
            background: "transparent",
            border: "none",
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
  );
}