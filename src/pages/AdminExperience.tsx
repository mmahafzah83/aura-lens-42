import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ADMIN_USER_ID = "9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3";

type PageBg = {
  id: string;
  page_key: string;
  theme: string;
  enabled: boolean;
  image_url: string | null;
  opacity: number | null;
  tint_color: string | null;
};

type ThemedBool = { dark: boolean; light: boolean };
type ThemedNum = { dark: number; light: number };
type ThemedStr = { dark: string; light: string };

type Effects = {
  grain_enabled?: ThemedBool | boolean;
  orbs_enabled?: ThemedBool | boolean;
  card_hover_lift?: boolean;
  card_entry_animation?: boolean;
  score_ring_animation?: boolean;
  tab_slider?: boolean;
  pulse_indicators?: boolean;
  page_transitions?: boolean;
  grain_opacity?: ThemedNum;
  orbs_opacity?: ThemedNum;
  [k: string]: unknown;
};

type Sidebar = {
  active_bar_color?: ThemedStr;
  active_bg?: ThemedStr;
  hover_bg?: ThemedStr;
  active_bar_width?: string;
  [k: string]: unknown;
};

type Tokens = {
  effects?: Effects;
  sidebar?: Sidebar;
  [k: string]: unknown;
};

const SectionTitle = ({ title, subtitle }: { title: string; subtitle: string }) => (
  <div className="mb-4">
    <h2
      className="text-2xl mb-1"
      style={{ fontFamily: "Cormorant Garamond, serif", color: "var(--brand)", letterSpacing: "0.02em" }}
    >
      {title}
    </h2>
    <p className="text-sm" style={{ color: "var(--ink-5)" }}>
      {subtitle}
    </p>
  </div>
);

const Card = ({ children }: { children: React.ReactNode }) => (
  <div
    className="rounded-xl p-5"
    style={{
      backgroundColor: "var(--paper-2, var(--surface-ink-raised))",
      border: "1px solid var(--brand-line)",
      boxShadow: "var(--shadow-rest)",
    }}
  >
    {children}
  </div>
);

const AdminExperience = () => {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [bgs, setBgs] = useState<PageBg[]>([]);
  const [tokensRow, setTokensRow] = useState<{ id: string; tokens: Tokens } | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingBg, setSavingBg] = useState<string | null>(null);
  const [savingSidebar, setSavingSidebar] = useState(false);
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Auth gate
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session) return navigate("/auth", { replace: true });
      if (session.user.id !== ADMIN_USER_ID) return navigate("/home", { replace: true });
      setAuthChecked(true);
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  // Load
  useEffect(() => {
    if (!authChecked) return;
    (async () => {
      setLoading(true);
      const [{ data: bgData, error: bgErr }, { data: dsData, error: dsErr }] = await Promise.all([
        supabase.from("page_backgrounds").select("*").order("page_key"),
        supabase.from("design_system").select("id, tokens").eq("scope", "global").eq("is_active", true).maybeSingle(),
      ]);
      if (bgErr) toast.error("Failed to load page backgrounds");
      if (dsErr) toast.error("Failed to load design system");
      setBgs((bgData || []) as PageBg[]);
      if (dsData) setTokensRow({ id: dsData.id, tokens: (dsData.tokens as Tokens) || {} });
      setLoading(false);
    })();
  }, [authChecked]);

  // ─── page_backgrounds helpers ───
  const updateBgLocal = (id: string, patch: Partial<PageBg>) => {
    setBgs((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };
  const saveBg = async (row: PageBg) => {
    setSavingBg(row.id);
    const { error } = await supabase
      .from("page_backgrounds")
      .update({
        enabled: row.enabled,
        image_url: row.image_url || null,
        opacity: row.opacity,
        tint_color: row.tint_color || null,
      })
      .eq("id", row.id);
    setSavingBg(null);
    if (error) toast.error(`Save failed: ${error.message}`);
    else toast.success(`${row.page_key} background saved`);
  };

  // ─── design_system helpers ───
  const tokens = tokensRow?.tokens || {};
  const effects: Effects = (tokens.effects as Effects) || {};
  const sidebar: Sidebar = (tokens.sidebar as Sidebar) || {};

  const persistTokens = async (next: Tokens, label = "Saved") => {
    if (!tokensRow) return;
    const { error } = await supabase
      .from("design_system")
      .update({ tokens: next as never, updated_at: new Date().toISOString() })
      .eq("id", tokensRow.id);
    if (error) toast.error(`Save failed: ${error.message}`);
    else toast.success(label);
  };

  const setEffect = (key: string, value: unknown, label?: string) => {
    if (!tokensRow) return;
    const next: Tokens = {
      ...tokens,
      effects: { ...effects, [key]: value },
    };
    setTokensRow({ id: tokensRow.id, tokens: next });
    persistTokens(next, label || `${key} updated`);
  };

  const setEffectDebounced = (key: string, value: unknown) => {
    if (!tokensRow) return;
    const next: Tokens = { ...tokens, effects: { ...effects, [key]: value } };
    setTokensRow({ id: tokensRow.id, tokens: next });
    if (debounceRef.current[key]) clearTimeout(debounceRef.current[key]);
    debounceRef.current[key] = setTimeout(() => {
      persistTokens(next, `${key} updated`);
    }, 500);
  };

  const setSidebarLocal = (key: string, value: unknown) => {
    if (!tokensRow) return;
    const next: Tokens = { ...tokens, sidebar: { ...sidebar, [key]: value } };
    setTokensRow({ id: tokensRow.id, tokens: next });
  };

  const saveSidebar = async () => {
    if (!tokensRow) return;
    setSavingSidebar(true);
    await persistTokens(tokens, "Sidebar saved");
    setSavingSidebar(false);
  };

  const themedBool = (v: ThemedBool | boolean | undefined): ThemedBool => {
    if (typeof v === "boolean") return { dark: v, light: v };
    return { dark: !!v?.dark, light: !!v?.light };
  };
  const themedNum = (v: ThemedNum | undefined, fallback = 0): ThemedNum => ({
    dark: v?.dark ?? fallback,
    light: v?.light ?? fallback,
  });
  const themedStr = (v: ThemedStr | undefined): ThemedStr => ({
    dark: v?.dark ?? "",
    light: v?.light ?? "",
  });

  // Sidebar slider parse — must be before any early return to keep hook order stable
  const sidebarBarPx = useMemo(() => {
    const w = sidebar.active_bar_width;
    if (typeof w === "string") return parseInt(w.replace("px", ""), 10) || 3;
    if (typeof w === "number") return w;
    return 3;
  }, [sidebar.active_bar_width]);

  if (!authChecked || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--ink)" }}>
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--brand)" }} />
      </div>
    );
  }

  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  return (
    <div
      className="min-h-screen w-full"
      style={{ backgroundColor: "var(--ink)", color: "var(--ink-7)", fontFamily: "DM Sans, Inter, system-ui, sans-serif" }}
    >
      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Breadcrumb */}
        <nav className="text-xs mb-4 flex items-center gap-2" style={{ color: "var(--ink-5)" }}>
          <Link to="/admin" className="inline-flex items-center gap-1 hover:underline" style={{ color: "var(--brand)" }}>
            <ArrowLeft className="w-3 h-3" /> Admin
          </Link>
          <span>›</span>
          <span style={{ color: "var(--ink-7)" }}>Experience Manager</span>
        </nav>

        <h1
          className="text-4xl mb-2"
          style={{ fontFamily: "Cormorant Garamond, serif", color: "var(--ink-7)", letterSpacing: "0.01em" }}
        >
          Experience Manager
        </h1>
        <p className="text-sm mb-10" style={{ color: "var(--ink-5)" }}>
          Visually control Aura's atmosphere — backgrounds, grain, orbs, animations.
        </p>

        {/* ─── SECTION 1: Page Backgrounds ─── */}
        <section className="mb-12">
          <SectionTitle title="Page backgrounds" subtitle="Set hero background images per page" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {bgs.map((bg) => (
              <Card key={bg.id}>
                <div className="flex items-center justify-between mb-4">
                  <h3
                    className="text-lg"
                    style={{ fontFamily: "Cormorant Garamond, serif", color: "var(--ink-7)" }}
                  >
                    {cap(bg.page_key)}
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: "var(--ink-5)" }}>
                      {bg.enabled ? "On" : "Off"}
                    </span>
                    <Switch
                      checked={!!bg.enabled}
                      onCheckedChange={(v) => updateBgLocal(bg.id, { enabled: v })}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <Label className="text-xs" style={{ color: "var(--ink-5)" }}>Image URL</Label>
                    <Input
                      value={bg.image_url || ""}
                      onChange={(e) => updateBgLocal(bg.id, { image_url: e.target.value })}
                      placeholder="https://…"
                      className="mt-1 text-xs h-9"
                      style={{ backgroundColor: "var(--ink)", borderColor: "var(--ink-3)", color: "var(--ink-7)" }}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs" style={{ color: "var(--ink-5)" }}>Opacity</Label>
                      <span className="text-xs tabular-nums" style={{ color: "var(--brand)" }}>
                        {(bg.opacity ?? 0).toFixed(2)}
                      </span>
                    </div>
                    <Slider
                      min={0.01}
                      max={0.2}
                      step={0.01}
                      value={[bg.opacity ?? 0.05]}
                      onValueChange={(v) => updateBgLocal(bg.id, { opacity: v[0] })}
                      className="mt-2"
                    />
                  </div>

                  <div>
                    <Label className="text-xs" style={{ color: "var(--ink-5)" }}>Tint color</Label>
                    <Input
                      value={bg.tint_color || ""}
                      onChange={(e) => updateBgLocal(bg.id, { tint_color: e.target.value })}
                      placeholder="rgba(176,141,58,0.04)"
                      className="mt-1 text-xs h-9"
                      style={{ backgroundColor: "var(--ink)", borderColor: "var(--ink-3)", color: "var(--ink-7)" }}
                    />
                  </div>

                  {/* Preview strip */}
                  <div
                    className="relative w-full overflow-hidden rounded-md"
                    style={{
                      height: 60,
                      border: "1px solid var(--ink-3)",
                      backgroundColor: "var(--ink)",
                    }}
                  >
                    {bg.image_url ? (
                      <div
                        className="absolute inset-0"
                        style={{
                          backgroundImage: `url(${bg.image_url})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                          opacity: bg.opacity ?? 0.05,
                        }}
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-[10px]" style={{ color: "var(--ink-5)" }}>
                        no image
                      </div>
                    )}
                    {bg.tint_color && (
                      <div className="absolute inset-0" style={{ backgroundColor: bg.tint_color }} />
                    )}
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      onClick={() => saveBg(bg)}
                      disabled={savingBg === bg.id}
                      className="text-xs px-4 py-2 rounded-md font-medium disabled:opacity-60"
                      style={{ backgroundColor: "var(--brand)", color: "var(--ink)" }}
                    >
                      {savingBg === bg.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* ─── SECTION 2: Effects toggles ─── */}
        <section className="mb-12">
          <SectionTitle title="Visual effects" subtitle="Toggle atmosphere effects on/off" />
          <Card>
            <div className="space-y-5">
              {/* Themed: grain */}
              <ThemedToggleRow
                label="Grain texture"
                value={themedBool(effects.grain_enabled)}
                onChange={(v) => setEffect("grain_enabled", v, "Grain updated")}
              />
              <ThemedToggleRow
                label="Ambient orbs"
                value={themedBool(effects.orbs_enabled)}
                onChange={(v) => setEffect("orbs_enabled", v, "Orbs updated")}
              />

              <div className="h-px" style={{ backgroundColor: "var(--ink-3)" }} />

              {/* Single booleans */}
              {[
                ["card_hover_lift", "Card hover lift"],
                ["card_entry_animation", "Card entry animation"],
                ["score_ring_animation", "Score ring animation"],
                ["tab_slider", "Tab slider"],
                ["pulse_indicators", "Pulse indicators"],
                ["page_transitions", "Page transitions"],
              ].map(([key, label]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: "var(--ink-7)" }}>{label}</span>
                  <Switch
                    checked={!!effects[key]}
                    onCheckedChange={(v) => setEffect(key, v, `${label} ${v ? "on" : "off"}`)}
                  />
                </div>
              ))}
            </div>
          </Card>
        </section>

        {/* ─── SECTION 3: Effect parameters ─── */}
        <section className="mb-12">
          <SectionTitle title="Effect parameters" subtitle="Fine-tune visual settings" />
          <Card>
            <div className="space-y-6">
              <ParamSlider
                label="Grain opacity (light)"
                min={0} max={0.1} step={0.005}
                value={themedNum(effects.grain_opacity).light}
                onChange={(v) => setEffectDebounced("grain_opacity", { ...themedNum(effects.grain_opacity), light: v })}
              />
              <ParamSlider
                label="Grain opacity (dark)"
                min={0} max={0.1} step={0.005}
                value={themedNum(effects.grain_opacity).dark}
                onChange={(v) => setEffectDebounced("grain_opacity", { ...themedNum(effects.grain_opacity), dark: v })}
              />
              <ParamSlider
                label="Orbs opacity (light)"
                min={0} max={0.1} step={0.005}
                value={themedNum(effects.orbs_opacity).light}
                onChange={(v) => setEffectDebounced("orbs_opacity", { ...themedNum(effects.orbs_opacity), light: v })}
              />
              <ParamSlider
                label="Orbs opacity (dark)"
                min={0} max={0.1} step={0.005}
                value={themedNum(effects.orbs_opacity).dark}
                onChange={(v) => setEffectDebounced("orbs_opacity", { ...themedNum(effects.orbs_opacity), dark: v })}
              />
              <ParamSlider
                label="Sidebar active bar width"
                min={1} max={6} step={1}
                value={sidebarBarPx}
                unit="px"
                onChange={(v) => {
                  const next: Tokens = { ...tokens, sidebar: { ...sidebar, active_bar_width: `${v}px` } };
                  if (!tokensRow) return;
                  setTokensRow({ id: tokensRow.id, tokens: next });
                  if (debounceRef.current["active_bar_width"]) clearTimeout(debounceRef.current["active_bar_width"]);
                  debounceRef.current["active_bar_width"] = setTimeout(() => {
                    persistTokens(next, "Sidebar bar width updated");
                  }, 500);
                }}
              />
            </div>
          </Card>
        </section>

        {/* ─── SECTION 4: Sidebar styling ─── */}
        <section className="mb-16">
          <SectionTitle title="Sidebar" subtitle="Active state and hover colors" />
          <Card>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ColorRow
                label="Active bar color (light)"
                value={themedStr(sidebar.active_bar_color).light}
                onChange={(v) => setSidebarLocal("active_bar_color", { ...themedStr(sidebar.active_bar_color), light: v })}
              />
              <ColorRow
                label="Active bar color (dark)"
                value={themedStr(sidebar.active_bar_color).dark}
                onChange={(v) => setSidebarLocal("active_bar_color", { ...themedStr(sidebar.active_bar_color), dark: v })}
              />
              <ColorRow
                label="Active background (light)"
                value={themedStr(sidebar.active_bg).light}
                onChange={(v) => setSidebarLocal("active_bg", { ...themedStr(sidebar.active_bg), light: v })}
              />
              <ColorRow
                label="Active background (dark)"
                value={themedStr(sidebar.active_bg).dark}
                onChange={(v) => setSidebarLocal("active_bg", { ...themedStr(sidebar.active_bg), dark: v })}
              />
              <ColorRow
                label="Hover background (light)"
                value={themedStr(sidebar.hover_bg).light}
                onChange={(v) => setSidebarLocal("hover_bg", { ...themedStr(sidebar.hover_bg), light: v })}
              />
              <ColorRow
                label="Hover background (dark)"
                value={themedStr(sidebar.hover_bg).dark}
                onChange={(v) => setSidebarLocal("hover_bg", { ...themedStr(sidebar.hover_bg), dark: v })}
              />
            </div>
            <div className="flex justify-end mt-5">
              <button
                onClick={saveSidebar}
                disabled={savingSidebar}
                className="text-xs px-4 py-2 rounded-md font-medium disabled:opacity-60"
                style={{ backgroundColor: "var(--brand)", color: "var(--ink)" }}
              >
                {savingSidebar ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save sidebar"}
              </button>
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
};

const ThemedToggleRow = ({
  label, value, onChange,
}: { label: string; value: ThemedBool; onChange: (v: ThemedBool) => void }) => (
  <div className="flex items-center justify-between">
    <span className="text-sm" style={{ color: "var(--ink-7)" }}>{label}</span>
    <div className="flex items-center gap-5">
      <label className="flex items-center gap-2 text-xs" style={{ color: "var(--ink-5)" }}>
        Light
        <Switch checked={value.light} onCheckedChange={(v) => onChange({ ...value, light: v })} />
      </label>
      <label className="flex items-center gap-2 text-xs" style={{ color: "var(--ink-5)" }}>
        Dark
        <Switch checked={value.dark} onCheckedChange={(v) => onChange({ ...value, dark: v })} />
      </label>
    </div>
  </div>
);

const ParamSlider = ({
  label, min, max, step, value, onChange, unit,
}: { label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void; unit?: string }) => (
  <div>
    <div className="flex items-center justify-between mb-2">
      <Label className="text-xs" style={{ color: "var(--ink-5)" }}>{label}</Label>
      <span className="text-xs tabular-nums" style={{ color: "var(--brand)" }}>
        {unit ? `${value}${unit}` : value.toFixed(3)}
      </span>
    </div>
    <Slider min={min} max={max} step={step} value={[value]} onValueChange={(v) => onChange(v[0])} />
  </div>
);

const ColorRow = ({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) => (
  <div>
    <Label className="text-xs" style={{ color: "var(--ink-5)" }}>{label}</Label>
    <div className="flex items-center gap-2 mt-1">
      <div
        className="w-9 h-9 rounded-md shrink-0"
        style={{ border: "1px solid var(--ink-3)", backgroundColor: value || "transparent" }}
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#B08D3A or rgba(...)"
        className="text-xs h-9"
        style={{ backgroundColor: "var(--ink)", borderColor: "var(--ink-3)", color: "var(--ink-7)" }}
      />
    </div>
  </div>
);

export default AdminExperience;
