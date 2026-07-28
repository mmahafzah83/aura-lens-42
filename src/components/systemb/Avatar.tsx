import React from "react";

/**
 * Avatar — the real photo from diagnostic_profiles.avatar_url.
 * Initials are the fallback only, never the default.
 */

export type AvatarSize = "sm" | "md" | "lg";

const PX: Record<AvatarSize, number> = { sm: 28, md: 36, lg: 44 };

function initialsOf(name?: string | null): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return (parts[0][0] || "").toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  size?: AvatarSize;
  /** Ring colour override for dark surfaces. */
  ring?: string;
  style?: React.CSSProperties;
}

const Avatar: React.FC<AvatarProps> = ({ src, name, size = "md", ring, style }) => {
  const px = PX[size];
  const shell: React.CSSProperties = {
    width: px, height: px, borderRadius: 999, flexShrink: 0,
    overflow: "hidden", display: "inline-flex", alignItems: "center", justifyContent: "center",
    border: `1px solid ${ring || "var(--border-default)"}`,
    ...style,
  };
  if (src) {
    return (
      <span style={shell} data-testid="systemb-avatar" data-avatar="photo">
        <img src={src} alt={name ? `${name}'s profile photo` : "Profile photo"}
          style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </span>
    );
  }
  const initials = initialsOf(name);
  return (
    <span
      style={{
        ...shell,
        background: "var(--surface-inverse)",
        color: "var(--text-inverse)",
        fontFamily: "var(--ff-ui)",
        fontSize: Math.round(px * 0.36),
        fontWeight: 600,
        letterSpacing: ".02em",
      }}
      data-testid="systemb-avatar"
      data-avatar="initials"
      aria-label={name ? `${name}` : "Account"}
    >{initials || "•"}</span>
  );
};

export default Avatar;