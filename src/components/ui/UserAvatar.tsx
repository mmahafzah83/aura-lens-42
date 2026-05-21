import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg";

interface UserAvatarProps {
  firstName?: string | null;
  lastName?: string | null;
  size?: Size;
  className?: string;
  title?: string;
}

const SIZE_CLASSES: Record<Size, string> = {
  sm: "w-7 h-7 text-xs",
  md: "w-9 h-9 text-sm",
  lg: "w-12 h-12 text-base",
};

/**
 * Reusable initials avatar.
 * Light mode: gold-pale background, gold-dark initials.
 * Dark mode: gold-dark tinted background, gold-light initials.
 * Initials = first letter of firstName + first letter of lastName.
 */
export default function UserAvatar({
  firstName,
  lastName,
  size = "md",
  className,
  title,
}: UserAvatarProps) {
  const fn = (firstName || "").trim();
  const ln = (lastName || "").trim();
  const initials =
    fn && ln
      ? (fn[0] + ln[0]).toUpperCase()
      : fn
        ? fn[0].toUpperCase()
        : "•";

  const fullName = [fn, ln].filter(Boolean).join(" ");

  return (
    <span
      aria-hidden={false}
      role="img"
      aria-label={fullName ? `${fullName} avatar` : "User avatar"}
      title={title ?? fullName ?? undefined}
      className={cn(
        "inline-flex items-center justify-center rounded-full font-serif font-medium select-none shrink-0",
        "bg-[var(--gold-pale)] border border-[var(--gold-dark)]/20 text-[var(--gold-dark)]",
        "dark:bg-[color-mix(in_srgb,var(--gold-dark)_22%,transparent)] dark:border-[var(--gold-light)]/20 dark:text-[var(--gold-light)]",
        SIZE_CLASSES[size],
        className,
      )}
    >
      {initials}
    </span>
  );
}