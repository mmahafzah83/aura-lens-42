import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AuraLogo from "@/components/brand/AuraLogo";
import { flagFor } from "@/components/CountryPicker";

// System-A bone palette (fixed for the card surface — reads well in any parent theme).
const PAPER = "#F1ECE1";
const INK = "#1B1712";
const INK_2 = "rgba(27,23,18,0.68)";
const INK_3 = "rgba(27,23,18,0.48)";
const RULE = "rgba(27,23,18,0.14)";
const SPOT = "#7A1F2B"; // oxblood
const TEAL = "#36C5B0";

const SERIF = "'Newsreader', Georgia, serif";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

export type AuraCardVariant = "voice" | "skills";

interface Profile {
  first_name?: string | null;
  last_name?: string | null;
  level?: string | null;
  avatar_url?: string | null;
  country?: string | null;
  country_code?: string | null;
  sector_focus?: string | null;
  core_practice?: string | null;
  brand_pillars?: string[] | null;
  audit_results?: Record<string, number> | null;
}

function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { setLoading(false); return; }
      const { data } = await (supabase.from("diagnostic_profiles" as any) as any)
        .select("first_name,last_name,level,avatar_url,country,country_code,sector_focus,core_practice,brand_pillars,audit_results")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (!cancelled) { setProfile((data as any) || {}); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);
  return { profile, loading };
}

function mastheadDate(d = new Date()): string {
  const months = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];
  return `VOL. 1 · ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function Empty({ text }: { text: string }) {
  return (
    <div style={{
      border: `1px dashed ${RULE}`,
      padding: "14px 16px",
      color: INK_3,
      fontFamily: SERIF,
      fontStyle: "italic",
      fontSize: 14,
      lineHeight: 1.4,
    }}>{text}</div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: MONO,
      fontSize: 10,
      letterSpacing: "0.16em",
      textTransform: "uppercase",
      color: INK_3,
      marginBottom: 8,
    }}>{children}</div>
  );
}

function AvatarRing({ src, alt }: { src?: string | null; alt: string }) {
  const size = 132;
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  // "Growing" ring: 72% of the circumference in teal.
  const dash = c * 0.72;
  return (
    <div style={{ position: "relative", width: size, height: size, flex: "0 0 auto" }}>
      <svg width={size} height={size} style={{ position: "absolute", inset: 0 }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={RULE} strokeWidth={stroke} />
        <circle
          cx={size/2} cy={size/2} r={r} fill="none"
          stroke={TEAL} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform={`rotate(-90 ${size/2} ${size/2})`}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 8, borderRadius: "50%",
        overflow: "hidden", background: "#E7E1D3",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {src ? (
          <img src={src} alt={alt} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{ fontFamily: SERIF, fontSize: 42, color: INK_3 }}>
            {alt.trim().slice(0,1).toUpperCase() || "·"}
          </span>
        )}
      </div>
    </div>
  );
}

function Chips({ items }: { items: string[] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {items.map((t, i) => (
        <span key={i} style={{
          display: "inline-flex", alignItems: "center",
          fontFamily: SERIF, fontSize: 14, lineHeight: 1.35, color: INK,
          padding: "12px 14px", border: `1px solid ${RULE}`, borderRadius: 999,
          background: "rgba(27,23,18,0.02)",
          whiteSpace: "normal", wordBreak: "break-word",
        }}>{t}</span>
      ))}
    </div>
  );
}

function Radar({ data }: { data: Array<{ name: string; score: number }> }) {
  const size = 260;
  const cx = size / 2;
  const cy = size / 2;
  const R = 96;
  const n = data.length;
  if (n < 3) return null;
  const pt = (i: number, v: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const r = (Math.max(0, Math.min(100, v)) / 100) * R;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  };
  const axis = (i: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + R * Math.cos(a), cy + R * Math.sin(a)] as const;
  };
  const poly = data.map((d, i) => pt(i, d.score).join(",")).join(" ");
  return (
    <svg width={size} height={size} role="img" aria-label="Capability radar">
      {[0.25, 0.5, 0.75, 1].map((f, k) => (
        <circle key={k} cx={cx} cy={cy} r={R * f} fill="none" stroke={RULE} strokeWidth={1} />
      ))}
      {data.map((_, i) => {
        const [x, y] = axis(i);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={RULE} strokeWidth={1} />;
      })}
      <polygon points={poly} fill={SPOT} fillOpacity={0.14} stroke={SPOT} strokeWidth={1.5} />
      {data.map((d, i) => {
        const [x, y] = pt(i, d.score);
        return <circle key={i} cx={x} cy={y} r={2.5} fill={SPOT} />;
      })}
    </svg>
  );
}

export interface AuraCardProps {
  variant: AuraCardVariant;
}

export default function AuraCard({ variant }: AuraCardProps) {
  const { profile, loading } = useProfile();

  const fullName = useMemo(() => {
    if (!profile) return "";
    return [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();
  }, [profile]);

  const pillars: string[] = useMemo(() => {
    const p = profile?.brand_pillars;
    return Array.isArray(p) ? p.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
  }, [profile]);

  const topVoice: string = useMemo(() => {
    if (!profile) return "";
    return (profile.core_practice && profile.core_practice.trim())
      || (profile.sector_focus && profile.sector_focus.trim())
      || (pillars[0] || "");
  }, [profile, pillars]);

  const radarData = useMemo(() => {
    const raw = profile?.audit_results;
    if (!raw || typeof raw !== "object") return [];
    return Object.entries(raw)
      .filter(([, v]) => typeof v === "number" && isFinite(v as number))
      .map(([name, score]) => ({ name, score: Number(score) }));
  }, [profile]);

  const topSkills = useMemo(() => {
    return [...radarData].sort((a, b) => b.score - a.score).slice(0, 3);
  }, [radarData]);

  // Card surface — fixed proportion (4:5-ish), scales with parent.
  const cardStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: 640,
    background: PAPER,
    color: INK,
    border: `1px solid ${RULE}`,
    padding: "28px 32px 26px",
    boxSizing: "border-box",
    fontFamily: SERIF,
    position: "relative",
    boxShadow: "0 30px 60px -30px rgba(27,23,18,0.28)",
  };

  return (
    <article style={cardStyle} aria-label={`Aura ${variant} card`}>
      {/* Header */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <AuraLogo variant="light" size={22} withWordmark={false} />
          <span style={{
            fontFamily: SERIF,
            fontWeight: 600,
            fontSize: 20,
            letterSpacing: "0.04em",
            color: INK,
            lineHeight: 1,
          }}>Aura</span>
        </span>
        <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.18em", color: INK_3 }}>
          {mastheadDate()}
        </div>
      </header>

      <div style={{ height: 1, background: INK, opacity: 0.85, marginBottom: 22 }} />

      {/* Hero */}
      <section style={{ display: "flex", gap: 22, alignItems: "center", marginBottom: 24 }}>
        <AvatarRing src={profile?.avatar_url} alt={fullName || "Aura"} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", color: INK_3, marginBottom: 6 }}>
            AURA MEMBER
          </div>
          {loading ? (
            <div style={{ height: 34, width: "60%", background: RULE }} />
          ) : fullName ? (
            <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 30, lineHeight: 1.1, letterSpacing: "-0.01em", margin: 0 }}>
              {fullName}
            </h1>
          ) : (
            <Empty text="Add your name in Settings to unlock this." />
          )}
          {profile?.level && (
            <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 15, color: INK_2, marginTop: 4 }}>
              {profile.level}
            </div>
          )}
          {(profile?.country_code || profile?.country) && (
            <div style={{ fontFamily: MONO, fontSize: 11, color: INK_2, marginTop: 8, letterSpacing: "0.06em" }}>
              <span style={{ fontSize: 14 }}>{flagFor(profile?.country_code)}</span>
              <span style={{ marginLeft: 6 }}>{profile?.country || ""}</span>
            </div>
          )}
        </div>
      </section>

      <div style={{ height: 1, background: RULE, marginBottom: 22 }} />

      {/* Body — variant-specific */}
      {variant === "voice" && (
        <section style={{ marginBottom: 24 }}>
          <Label>Top voice in</Label>
          {topVoice ? (
            <div style={{ fontFamily: SERIF, fontSize: 26, lineHeight: 1.15, letterSpacing: "-0.01em", color: SPOT, marginBottom: 22 }}>
              {topVoice}
            </div>
          ) : (
            <div style={{ marginBottom: 22 }}>
              <Empty text="Finish your assessment to unlock this." />
            </div>
          )}

          <Label>What they're known for</Label>
          <div style={{
            fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em",
            textTransform: "uppercase", color: INK_3, marginTop: -4, marginBottom: 10,
          }}>Their point of view on the field</div>
          {pillars.length > 0 ? (
            <Chips items={pillars.slice(0, 3)} />
          ) : (
            <Empty text="Finish your assessment to unlock this." />
          )}
        </section>
      )}

      {variant === "skills" && (
        <section style={{ marginBottom: 24 }}>
          <Label>Where they are strongest</Label>
          {radarData.length >= 3 ? (
            <div style={{ display: "flex", gap: 22, alignItems: "center", marginBottom: 22 }}>
              <div style={{ flex: "0 0 auto" }}><Radar data={radarData} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", color: INK_3, marginBottom: 8 }}>
                  Their 3 strongest skills
                </div>
                <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {topSkills.map((s, i) => (
                    <li key={s.name} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "8px 0", borderTop: i === 0 ? "none" : `1px solid ${RULE}` }}>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: INK_3, width: 18 }}>{String(i+1).padStart(2, "0")}</span>
                      <span style={{ fontFamily: SERIF, fontSize: 15, color: INK, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                      <span style={{ fontFamily: MONO, fontSize: 13, color: SPOT }}>{Math.round(s.score)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          ) : (
            <Empty text="Finish your assessment to unlock this." />
          )}
        </section>
      )}

      <div style={{ height: 1, background: RULE, marginBottom: 14 }} />

      {/* Footer */}
      <footer style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", color: INK_3 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <AuraLogo variant="light" size={14} withWordmark={false} />
          <span>MEASURED BY AURA</span>
        </div>
        <span>AURA-INTEL.ORG</span>
      </footer>
    </article>
  );
}