import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * MiniPreview — 4:5 signature card preview fed by real diagnostic_profiles.
 * Uses System-A tokens only. Newsreader display, IBM Plex Mono labels.
 * No hardcoded names.
 */

type Variant = "cover" | "frame" | "line";

interface Props {
  variant: Variant;
  compact?: boolean;
}

interface Profile {
  first_name: string | null;
  level: string | null;
}

const LABEL: Record<Variant, string> = {
  cover: "COVER · SIGNATURE",
  frame: "THE FRAME",
  line: "THE LINE",
};

export default function MiniPreview({ variant, compact = true }: Props) {
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;
      const { data } = await supabase
        .from("diagnostic_profiles")
        .select("first_name, level")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (alive && data) setProfile(data as Profile);
    })();
    return () => { alive = false; };
  }, []);

  const name = profile?.first_name?.trim() || "—";
  const level = profile?.level?.trim() || "—";

  return (
    <div
      style={{
        aspectRatio: "4 / 5",
        width: "100%",
        maxWidth: compact ? 220 : 320,
        background: "var(--paper)",
        color: "var(--ink)",
        border: "1px solid var(--rule)",
        padding: compact ? 14 : 20,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
        fontFamily: "var(--font-serif, 'Newsreader', serif)",
      }}
    >
      <div
        style={{
          fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
          fontSize: 9,
          letterSpacing: "0.22em",
          color: "var(--spot)",
          textTransform: "uppercase",
        }}
      >
        {LABEL[variant]}
      </div>

      {variant === "cover" && (
        <div>
          <div
            style={{
              fontFamily: "'Newsreader', serif",
              fontStyle: "italic",
              fontSize: compact ? 22 : 30,
              lineHeight: 1.05,
              color: "var(--ink)",
              letterSpacing: "-0.01em",
            }}
          >
            {name}
          </div>
          <div
            style={{
              marginTop: 6,
              fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
              fontSize: 9,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "var(--ink-3)",
            }}
          >
            {level}
          </div>
        </div>
      )}

      {variant === "frame" && (
        <div
          style={{
            flex: 1,
            margin: "10px 0",
            border: "1px solid var(--rule)",
            background: "var(--paper-2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--ink-3)",
            fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
            fontSize: 9,
            letterSpacing: "0.18em",
          }}
        >
          PHOTO
        </div>
      )}

      {variant === "line" && (
        <div
          style={{
            fontFamily: "'Newsreader', serif",
            fontStyle: "italic",
            fontSize: compact ? 15 : 20,
            lineHeight: 1.35,
            color: "var(--ink)",
          }}
        >
          One sentence you would sign.
        </div>
      )}

      <div
        style={{
          fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
          fontSize: 8.5,
          letterSpacing: "0.24em",
          color: "var(--ink-3)",
          textTransform: "uppercase",
        }}
      >
        AURA · SIGNATURE
      </div>
    </div>
  );
}