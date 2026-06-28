import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AdminShell from "@/components/admin/AdminShell";

const ADMIN_USER_ID = "9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3";

type MissRow = {
  slug: string;
  surface: string;
  count: number;
  last_seen: string;
  first_seen: string;
};

type ArticleRow = {
  slug: string;
  category: string;
  surfaces: string[] | null;
};

const SURFACES = ["tooltip", "faq", "guide", "hint"] as const;

export default function AdminGuideHealth() {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [misses, setMisses] = useState<MissRow[]>([]);
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});

  // Admin gate — matches /admin/qa
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session) { navigate("/auth", { replace: true }); return; }
      if (session.user.id !== ADMIN_USER_ID) { navigate("/home", { replace: true }); return; }
      setAuthChecked(true);
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  useEffect(() => {
    if (!authChecked) return;
    let cancelled = false;
    (async () => {
      try {
        const [m, a] = await Promise.all([
          supabase
            .from("guide_slug_misses")
            .select("slug,surface,count,last_seen,first_seen")
            .order("count", { ascending: false })
            .order("last_seen", { ascending: false }),
          supabase
            .from("guide_articles")
            .select("slug,category,surfaces")
            .order("category", { ascending: true })
            .order("slug", { ascending: true }),
        ]);
        if (cancelled) return;
        if (m.error) throw m.error;
        if (a.error) throw a.error;
        setMisses((m.data || []) as MissRow[]);
        setArticles((a.data || []) as ArticleRow[]);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authChecked]);

  const total = articles.length;

  const byCategory = useMemo(() => {
    const map: Record<string, ArticleRow[]> = {};
    for (const a of articles) {
      const k = a.category || "uncategorized";
      (map[k] = map[k] || []).push(a);
    }
    return map;
  }, [articles]);

  const bySurface = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of SURFACES) counts[s] = 0;
    for (const a of articles) {
      const surfaces = a.surfaces || [];
      for (const s of surfaces) {
        counts[s] = (counts[s] || 0) + 1;
      }
    }
    return counts;
  }, [articles]);

  if (!authChecked) return null;
  const sectionTitle: React.CSSProperties = {
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontSize: 24,
    letterSpacing: "0.02em",
    color: "var(--ink)",
    margin: "32px 0 12px",
  };
  const card: React.CSSProperties = {
    background: "var(--vellum, #FBF8F1)",
    border: "1px solid var(--brand-line)",
    borderRadius: 10,
    padding: "18px 20px",
    boxShadow: "var(--shadow-lift)",
  };
  const cellTh: React.CSSProperties = {
    textAlign: "left",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--ink-3)",
    padding: "8px 10px",
    borderBottom: "1px solid var(--brand-line)",
    fontWeight: 600,
  };
  const cellTd: React.CSSProperties = {
    fontSize: 13,
    color: "var(--ink)",
    padding: "10px",
    borderBottom: "1px solid rgba(176,141,58,0.12)",
  };

  return (
    <AdminShell
      title="Guide health"
      subtitle="Read-only view of corpus coverage and tooltip/hint slug gaps."
    >
        {error && (
          <div style={{ ...card, borderColor: "#dc2626", color: "#dc2626", marginTop: 16 }}>
            {error}
          </div>
        )}

        {/* GAPS */}
        <h2 style={sectionTitle}>Gaps</h2>
        <div style={card}>
          {loading ? (
            <div style={{ color: "var(--ink-3)", fontSize: 13 }}>Loading…</div>
          ) : misses.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--ink-3)", fontSize: 14 }}>
              <span style={{ color: "#16a34a", fontSize: 18 }}>✓</span>
              No gaps — every slug the app requests has a matching article.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={cellTh}>Slug</th>
                  <th style={cellTh}>Surface</th>
                  <th style={{ ...cellTh, textAlign: "right" }}>Count</th>
                  <th style={cellTh}>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {misses.map((m) => (
                  <tr key={`${m.slug}:${m.surface}`}>
                    <td style={{ ...cellTd, fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 12 }}>{m.slug}</td>
                    <td style={cellTd}>{m.surface}</td>
                    <td style={{ ...cellTd, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{m.count}</td>
                    <td style={{ ...cellTd, color: "var(--ink-3)" }}>{new Date(m.last_seen).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* COVERAGE */}
        <h2 style={sectionTitle}>Coverage</h2>
        <div style={card}>
          {loading ? (
            <div style={{ color: "var(--ink-3)", fontSize: 13 }}>Loading…</div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 14 }}>
                <div style={{ fontSize: 32, fontFamily: "'Cormorant Garamond', Georgia, serif", color: "var(--brand)" }}>{total}</div>
                <div style={{ color: "var(--ink-3)", fontSize: 13 }}>total articles</div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                <div>
                  <div style={{ ...cellTh, padding: "0 0 6px", border: "none" }}>By category</div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <tbody>
                      {Object.keys(byCategory).sort().map((cat) => (
                        <tr key={cat}>
                          <td style={cellTd}>{cat}</td>
                          <td style={{ ...cellTd, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{byCategory[cat].length}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <div style={{ ...cellTh, padding: "0 0 6px", border: "none" }}>By surface</div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <tbody>
                      {SURFACES.map((s) => (
                        <tr key={s}>
                          <td style={cellTd}>{s}</td>
                          <td style={{ ...cellTd, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{bySurface[s] ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ALL SLUGS (collapsible) */}
        <h2 style={sectionTitle}>All slugs by category</h2>
        <div style={card}>
          {loading ? (
            <div style={{ color: "var(--ink-3)", fontSize: 13 }}>Loading…</div>
          ) : (
            Object.keys(byCategory).sort().map((cat) => {
              const open = !!openCats[cat];
              return (
                <div key={cat} style={{ borderBottom: "1px solid rgba(176,141,58,0.12)" }}>
                  <button
                    type="button"
                    onClick={() => setOpenCats((s) => ({ ...s, [cat]: !s[cat] }))}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      background: "transparent",
                      border: "none",
                      padding: "10px 4px",
                      cursor: "pointer",
                      color: "var(--ink)",
                      fontSize: 13,
                      fontWeight: 500,
                    }}
                  >
                    <span>{open ? "▾" : "▸"} {cat}</span>
                    <span style={{ color: "var(--ink-3)", fontVariantNumeric: "tabular-nums" }}>{byCategory[cat].length}</span>
                  </button>
                  {open && (
                    <ul style={{ margin: 0, padding: "0 0 10px 22px", listStyle: "disc", color: "var(--ink-3)" }}>
                      {byCategory[cat].map((a) => (
                        <li key={a.slug} style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 12, padding: "2px 0" }}>
                          {a.slug}
                          <span style={{ color: "var(--ink-4)", marginLeft: 8 }}>
                            [{(a.surfaces || []).join(", ") || "—"}]
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })
          )}
        </div>
    </AdminShell>
  );
}