import { useEffect, useMemo, useState, CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, RotateCcw, Eye, Save, Sun, Moon, Check } from "lucide-react";

const ADMIN_USER_ID = "9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3";

type ThemeValue = string | { dark: string; light: string };

interface DesignTokens {
  colors?: Record<string, ThemeValue>;
  typography?: Record<string, string | number>;
  shadows?: Record<string, ThemeValue>;
  radii?: Record<string, string>;
}

interface DesignRow {
  id: string;
  version: number;
  scope: string;
  is_active: boolean;
  created_at: string | null;
  tokens: DesignTokens;
}

type Theme = "dark" | "light";

function isThemed(v: ThemeValue): v is { dark: string; light: string } {
  return !!v && typeof v === "object" && "dark" in v && "light" in v;
}

function resolve(val: ThemeValue, theme: Theme): string {
  return isThemed(val) ? val[theme] : (val as string);
}

function applyTokensToRoot(tokens: DesignTokens, theme: Theme) {
  const root = document.documentElement;
  const { colors = {}, typography = {}, shadows = {}, radii = {} } = tokens;

  Object.entries(colors).forEach(([key, val]) => {
    root.style.setProperty(`--${key.replace(/_/g, "-")}`, resolve(val, theme));
  });

  const brand = colors.brand ? resolve(colors.brand, theme) : null;
  const brandDeep = colors.brand_deep ? resolve(colors.brand_deep, theme) : null;
  const brandSurface = colors.brand_surface ? resolve(colors.brand_surface, theme) : null;
  const brandLine = colors.brand_line ? resolve(colors.brand_line, theme) : null;
  const brandGlow = colors.brand_glow ? resolve(colors.brand_glow, theme) : null;

  if (brand) {
    root.style.setProperty("--brand", brand);
    root.style.setProperty("--bronze", brand);
  }
  if (brandDeep) {
    root.style.setProperty("--brand-hover", brandDeep);
    root.style.setProperty("--bronze-deep", brandDeep);
  }
  if (brandSurface) {
    root.style.setProperty("--brand-pale", brandSurface);
    root.style.setProperty("--bronze-pale", brandSurface);
    root.style.setProperty("--bronze-mist", brandSurface);
  }
  if (brandLine) {
    root.style.setProperty("--brand-muted", brandLine);
    root.style.setProperty("--bronze-line", brandLine);
  }
  if (brandGlow) {
    root.style.setProperty("--bronze-glow", brandGlow);
  }

  if (typography.display) root.style.setProperty("--font-display", String(typography.display));
  if (typography.body) root.style.setProperty("--font-body", String(typography.body));
  if (typography.arabic) root.style.setProperty("--font-arabic", String(typography.arabic));
  if (typography.mono) root.style.setProperty("--font-mono", String(typography.mono));

  Object.entries(shadows).forEach(([key, val]) => {
    root.style.setProperty(`--shadow-${key.replace(/_/g, "-")}`, resolve(val, theme));
  });

  Object.entries(radii).forEach(([key, val]) => {
    root.style.setProperty(`--radius-${key}`, val);
  });
}

const sectionCard: CSSProperties = {
  background: "var(--surface-ink-raised, #1c1c1c)",
  border: "1px solid var(--ink-3, #333)",
  borderRadius: 12,
  padding: 24,
  marginBottom: 24,
};

const labelStyle: CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--ink-5, #888)",
  marginBottom: 12,
  fontWeight: 600,
};

const headingStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: "var(--ink-7, #eee)",
  marginBottom: 18,
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ColorSwatch({ label, value, theme }: { label: string; value: ThemeValue; theme: Theme }) {
  const color = resolve(value, theme);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: color,
          border: "1px solid var(--ink-3, #333)",
          flexShrink: 0,
        }}
      />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "var(--ink-7, #eee)", fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 10, color: "var(--ink-5, #888)", fontFamily: "monospace" }}>{color}</div>
      </div>
    </div>
  );
}

function ColorEditor({
  tokenKey,
  value,
  theme,
  onChange,
}: {
  tokenKey: string;
  value: ThemeValue;
  theme: Theme;
  onChange: (next: ThemeValue) => void;
}) {
  const themed = isThemed(value);
  const current = resolve(value, theme);
  // color picker only supports hex; rgba etc. fallback to text input only
  const isHex = /^#[0-9a-fA-F]{6}$/.test(current);

  const update = (next: string) => {
    if (themed) {
      onChange({ ...(value as { dark: string; light: string }), [theme]: next });
    } else {
      onChange(next);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--ink-3, #2a2a2a)" }}>
      <div style={{ flex: "0 0 160px", fontSize: 12, color: "var(--ink-7, #eee)" }}>{tokenKey}</div>
      {isHex && (
        <input
          type="color"
          value={current}
          onChange={(e) => update(e.target.value)}
          style={{ width: 32, height: 28, border: "none", background: "transparent", cursor: "pointer", padding: 0 }}
        />
      )}
      <input
        type="text"
        value={current}
        onChange={(e) => update(e.target.value)}
        style={{
          flex: 1,
          padding: "6px 10px",
          background: "var(--ink, #0d0d0d)",
          border: "1px solid var(--ink-3, #333)",
          color: "var(--ink-7, #eee)",
          borderRadius: 6,
          fontSize: 12,
          fontFamily: "monospace",
        }}
      />
      <span
        style={{
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: themed ? "var(--brand, #B08D3A)" : "var(--ink-5, #777)",
          minWidth: 50,
          textAlign: "right",
        }}
      >
        {themed ? "themed" : "shared"}
      </span>
    </div>
  );
}

function PreviewCard({ tokens, theme }: { tokens: DesignTokens; theme: Theme }) {
  const c = tokens.colors || {};
  const t = tokens.typography || {};
  const get = (k: string, fallback: string) => (c[k] ? resolve(c[k], theme) : fallback);

  return (
    <div
      style={{
        background: get("paper", "#14110C"),
        color: get("ink", "#F0EAD9"),
        padding: 24,
        borderRadius: 12,
        border: `1px solid ${get("brand_line", "rgba(212,176,86,0.28)")}`,
        fontFamily: String(t.body || "DM Sans") + ", sans-serif",
      }}
    >
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: get("brand", "#B08D3A"), marginBottom: 8, fontWeight: 600 }}>
        Preview · live
      </div>
      <div style={{ fontFamily: String(t.display || "Cormorant Garamond") + ", serif", fontSize: 28, fontWeight: 600, marginBottom: 8 }}>
        Sample Card Heading
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 16, opacity: 0.85 }}>
        This card mirrors how the brand colors and typography would render across the app.
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          style={{
            background: get("brand", "#B08D3A"),
            color: get("paper", "#14110C"),
            border: "none",
            padding: "8px 16px",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Primary action
        </button>
        <button
          style={{
            background: get("signal", "#F97316"),
            color: "#fff",
            border: "none",
            padding: "8px 16px",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Signal
        </button>
        <button
          style={{
            background: "transparent",
            color: get("brand", "#B08D3A"),
            border: `0.5px solid ${get("brand_line", "rgba(212,176,86,0.28)")}`,
            padding: "8px 16px",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Ghost
        </button>
      </div>
    </div>
  );
}

const AdminDesignSystem = () => {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);

  const [rows, setRows] = useState<DesignRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState<DesignTokens | null>(null);
  const [editTheme, setEditTheme] = useState<Theme>("dark");
  const [previewing, setPreviewing] = useState(false);
  const [activating, setActivating] = useState(false);
  const [rollingBack, setRollingBack] = useState<number | null>(null);

  // Auth gate
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session) {
        navigate("/auth", { replace: true });
        return;
      }
      if (session.user.id !== ADMIN_USER_ID) {
        navigate("/home", { replace: true });
        return;
      }
      setAuthChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const fetchVersions = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("design_system")
      .select("id, version, scope, is_active, created_at, tokens")
      .eq("scope", "global")
      .order("version", { ascending: false });
    if (error) {
      console.error("design_system fetch failed:", error);
      toast.error("Failed to load design system versions");
    } else {
      const mapped = (data || []) as DesignRow[];
      setRows(mapped);
      const active = mapped.find((r) => r.is_active);
      if (active && !editing) {
        setEditing(JSON.parse(JSON.stringify(active.tokens)));
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!authChecked) return;
    fetchVersions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked]);

  const active = useMemo(() => rows.find((r) => r.is_active) || null, [rows]);

  // Cleanup: when leaving the page, restore active tokens
  useEffect(() => {
    return () => {
      if (active) applyTokensToRoot(active.tokens, editTheme);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePreview = () => {
    if (!editing) return;
    applyTokensToRoot(editing, editTheme);
    setPreviewing(true);
    toast.success("Preview applied to this page (not saved)");
  };

  const handleResetPreview = () => {
    if (!active) return;
    applyTokensToRoot(active.tokens, editTheme);
    setPreviewing(false);
    toast.message("Reverted to active version");
  };

  const handleActivate = async () => {
    if (!editing) return;
    if (!confirm("Activate this as the new design version? This will deactivate the current one.")) return;
    setActivating(true);
    try {
      const { error } = await supabase.rpc("activate_design_version", {
        p_new_tokens: editing as any,
      });
      if (error) throw error;
      toast.success("New design version activated");
      setPreviewing(false);
      await fetchVersions();
    } catch (e: any) {
      console.error("activate failed:", e);
      toast.error(e?.message || "Failed to activate");
    } finally {
      setActivating(false);
    }
  };

  const handleRollback = async (version: number) => {
    if (!confirm(`Roll back to version ${version}? The current active version will be deactivated.`)) return;
    setRollingBack(version);
    try {
      const { error } = await supabase.rpc("rollback_design_version", {
        p_target_version: version,
      });
      if (error) throw error;
      toast.success(`Rolled back to version ${version}`);
      await fetchVersions();
      // refresh editing draft to the now-active tokens
      const { data } = await supabase
        .from("design_system")
        .select("tokens")
        .eq("scope", "global")
        .eq("is_active", true)
        .maybeSingle();
      if (data?.tokens) setEditing(JSON.parse(JSON.stringify(data.tokens)));
    } catch (e: any) {
      console.error("rollback failed:", e);
      toast.error(e?.message || "Failed to rollback");
    } finally {
      setRollingBack(null);
    }
  };

  const updateColor = (key: string, next: ThemeValue) => {
    setEditing((prev) => {
      if (!prev) return prev;
      return { ...prev, colors: { ...(prev.colors || {}), [key]: next } };
    });
  };

  if (!authChecked || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--ink, #0d0d0d)" }}>
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--brand)" }} />
      </div>
    );
  }

  const activeColors = active?.tokens.colors || {};
  const activeShadows = active?.tokens.shadows || {};
  const activeTypography = active?.tokens.typography || {};
  const editingColors = editing?.colors || {};

  return (
    <div
      className="min-h-screen w-full"
      style={{
        backgroundColor: "var(--ink, #0d0d0d)",
        color: "var(--ink-7, #eee)",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div style={{ marginBottom: 8 }}>
              <AuraLogo size={28} variant="auto" withWordmark />
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--ink-7, #eee)" }}>Design system</h1>
            <p style={{ fontSize: 13, color: "var(--ink-5, #888)", marginTop: 4 }}>
              Edit, preview, and activate brand tokens. Reads from the design_system table.
            </p>
          </div>
          <button
            onClick={() => navigate("/admin")}
            style={{
              fontSize: 12,
              padding: "8px 16px",
              borderRadius: 6,
              border: "0.5px solid var(--ink-3, #333)",
              background: "transparent",
              color: "var(--ink-5, #888)",
              cursor: "pointer",
            }}
          >
            ← Admin home
          </button>
        </div>

        {/* SECTION 1 — Active version */}
        <section style={sectionCard}>
          <div style={labelStyle}>Section 1 · Current active version</div>
          {active ? (
            <>
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--ink-5)" }}>Version</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "var(--brand)" }}>v{active.version}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--ink-5)" }}>Scope</div>
                  <div style={{ fontSize: 14, color: "var(--ink-7)" }}>{active.scope}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--ink-5)" }}>Created</div>
                  <div style={{ fontSize: 14, color: "var(--ink-7)" }}>{formatDate(active.created_at)}</div>
                </div>
              </div>

              <div style={headingStyle}>Colors</div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                  gap: 12,
                  marginBottom: 24,
                }}
              >
                {Object.entries(activeColors).map(([k, v]) => (
                  <ColorSwatch key={k} label={k} value={v} theme={editTheme} />
                ))}
              </div>

              <div style={headingStyle}>Typography</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16, marginBottom: 24 }}>
                {Object.entries(activeTypography).map(([k, v]) => (
                  <div key={k} style={{ padding: 12, border: "1px solid var(--ink-3, #2a2a2a)", borderRadius: 8 }}>
                    <div style={{ fontSize: 11, color: "var(--ink-5)" }}>{k}</div>
                    <div style={{ fontFamily: typeof v === "string" ? `'${v}', sans-serif` : "inherit", fontSize: 18, color: "var(--ink-7)" }}>
                      {String(v)}
                    </div>
                  </div>
                ))}
              </div>

              <div style={headingStyle}>Shadows</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
                {Object.entries(activeShadows).map(([k, v]) => (
                  <div
                    key={k}
                    style={{
                      padding: 16,
                      borderRadius: 8,
                      background: "var(--paper, #14110C)",
                      boxShadow: resolve(v, editTheme),
                      border: "1px solid var(--ink-3, #2a2a2a)",
                    }}
                  >
                    <div style={{ fontSize: 12, color: "var(--ink-7)", fontWeight: 600 }}>{k}</div>
                    <div style={{ fontSize: 10, color: "var(--ink-5)", fontFamily: "monospace", marginTop: 4 }}>
                      {resolve(v, editTheme)}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ color: "var(--ink-5)" }}>No active version found.</div>
          )}
        </section>

        {/* SECTION 2 — Edit */}
        <section style={sectionCard}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <div style={labelStyle}>Section 2 · Edit tokens</div>
            <div style={{ display: "flex", gap: 6, border: "1px solid var(--ink-3)", borderRadius: 6, padding: 2 }}>
              <button
                onClick={() => setEditTheme("dark")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11,
                  padding: "6px 12px",
                  borderRadius: 4,
                  border: "none",
                  background: editTheme === "dark" ? "var(--brand-muted, rgba(212,176,86,0.18))" : "transparent",
                  color: editTheme === "dark" ? "var(--brand)" : "var(--ink-5)",
                  cursor: "pointer",
                }}
              >
                <Moon size={12} /> Dark
              </button>
              <button
                onClick={() => setEditTheme("light")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11,
                  padding: "6px 12px",
                  borderRadius: 4,
                  border: "none",
                  background: editTheme === "light" ? "var(--brand-muted, rgba(212,176,86,0.18))" : "transparent",
                  color: editTheme === "light" ? "var(--brand)" : "var(--ink-5)",
                  cursor: "pointer",
                }}
              >
                <Sun size={12} /> Light
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--ink-5)", marginBottom: 8, fontWeight: 600 }}>
                Colors ({editTheme})
              </div>
              <div style={{ maxHeight: 480, overflowY: "auto", paddingRight: 8 }}>
                {editing &&
                  Object.entries(editingColors).map(([k, v]) => (
                    <ColorEditor
                      key={k}
                      tokenKey={k}
                      value={v}
                      theme={editTheme}
                      onChange={(next) => updateColor(k, next)}
                    />
                  ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--ink-5)", marginBottom: 8, fontWeight: 600 }}>Live preview</div>
              {editing && <PreviewCard tokens={editing} theme={editTheme} />}
              <div style={{ fontSize: 11, color: "var(--ink-5)", marginTop: 12, lineHeight: 1.6 }}>
                The card above always reflects your edits. Use Preview below to apply changes to the entire page
                (still client-side only — nothing is saved until you Activate).
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 24, flexWrap: "wrap" }}>
            {previewing && (
              <button
                onClick={handleResetPreview}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  padding: "8px 16px",
                  borderRadius: 6,
                  border: "0.5px solid var(--ink-3)",
                  background: "transparent",
                  color: "var(--ink-5)",
                  cursor: "pointer",
                }}
              >
                <RotateCcw size={12} /> Revert preview
              </button>
            )}
            <button
              onClick={handlePreview}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                padding: "8px 16px",
                borderRadius: 6,
                border: "0.5px solid var(--brand-line, rgba(212,176,86,0.28))",
                background: "transparent",
                color: "var(--brand)",
                cursor: "pointer",
              }}
            >
              <Eye size={12} /> Preview on page
            </button>
            <button
              onClick={handleActivate}
              disabled={activating}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                padding: "8px 18px",
                borderRadius: 6,
                border: "none",
                background: "var(--brand)",
                color: "var(--paper, #14110C)",
                fontWeight: 600,
                cursor: activating ? "not-allowed" : "pointer",
                opacity: activating ? 0.6 : 1,
              }}
            >
              {activating ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Activate as new version
            </button>
          </div>
        </section>

        {/* SECTION 3 — History */}
        <section style={sectionCard}>
          <div style={labelStyle}>Section 3 · Version history</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ color: "var(--ink-5)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 500 }}>Version</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 500 }}>Created</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 500 }}>Status</th>
                  <th style={{ textAlign: "right", padding: "10px 12px", fontWeight: 500 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    style={{
                      borderTop: "1px solid var(--ink-3, #2a2a2a)",
                      background: r.is_active ? "var(--brand-ghost, rgba(212,176,86,0.06))" : "transparent",
                    }}
                  >
                    <td style={{ padding: "12px", color: r.is_active ? "var(--brand)" : "var(--ink-7)", fontWeight: 600 }}>
                      v{r.version}
                    </td>
                    <td style={{ padding: "12px", color: "var(--ink-5)" }}>{formatDate(r.created_at)}</td>
                    <td style={{ padding: "12px" }}>
                      {r.is_active ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--brand)", fontWeight: 600 }}>
                          <Check size={12} /> Active
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: "var(--ink-5)" }}>Inactive</span>
                      )}
                    </td>
                    <td style={{ padding: "12px", textAlign: "right" }}>
                      {!r.is_active && (
                        <button
                          onClick={() => handleRollback(r.version)}
                          disabled={rollingBack === r.version}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            fontSize: 11,
                            padding: "6px 12px",
                            borderRadius: 6,
                            border: "0.5px solid var(--brand-line, rgba(212,176,86,0.28))",
                            background: "transparent",
                            color: "var(--brand)",
                            cursor: rollingBack === r.version ? "not-allowed" : "pointer",
                            opacity: rollingBack === r.version ? 0.6 : 1,
                          }}
                        >
                          {rollingBack === r.version ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                          Roll back
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
};

export default AdminDesignSystem;