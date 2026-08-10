import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Plus, X } from "lucide-react";

/**
 * PLATFORM RULES — the three things that used to be compiled into the code:
 * the banned vocabulary, the model, and who is an admin.
 *
 * Not editable here, and deliberately so (Law #52): the presence health
 * arithmetic and the craft instructions in the writing prompts. Those are
 * judgement, not configuration.
 */

const PANEL: React.CSSProperties = {
  padding: 20,
  borderRadius: 12,
  background: "var(--ob-panel, #0e0f14)",
  border: "0.5px solid var(--hair, rgba(255,255,255,0.08))",
};
const TITLE: React.CSSProperties = { fontSize: 18, fontWeight: 600, margin: 0, color: "var(--glass, #eaeaf0)" };
const SUB: React.CSSProperties = { fontSize: 12, color: "var(--glass-2, #8a8a95)", margin: "4px 0 0" };
const LABEL: React.CSSProperties = { fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--glass-2, #8a8a95)" };
const MONO = "'IBM Plex Mono', ui-monospace, monospace";
const CHIP: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "4px 8px", borderRadius: 4, fontSize: 12,
  background: "rgba(255,255,255,0.05)",
  border: "0.5px solid var(--hair, rgba(255,255,255,0.08))",
  color: "var(--glass, #eaeaf0)",
};
const INPUT: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "0.5px solid var(--hair, rgba(255,255,255,0.12))",
  borderRadius: 8, padding: "8px 10px", fontSize: 13,
  color: "var(--glass, #eaeaf0)", outline: "none", minWidth: 0,
};
const BTN: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 500,
  background: "#0670C4", color: "#FFFFFF", border: "none", cursor: "pointer",
};
const BTN_QUIET: React.CSSProperties = {
  ...BTN, background: "transparent", color: "var(--glass, #eaeaf0)",
  border: "0.5px solid var(--hair, rgba(255,255,255,0.16))",
};

type AdminRow = { user_id: string; name: string | null };

export default function PlatformRulesPanel() {
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [words, setWords] = useState<string[]>([]);
  const [newWord, setNewWord] = useState("");
  const [savingWords, setSavingWords] = useState(false);

  const [model, setModel] = useState("");
  const [modelDraft, setModelDraft] = useState("");
  const [savingModel, setSavingModel] = useState(false);

  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [newAdminId, setNewAdminId] = useState("");
  const [savingAdmin, setSavingAdmin] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [settings, roles] = await Promise.all([
        supabase.from("admin_settings").select("key, value").in("key", ["banned_words", "ai_model"]),
        supabase.from("user_roles").select("user_id, created_at").eq("role", "admin").order("created_at", { ascending: true }),
      ]);
      if (settings.error) throw new Error(settings.error.message);
      if (roles.error) throw new Error(roles.error.message);

      const banned = settings.data?.find((r) => r.key === "banned_words")?.value;
      setWords(Array.isArray(banned) ? (banned as string[]) : []);
      const m = settings.data?.find((r) => r.key === "ai_model")?.value;
      const modelName = typeof m === "string" ? m : "";
      setModel(modelName);
      setModelDraft(modelName);

      const ids = (roles.data ?? []).map((r) => r.user_id);
      let names: Record<string, string> = {};
      if (ids.length) {
        const { data: profiles } = await supabase
          .from("diagnostic_profiles")
          .select("user_id, first_name, last_name")
          .in("user_id", ids);
        for (const p of profiles ?? []) {
          const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
          if (full) names[p.user_id] = full;
        }
      }
      setAdmins(ids.map((id) => ({ user_id: id, name: names[id] ?? null })));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const saveWords = async (next: string[]) => {
    setSavingWords(true);
    setError(null);
    setNote(null);
    const { error: err } = await supabase
      .from("admin_settings")
      .upsert({ key: "banned_words", value: next, updated_at: new Date().toISOString() }, { onConflict: "key" });
    setSavingWords(false);
    if (err) { setError(err.message); return; }
    setWords(next);
    setNote("Banned words saved. Every generator reads this list on its next run.");
  };

  const addWord = () => {
    const w = newWord.trim();
    if (!w) return;
    if (words.some((x) => x.toLowerCase() === w.toLowerCase())) { setNewWord(""); return; }
    setNewWord("");
    void saveWords([...words, w]);
  };

  const saveModel = async () => {
    const m = modelDraft.trim();
    if (!m) { setError("A model name is required."); return; }
    setSavingModel(true);
    setError(null);
    setNote(null);
    const { error: err } = await supabase
      .from("admin_settings")
      .upsert({ key: "ai_model", value: m, updated_at: new Date().toISOString() }, { onConflict: "key" });
    setSavingModel(false);
    if (err) { setError(err.message); return; }
    setModel(m);
    setNote("Model saved.");
  };

  const addAdmin = async () => {
    const id = newAdminId.trim();
    if (!id) return;
    setSavingAdmin(true);
    setError(null);
    setNote(null);
    const { error: err } = await supabase.from("user_roles").insert({ user_id: id, role: "admin" });
    setSavingAdmin(false);
    if (err) { setError(err.message); return; }
    setNewAdminId("");
    setNote("Admin added.");
    void load();
  };

  const removeAdmin = async (userId: string) => {
    // The platform must never be left without an admin.
    if (admins.length <= 1) {
      setError("This is the last admin. Add another one before removing this one.");
      return;
    }
    setSavingAdmin(true);
    setError(null);
    setNote(null);
    const { error: err } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "admin");
    setSavingAdmin(false);
    if (err) { setError(err.message); return; }
    setNote("Admin removed.");
    void load();
  };

  return (
    <section style={PANEL}>
      <div className="mb-4">
        <h2 style={TITLE}>Platform rules</h2>
        <p style={SUB}>
          The vocabulary, the model and the admin list are data, not code. Change them here and every function
          picks the change up on its next run.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2" style={{ color: "var(--glass-2, #8a8a95)", fontSize: 13 }}>
          <Loader2 className="h-4 w-4 animate-spin" /> Reading the rules…
        </div>
      ) : (
        <div className="space-y-6">
          {/* Banned words */}
          <div>
            <div style={LABEL}>Banned words</div>
            <p style={{ ...SUB, marginBottom: 10 }}>
              Words no generator may put in member-facing copy. A word inside a proper name — Saudi Water Authority —
              still passes.
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {words.length === 0 && (
                <span style={{ ...SUB, margin: 0 }}>No words yet — generators fall back to the built-in list.</span>
              )}
              {words.map((w) => (
                <span key={w} style={CHIP}>
                  {w}
                  <button
                    type="button"
                    aria-label={`Remove ${w}`}
                    disabled={savingWords}
                    onClick={() => void saveWords(words.filter((x) => x !== w))}
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--glass-2, #8a8a95)", lineHeight: 0 }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={newWord}
                onChange={(e) => setNewWord(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addWord(); } }}
                placeholder="Add a word or phrase"
                style={{ ...INPUT, flex: 1 }}
              />
              <button type="button" onClick={addWord} disabled={savingWords || !newWord.trim()} style={BTN_QUIET}>
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>
          </div>

          {/* Model */}
          <div>
            <div style={LABEL}>Writing model</div>
            <p style={{ ...SUB, marginBottom: 10 }}>
              The gateway model the drafting functions call. Current: <span style={{ fontFamily: MONO }}>{model || "not set"}</span>
            </p>
            <div className="flex gap-2">
              <input
                value={modelDraft}
                onChange={(e) => setModelDraft(e.target.value)}
                placeholder="google/gemini-3-flash-preview"
                style={{ ...INPUT, flex: 1, fontFamily: MONO }}
              />
              <button type="button" onClick={() => void saveModel()} disabled={savingModel || modelDraft.trim() === model} style={BTN}>
                {savingModel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Save
              </button>
            </div>
          </div>

          {/* Admins */}
          <div>
            <div style={LABEL}>Admins</div>
            <p style={{ ...SUB, marginBottom: 10 }}>
              Everyone who can see this screen. The last admin cannot be removed.
            </p>
            <div className="space-y-2 mb-3">
              {admins.map((a) => (
                <div
                  key={a.user_id}
                  className="flex items-center justify-between gap-3 p-2 rounded-md"
                  style={{ background: "rgba(255,255,255,0.03)", border: "0.5px solid var(--hair, rgba(255,255,255,0.08))" }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: "var(--glass, #eaeaf0)" }}>{a.name ?? "Unnamed member"}</div>
                    <div style={{ fontSize: 11, fontFamily: MONO, color: "var(--glass-2, #8a8a95)", overflowWrap: "anywhere" }}>
                      {a.user_id}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={savingAdmin || admins.length <= 1}
                    onClick={() => void removeAdmin(a.user_id)}
                    style={{ ...BTN_QUIET, opacity: admins.length <= 1 ? 0.4 : 1 }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={newAdminId}
                onChange={(e) => setNewAdminId(e.target.value)}
                placeholder="User id of the new admin"
                style={{ ...INPUT, flex: 1, fontFamily: MONO }}
              />
              <button type="button" onClick={() => void addAdmin()} disabled={savingAdmin || !newAdminId.trim()} style={BTN_QUIET}>
                <Plus className="h-3.5 w-3.5" /> Add admin
              </button>
            </div>
          </div>

          {note && <div style={{ fontSize: 12, color: "#12805C" }}>{note}</div>}
          {error && <div style={{ fontSize: 12, color: "#B3261E" }}>{error}</div>}
        </div>
      )}
    </section>
  );
}
