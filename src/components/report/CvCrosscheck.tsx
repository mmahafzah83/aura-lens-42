/**
 * CV AGAINST LINKEDIN — the member-facing reader for
 * `diagnostic_profiles.cv_crosscheck`.
 *
 * The admin panel (components/admin/CvCrosscheckPanel.tsx) stays as it is;
 * this is a lift-and-restyle into System-B tokens, never an import of it.
 * It renders nothing at all when there is no crosscheck on file.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OB } from "@/components/onboarding/tokens";

export type CvFinding = {
  what?: string | null;
  why_it_matters?: string | null;
  do_this?: string | null;
  weight?: string | null;
};

export type CvCrosscheckData = {
  headline_finding?: string | null;
  findings?: CvFinding[] | null;
  defensibility?: string[] | null;
  cv_is_behind?: string[] | null;
  profile_vs_voice?: string | null;
  reading_the_shape?: string | null;
};

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && s.trim().length > 0) : [];

export function hasCvCrosscheck(raw: unknown): raw is CvCrosscheckData {
  if (!raw || typeof raw !== "object") return false;
  const d = raw as CvCrosscheckData;
  const findings = Array.isArray(d.findings)
    ? d.findings.filter((f) => f && (f.what || f.do_this))
    : [];
  return Boolean(
    (typeof d.headline_finding === "string" && d.headline_finding.trim()) ||
      findings.length ||
      strings(d.defensibility).length ||
      strings(d.cv_is_behind).length ||
      (typeof d.profile_vs_voice === "string" && d.profile_vs_voice.trim()),
  );
}

const eyebrow: React.CSSProperties = {
  fontFamily: OB.mono,
  fontSize: 10.5,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: OB.muted,
  margin: 0,
};

const label: React.CSSProperties = {
  fontFamily: OB.mono,
  fontSize: 10.5,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: OB.muted,
  margin: "22px 0 8px",
};

const body: React.CSSProperties = {
  fontFamily: OB.ui,
  fontSize: 14.5,
  lineHeight: 1.65,
  color: OB.ink,
  margin: 0,
};

function Bullets({ items }: { items: string[] }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
      {items.map((s, i) => (
        <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span
            aria-hidden
            style={{
              inlineSize: 5,
              blockSize: 5,
              borderRadius: 999,
              background: OB.cyan,
              marginBlockStart: 8,
              flex: "0 0 auto",
            }}
          />
          <span style={{ ...body, fontSize: 14 }}>{s}</span>
        </li>
      ))}
    </ul>
  );
}

export default function CvCrosscheck({
  data,
  userId,
  style,
}: {
  /** Pass the stored object directly when the caller already has it. */
  data?: unknown;
  /** Or let the component read it for this member. */
  userId?: string | null;
  style?: React.CSSProperties;
}) {
  const [fetched, setFetched] = useState<unknown>(null);

  useEffect(() => {
    if (data || !userId) return;
    let alive = true;
    void (async () => {
      const { data: row } = await supabase
        .from("diagnostic_profiles")
        .select("cv_crosscheck")
        .eq("user_id", userId)
        .maybeSingle();
      if (alive) setFetched((row as { cv_crosscheck?: unknown } | null)?.cv_crosscheck ?? null);
    })();
    return () => {
      alive = false;
    };
  }, [data, userId]);

  const raw = data ?? fetched;
  if (!hasCvCrosscheck(raw)) return null;
  const d = raw;

  const findings = (Array.isArray(d.findings) ? d.findings : []).filter((f) => f && (f.what || f.do_this));
  const behind = strings(d.cv_is_behind);
  const proof = strings(d.defensibility);

  return (
    <section
      style={{
        background: OB.white,
        border: `0.5px solid ${OB.line}`,
        borderRadius: 14,
        padding: 18,
        maxInlineSize: "100%",
        ...style,
      }}
    >
      <p style={eyebrow}>CV against LinkedIn</p>

      {d.headline_finding ? (
        <p style={{ ...body, fontSize: 17.5, lineHeight: 1.5, marginBlockStart: 10 }}>{d.headline_finding}</p>
      ) : null}

      {findings.length > 0 && (
        <>
          <p style={label}>Where the two disagree</p>
          <div style={{ display: "grid", gap: 14 }}>
            {findings.map((f, i) => (
              <div
                key={i}
                style={{
                  borderInlineStart: `2px solid ${OB.line}`,
                  paddingInlineStart: 12,
                  display: "grid",
                  gap: 4,
                }}
              >
                {f.what ? <p style={{ ...body, fontWeight: 600 }}>{f.what}</p> : null}
                {f.why_it_matters ? (
                  <p style={{ ...body, fontSize: 13.5, color: OB.muted }}>{f.why_it_matters}</p>
                ) : null}
                {f.do_this ? <p style={{ ...body, fontSize: 13.5, color: OB.blue }}>{f.do_this}</p> : null}
              </div>
            ))}
          </div>
        </>
      )}

      {behind.length > 0 && (
        <>
          <p style={label}>What your CV has not caught up with</p>
          <Bullets items={behind} />
        </>
      )}

      {proof.length > 0 && (
        <>
          <p style={label}>What you can prove</p>
          <Bullets items={proof} />
        </>
      )}

      {d.profile_vs_voice ? (
        <p style={{ ...body, fontSize: 14, color: OB.muted, marginBlockStart: 22 }}>{d.profile_vs_voice}</p>
      ) : null}
    </section>
  );
}