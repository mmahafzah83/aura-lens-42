// W2-G-2a — Strategic Identity Report document.
// Pure render from ReportData (built by @/lib/buildIdentityReport).
// Each section gates on its null flag; whole pages omitted if empty.
// Styling inlined (literal hex / px / pt) so html2canvas in W2-G-2b
// snapshots faithfully without depending on Tailwind tokens.

import { rankFromLevel } from "@/lib/marketPersonas";
import { formatSkillLabel } from "@/lib/formatSkillLabel";
import type { ReportData, CapabilitiesSection } from "@/lib/buildIdentityReport";

// ── Design tokens (locked to literals for export fidelity) ──────────────
const BRONZE = "#C5A55A";
const BRONZE_DEEP = "#9C7E3E";
const BRONZE_FAINT = "rgba(197,165,90,0.12)";
const INK = "#1a1a1a";
const INK_2 = "#3a3a3a";
const INK_3 = "#6b6b6b";
const INK_4 = "#8a8a8a";
const RULE = "#e6e1d6";
const PAPER = "#ffffff";
const DISPLAY = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";
const BODY = "'DM Sans', system-ui, -apple-system, sans-serif";
const ARABIC = "'Cairo', 'DM Sans', sans-serif";

const SHEET_W = 794;   // A4 @ 96dpi
const SHEET_H = 1123;  // A4 @ 96dpi
const PAGE_PAD = 56;

// ── Helpers ─────────────────────────────────────────────────────────────
function titleCase(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");
}

function todayLabel(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  } catch {
    return "";
  }
}

// Strip trailing parenthetical like "18y total / 7y consulting (Industry Expert Pivot)".
function stripParenTail(s: string): string {
  return s.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

// Condense to a true one-liner: take first 1–2 items from a " · " joined list,
// then hard-cap the final string to ~90 chars + "…" regardless of item count.
function shortSnippet(value: string, maxItems = 2, maxLen = 90): string {
  if (!value) return "";
  let out = value;
  if (out.includes(" · ")) {
    const parts = out.split(" · ").map((p) => p.trim()).filter(Boolean);
    out = parts.slice(0, maxItems).join(" · ");
  }
  if (out.length > maxLen) {
    out = out.slice(0, maxLen).replace(/\s+\S*$/, "") + "…";
  }
  return out;
}

// ── Shared chrome ───────────────────────────────────────────────────────
function PageHeader({ subtitle }: { subtitle?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", paddingBottom: 14, borderBottom: `1px solid ${RULE}` }}>
      <div>
        <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 600, letterSpacing: "0.18em", color: INK }}>AURA</div>
        <div style={{ fontFamily: BODY, fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: INK_4, marginTop: 2 }}>
          Strategic Digital Presence
        </div>
      </div>
      {subtitle ? (
        <div style={{ fontFamily: BODY, fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: INK_3 }}>
          {subtitle}
        </div>
      ) : null}
    </div>
  );
}

function PageFooter({ n, total }: { n: number; total: number }) {
  return (
    <div
      style={{
        marginTop: "auto",
        paddingTop: 14,
        borderTop: `1px solid ${RULE}`,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontFamily: BODY,
        fontSize: 10,
        color: INK_4,
        letterSpacing: "0.06em",
      }}
    >
      <span>aura-intel.org</span>
      <span>
        Turns your expertise into presence
        <span style={{ margin: "0 8px", color: BRONZE }}>·</span>
        <span style={{ fontFamily: ARABIC }} dir="rtl">حوّل خبرتك إلى حضور</span>
      </span>
      <span>
        {String(n).padStart(2, "0")} / {String(total).padStart(2, "0")}
      </span>
    </div>
  );
}

function Sheet({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="aura-report-sheet"
      data-report-page
      style={{
        width: SHEET_W,
        minHeight: SHEET_H,
        background: PAPER,
        color: INK,
        fontFamily: BODY,
        padding: PAGE_PAD,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 12px 32px rgba(0,0,0,0.08)",
        margin: "0 auto 32px",
      }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: BODY,
        fontSize: 10,
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        color: BRONZE_DEEP,
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );
}

function Diamond({ size = 8, color = BRONZE }: { size?: number; color?: string }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: size,
        height: size,
        background: color,
        transform: "rotate(45deg)",
        marginRight: 6,
        verticalAlign: "middle",
      }}
    />
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 12px",
        marginRight: 8,
        marginBottom: 8,
        fontSize: 12,
        fontFamily: BODY,
        color: INK_2,
        background: BRONZE_FAINT,
        border: `1px solid ${BRONZE}`,
        borderRadius: 999,
      }}
    >
      <Diamond size={6} />
      {children}
    </span>
  );
}

// ── Radar (generic N-axis) ──────────────────────────────────────────────
function CapabilityRadar({ data }: { data: CapabilitiesSection }) {
  const N = data.length;
  const cx = 260;
  const cy = 150;
  const R = 100;
  const angles = data.map((_, i) => (-90 + (360 / N) * i) * (Math.PI / 180));

  const rings = [0.25, 0.5, 0.75, 1].map((k, i) => (
    <circle key={i} cx={cx} cy={cy} r={R * k} fill="none" stroke={RULE} strokeWidth={1} />
  ));
  const axes = angles.map((a, i) => (
    <line key={i} x1={cx} y1={cy} x2={cx + R * Math.cos(a)} y2={cy + R * Math.sin(a)} stroke={RULE} strokeWidth={1} />
  ));
  const pts = data.map((d, i) => {
    const r = (R * Math.max(0, Math.min(100, d.score))) / 100;
    return [cx + r * Math.cos(angles[i]), cy + r * Math.sin(angles[i])] as const;
  });
  const path = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

  const labels = data.map((d, i) => {
    const a = angles[i];
    const lx = cx + (R + 14) * Math.cos(a);
    const ly = cy + (R + 14) * Math.sin(a);
    const cosA = Math.cos(a);
    const anchor: "start" | "middle" | "end" =
      cosA > 0.3 ? "start" : cosA < -0.3 ? "end" : "middle";
    return (
      <text
        key={i}
        x={lx}
        y={ly}
        textAnchor={anchor}
        dominantBaseline="middle"
        fontFamily={BODY}
        fontSize={9}
        fill={INK_3}
      >
        {d.name}
      </text>
    );
  });

  return (
    <svg viewBox="0 0 520 300" width="100%" style={{ maxWidth: 520 }}>
      {rings}
      {axes}
      <polygon points={path} fill={BRONZE} fillOpacity={0.18} stroke={BRONZE} strokeWidth={1.5} />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={2.6} fill={BRONZE_DEEP} />
      ))}
      {labels}
    </svg>
  );
}

// ── PAGE 1 — Identity ───────────────────────────────────────────────────
function Page1({ data, pageN, pageTotal }: { data: ReportData; pageN: number; pageTotal: number }) {
  const p = data.profile;
  const name = [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim();
  const role = p?.level
    ? p.firm
      ? `${p.level}  ·  ${p.firm}`
      : p.level
    : "";
  const statement = data.positioning?.statement || data.positioning?.title || "";

  // Profile grid
  const items: { label: string; value: string }[] = [];
  if (p?.core_practice) items.push({ label: "Core Practice", value: p.core_practice });
  if (p?.sector_focus) items.push({ label: "Sector Focus", value: p.sector_focus });
  if (p?.years_experience_raw) items.push({ label: "Experience", value: stripParenTail(p.years_experience_raw) });
  if (p?.linkedin_handle) items.push({ label: "LinkedIn", value: `/in/${p.linkedin_handle.replace(/^\/?in\//, "")}` });

  const goals = p?.north_star_goals ?? [];
  const pillars = data.brand_position?.pillars ?? [];

  return (
    <Sheet>
      <PageHeader subtitle="Strategic Identity Report" />
      <div style={{ marginTop: 18, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 14, color: INK_3, letterSpacing: "0.04em" }}>
          Strategic Identity Report
        </div>
        <div style={{ fontFamily: BODY, fontSize: 11, color: INK_4 }}>{todayLabel(data.generated_at)}</div>
      </div>

      <h1 style={{ fontFamily: DISPLAY, fontSize: 44, fontWeight: 500, margin: "20px 0 6px", letterSpacing: "0.005em" }}>
        {name || "Your Strategic Identity"}
      </h1>
      {role ? (
        <div style={{ fontFamily: BODY, fontSize: 13, color: INK_3, letterSpacing: "0.04em" }}>{role}</div>
      ) : null}
      {statement ? (
        <div
          style={{
            fontFamily: DISPLAY,
            fontStyle: "italic",
            fontSize: 19,
            color: INK_2,
            margin: "22px 0 6px",
            lineHeight: 1.4,
            borderLeft: `2px solid ${BRONZE}`,
            paddingLeft: 14,
          }}
        >
          “{statement}”
        </div>
      ) : null}

      {/* SCORE */}
      {data.score ? (
        <div style={{ marginTop: 28, padding: 18, border: `1px solid ${RULE}`, borderTop: `2px solid ${BRONZE}` }}>
          <SectionLabel>Digital Presence Score</SectionLabel>
          <div style={{ display: "flex", alignItems: "stretch", gap: 32, marginTop: 16 }}>
            {/* LEFT: number + tier */}
            <div
              style={{
                flex: "none",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                borderRight: `1px solid ${RULE}`,
                paddingRight: 32,
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontFamily: DISPLAY, fontSize: 58, fontWeight: 500, color: INK, lineHeight: 1 }}>
                  {data.score.score}
                </span>
                <span style={{ fontFamily: DISPLAY, fontSize: 20, color: INK_4 }}>/100</span>
              </div>
              {data.score.tier ? (
                <div
                  style={{
                    fontFamily: BODY,
                    fontSize: 11,
                    color: BRONZE_DEEP,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    marginTop: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Diamond size={7} /> {titleCase(data.score.tier)} Tier
                </div>
              ) : null}
            </div>
            {/* RIGHT: stacked component bars */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 12 }}>
              {[
                { label: "Signal", weight: 40, v: data.score.components.signal },
                { label: "Content", weight: 40, v: data.score.components.content },
                { label: "Capture", weight: 20, v: data.score.components.capture },
              ].map((b) => (
                <div
                  key={b.label}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "110px 1fr 30px",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <div style={{ fontSize: 11, color: INK_2, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    {b.label}
                    <span style={{ color: INK_4, marginLeft: 6 }}>{b.weight}%</span>
                  </div>
                  <div style={{ height: 7, background: RULE, borderRadius: 4, position: "relative", overflow: "hidden" }}>
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: `${Math.max(0, Math.min(100, b.v))}%`,
                        background: `linear-gradient(90deg, ${BRONZE}, ${BRONZE_DEEP})`,
                        borderRadius: 4,
                      }}
                    />
                  </div>
                  <div
                    style={{
                      fontFamily: DISPLAY,
                      fontSize: 14,
                      color: BRONZE_DEEP,
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {Math.round(b.v)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* PROFILE GRID */}
      {items.length > 0 ? (
        <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 32px" }}>
          {items.map((it) => (
            <div key={it.label}>
              <div style={{ fontSize: 10, color: BRONZE_DEEP, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 2 }}>
                {it.label}
              </div>
              <div style={{ fontSize: 13, color: INK }}>{it.value}</div>
            </div>
          ))}
        </div>
      ) : null}

      {/* NORTH STAR + PILLARS row */}
      {(goals.length > 0 || pillars.length > 0) ? (
        <div style={{ marginTop: 26, display: "grid", gridTemplateColumns: goals.length && pillars.length ? "1.2fr 1fr" : "1fr", gap: 24 }}>
          {goals.length > 0 ? (
            <div>
              <SectionLabel>North Star</SectionLabel>
              <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {goals.map((g, i) => (
                  <li key={i} style={{ display: "flex", gap: 10, padding: "6px 0", borderBottom: `1px solid ${RULE}`, fontSize: 13 }}>
                    <span style={{ fontFamily: DISPLAY, fontSize: 14, color: BRONZE_DEEP, minWidth: 22 }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span style={{ color: INK }}>{g}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          {pillars.length > 0 ? (
            <div>
              <SectionLabel>Brand Pillars</SectionLabel>
              <div>{pillars.map((p2) => <Chip key={p2}>{p2}</Chip>)}</div>
            </div>
          ) : null}
        </div>
      ) : null}

      <PageFooter n={pageN} total={pageTotal} />
    </Sheet>
  );
}

// ── PAGE 2 — Capability & Intelligence ──────────────────────────────────
function Page2({ data, pageN, pageTotal }: { data: ReportData; pageN: number; pageTotal: number }) {
  const name = [data.profile?.first_name, data.profile?.last_name].filter(Boolean).join(" ").trim();
  const intel = data.profile_intelligence;
  return (
    <Sheet>
      <PageHeader subtitle="Capability & Intelligence" />
      <div style={{ marginTop: 20, marginBottom: 18 }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 28, fontWeight: 500 }}>Capability & Intelligence</div>
        {name ? <div style={{ fontSize: 12, color: INK_4, letterSpacing: "0.06em", marginTop: 4 }}>{name}</div> : null}
      </div>

      {data.capabilities ? (
        <div>
          <SectionLabel>Capability Radar</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 24, alignItems: "center" }}>
            {(() => {
              const assessed = data.capabilities.filter((c) => (c.score ?? 0) > 0);
              return (
                <>
                  {assessed.length >= 3 ? (
                    <CapabilityRadar data={assessed} />
                  ) : (
                    <div />
                  )}
                  <div>
                    {assessed.map((c) => (
                      <div key={c.name} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${RULE}`, fontSize: 12 }}>
                        <span style={{ color: INK_2 }}>{c.name}</span>
                        <span style={{ fontFamily: DISPLAY, fontSize: 14, color: BRONZE_DEEP, fontWeight: 600 }}>{c.score}</span>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      ) : null}

      {intel ? (
        <div style={{ marginTop: 28 }}>
          <SectionLabel>Profile Intelligence</SectionLabel>
          {intel.identity_summary ? (
            <div
              style={{
                fontFamily: DISPLAY,
                fontStyle: "italic",
                fontSize: 17,
                color: INK_2,
                lineHeight: 1.45,
                borderLeft: `2px solid ${BRONZE}`,
                paddingLeft: 14,
                marginBottom: 14,
              }}
            >
              {intel.identity_summary}
            </div>
          ) : null}
          {intel.authority_themes.length > 0 ? (
            <div style={{ display: "grid", gap: 10 }}>
              {intel.authority_themes.map((t, i) => (
                <div key={i} style={{ padding: "10px 12px", border: `1px solid ${RULE}`, borderLeft: `2px solid ${BRONZE}` }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: INK, marginBottom: 2 }}>{t.theme}</div>
                  <div style={{ fontSize: 12, color: INK_3, lineHeight: 1.5 }}>{t.rationale}</div>
                </div>
              ))}
            </div>
          ) : intel.expertise_areas.length > 0 ? (
            <div>{intel.expertise_areas.map((e) => <Chip key={e}>{e}</Chip>)}</div>
          ) : null}
        </div>
      ) : null}

      <PageFooter n={pageN} total={pageTotal} />
    </Sheet>
  );
}

// ── PAGE 3 — Market Position ────────────────────────────────────────────
function Page3({ data, pageN, pageTotal }: { data: ReportData; pageN: number; pageTotal: number }) {
  const name = [data.profile?.first_name, data.profile?.last_name].filter(Boolean).join(" ").trim();
  return (
    <Sheet>
      <PageHeader subtitle="Market Position" />
      <div style={{ marginTop: 20, marginBottom: 18 }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 28, fontWeight: 500 }}>Market Position</div>
        {name ? <div style={{ fontSize: 12, color: INK_4, letterSpacing: "0.06em", marginTop: 4 }}>{name}</div> : null}
      </div>

      {data.market_mirror ? (
        <div>
          <SectionLabel>How the Market Reads You</SectionLabel>
          <div style={{ display: "grid", gap: 14 }}>
            {data.market_mirror.perspectives.map((p, i) => (
              <div key={i} style={{ padding: "14px 16px", border: `1px solid ${RULE}`, borderTop: `2px solid ${BRONZE}` }}>
                <div style={{ fontSize: 11, color: BRONZE_DEEP, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 6 }}>
                  The {p.who}
                </div>
                {p.sees ? (
                  <div style={{ fontSize: 12.5, color: INK_2, lineHeight: 1.55, marginBottom: p.gap ? 8 : 0 }}>{p.sees}</div>
                ) : null}
                {p.gap ? (
                  <div style={{ fontSize: 12, color: INK_3, lineHeight: 1.5, paddingLeft: 12, borderLeft: `1px solid ${BRONZE}` }}>
                    <span style={{ color: BRONZE_DEEP, fontWeight: 600 }}>Would notice: </span>
                    {p.gap}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <PageFooter n={pageN} total={pageTotal} />
    </Sheet>
  );
}

// ── PAGE 4 — Strategic Footprint ────────────────────────────────────────
function Page4({ data, pageN, pageTotal }: { data: ReportData; pageN: number; pageTotal: number }) {
  const name = [data.profile?.first_name, data.profile?.last_name].filter(Boolean).join(" ").trim();
  const showContent = !!data.content;
  const showVoice = !!data.voice;
  const showDuo = showContent || showVoice;

  return (
    <Sheet>
      <PageHeader subtitle="Strategic Footprint" />
      <div style={{ marginTop: 20, marginBottom: 18 }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 28, fontWeight: 500 }}>Strategic Footprint</div>
        {name ? <div style={{ fontSize: 12, color: INK_4, letterSpacing: "0.06em", marginTop: 4 }}>{name}</div> : null}
      </div>

      {data.territories ? (
        <div style={{ marginBottom: 24 }}>
          <SectionLabel>Strategic Territories</SectionLabel>
          <div>{data.territories.map((t) => <Chip key={t}>{formatSkillLabel(t)}</Chip>)}</div>
        </div>
      ) : null}

      {data.footprint ? (
        <div style={{ marginBottom: 28 }}>
          <SectionLabel>Intelligence Footprint</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {[
              { n: data.footprint.sources, l: "Sources\nCaptured" },
              { n: data.footprint.evidence, l: "Pieces of\nEvidence" },
              { n: data.footprint.signals, l: "Strategic\nSignals" },
              { n: data.footprint.themes, l: "Themes\nOwned" },
            ].map((s, i) => (
              <div key={i} style={{ padding: "14px 12px", border: `1px solid ${RULE}`, borderTop: `2px solid ${BRONZE}`, textAlign: "center" }}>
                <div style={{ fontFamily: DISPLAY, fontSize: 32, fontWeight: 500, color: INK, lineHeight: 1 }}>{s.n}</div>
                <div style={{ marginTop: 12, fontSize: 10, color: INK_3, letterSpacing: "0.1em", textTransform: "uppercase", whiteSpace: "pre-line" }}>
                  {s.l}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {showDuo ? (
        <div style={{ display: "grid", gridTemplateColumns: showContent && showVoice ? "1fr 1fr" : "1fr", gap: 16 }}>
          {showContent ? (
            <div style={{ padding: "14px 16px", border: `1px solid ${RULE}`, borderTop: `2px solid ${BRONZE}` }}>
              <SectionLabel>Content Engine</SectionLabel>
              <Row label="Posts published" value={String(data.content!.publishedCount)} />
              {data.content!.frameworks[0] ? (
                <Row label="Lead framework" value={data.content!.frameworks[0].framework_type} />
              ) : null}
              {data.content!.frameworks.length > 1 ? (
                <Row
                  label="Also using"
                  value={data.content!.frameworks.slice(1, 4).map((f) => f.framework_type).join(" · ")}
                />
              ) : null}
              <Row label="Tracked posts" value={String(data.content!.trackedCount)} />
            </div>
          ) : null}
          {showVoice ? (
            <div style={{ padding: "14px 16px", border: `1px solid ${RULE}`, borderTop: `2px solid ${BRONZE}` }}>
              <SectionLabel>Voice Signature</SectionLabel>
              {data.voice!.tone ? <Row label="Tone" value={data.voice!.tone} /> : null}
              {data.voice!.preferred_structures.length > 0 ? (
                <Row label="Structure" value={shortSnippet(data.voice!.preferred_structures.join(" · "))} />
              ) : null}
              {data.voice!.storytelling_patterns.length > 0 ? (
                <Row label="Patterns" value={shortSnippet(data.voice!.storytelling_patterns.join(" · "))} />
              ) : null}
              {data.voice!.vocabulary_preferences.prefer && data.voice!.vocabulary_preferences.prefer.length > 0 ? (
                <Row label="Prefers" value={data.voice!.vocabulary_preferences.prefer.join(", ")} />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <PageFooter n={pageN} total={pageTotal} />
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${RULE}`, fontSize: 12 }}>
      <span style={{ color: INK_3, letterSpacing: "0.04em" }}>{label}</span>
      <span style={{ color: INK, fontWeight: 500, textAlign: "right", maxWidth: "60%" }} dir="auto">{value}</span>
    </div>
  );
}

// ── Page-presence gating ────────────────────────────────────────────────
function hasPage1(d: ReportData): boolean {
  if (!d.profile) return false;
  const name = [d.profile.first_name, d.profile.last_name].filter(Boolean).join(" ").trim();
  return Boolean(name || d.score || d.positioning || d.brand_position?.pillars.length);
}
function hasPage2(d: ReportData): boolean {
  return Boolean(d.capabilities || d.profile_intelligence);
}
function hasPage3(d: ReportData): boolean {
  // Page 3 is the Market Mirror page only. Brand statement lives on page 1.
  // Mirror is omitted entirely if stale (cached set !== current rank).
  return (
    !!d.market_mirror &&
    d.market_mirror.persona_set === rankFromLevel(d.profile?.level)
  );
}
function hasPage4(d: ReportData): boolean {
  return Boolean(d.territories || d.footprint || d.content || d.voice);
}

// ── Root ────────────────────────────────────────────────────────────────
export default function ReportDocument({ data }: { data: ReportData }) {
  // Pre-strip stale market mirror so Page3 doesn't render persona-mismatched cards.
  const safeData: ReportData = (() => {
    if (!data.market_mirror) return data;
    const wanted = rankFromLevel(data.profile?.level);
    if (data.market_mirror.persona_set !== wanted) {
      return { ...data, market_mirror: null };
    }
    return data;
  })();

  const pages: Array<(n: number, total: number) => React.ReactNode> = [];
  if (hasPage1(safeData)) pages.push((n, t) => <Page1 key="p1" data={safeData} pageN={n} pageTotal={t} />);
  if (hasPage2(safeData)) pages.push((n, t) => <Page2 key="p2" data={safeData} pageN={n} pageTotal={t} />);
  if (hasPage3(safeData)) pages.push((n, t) => <Page3 key="p3" data={safeData} pageN={n} pageTotal={t} />);
  if (hasPage4(safeData)) pages.push((n, t) => <Page4 key="p4" data={safeData} pageN={n} pageTotal={t} />);

  const total = pages.length;
  return (
    <div style={{ background: "#f5f3ee", padding: "24px 0" }}>
      {pages.map((render, i) => render(i + 1, total))}
    </div>
  );
}