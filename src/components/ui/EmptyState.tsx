import { useEffect, useState, type ComponentType } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";

interface EmptyStateProps {
  icon: ComponentType<{ className?: string; size?: number; strokeWidth?: number; color?: string; style?: React.CSSProperties }>;
  title: string;
  description: string;
  /** If true and `{sector}` placeholder is in description, replaces with profile sector_focus. */
  personalize?: boolean;
  ctaLabel?: string;
  ctaAction?: () => void;
  className?: string;
}

let cachedSector: string | null | undefined;
let inflight: Promise<string | null> | null = null;

const fetchSector = async (): Promise<string | null> => {
  if (cachedSector !== undefined) return cachedSector ?? null;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;
      const { data } = await supabase
        .from("diagnostic_profiles")
        .select("sector_focus")
        .eq("user_id", session.user.id)
        .maybeSingle();
      cachedSector = (data as any)?.sector_focus || null;
      return cachedSector ?? null;
    } catch {
      cachedSector = null;
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
};

/**
 * Reusable empty state. If `personalize` is true, replaces the `{sector}` token in
 * `description` with the user's `sector_focus` (or removes it gracefully if absent).
 *
 * Example:
 *   description="Start by capturing something about {sector} you read today."
 */
const EmptyState = ({
  icon: Icon,
  title,
  description,
  personalize = false,
  ctaLabel,
  ctaAction,
  className = "",
}: EmptyStateProps) => {
  const [sector, setSector] = useState<string | null>(cachedSector ?? null);

  useEffect(() => {
    if (!personalize) return;
    let active = true;
    fetchSector().then((s) => { if (active) setSector(s); });
    return () => { active = false; };
  }, [personalize]);

  let resolved = description;
  if (personalize) {
    if (description.includes("{sector}")) {
      resolved = sector
        ? description.replace("{sector}", sector)
        : description.replace(/\s*about \{sector\}/i, "").replace("{sector}", "");
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={`flex flex-col items-center justify-center text-center py-12 px-6 ${className}`}
    >
      <Icon
        className="mb-4"
        size={48}
        strokeWidth={1.5}
        style={{ color: "var(--brand)", opacity: 0.55 }}
      />
      <h3
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 18,
          lineHeight: 1.3,
          color: "hsl(var(--foreground))",
          margin: 0,
        }}
      >
        {title}
      </h3>
      <p
        className="font-sans"
        style={{
          fontSize: 14,
          color: "hsl(var(--muted-foreground))",
          maxWidth: 400,
          marginTop: 8,
          lineHeight: 1.5,
        }}
      >
        {resolved}
      </p>
      {ctaLabel && ctaAction && (
        <button
          onClick={ctaAction}
          className="mt-5 font-sans transition-opacity hover:opacity-90"
          style={{
            background: "var(--brand)",
            color: "var(--brand-foreground, #fff)",
            borderRadius: 9999,
            padding: "10px 22px",
            fontSize: 13,
            fontWeight: 500,
            border: "none",
            cursor: "pointer",
          }}
        >
          {ctaLabel}
        </button>
      )}
    </motion.div>
  );
};

export default EmptyState;