/**
 * The name and handle that appear on every slide, editable where they are
 * seen. A member should never have to leave the studio to fix how their own
 * name is spelled.
 *
 * The name saves to `diagnostic_profiles.display_name_override`, which wins
 * over LinkedIn and over onboarding everywhere in the product.
 */
import React, { useState } from "react";
import { Check, Pencil } from "lucide-react";
import type { DeckIR } from "../deckIR";
import { saveDisplayNameOverride, saveHandle, bareHandle } from "@/lib/identity";
import { supabase } from "@/integrations/supabase/client";

const mono: React.CSSProperties = {
  fontFamily: "var(--ff-mono)", fontSize: 10, letterSpacing: ".09em",
  textTransform: "uppercase", color: "var(--text-muted)",
};

const input: React.CSSProperties = {
  background: "var(--surface-card)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
  padding: "6px 9px",
  fontFamily: "var(--ff-ui)",
  fontSize: 14,
  color: "var(--text-primary)",
  width: "100%",
};

export function IdentityBlock({ deck, onChange }: { deck: DeckIR; onChange: (next: DeckIR) => void }) {
  const profile: any = (deck as any).profile ?? {};
  const currentName = String(profile?.name?.runs?.[0]?.t ?? "");
  const currentHandle = String(profile?.handle ?? "");

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(currentName);
  const [handle, setHandle] = useState(currentHandle);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyToDeck = (nextName: string, nextHandle: string) => {
    onChange({
      ...(deck as any),
      profile: {
        ...profile,
        name: { runs: [{ t: nextName, lang: /[\u0600-\u06FF]/.test(nextName) ? "ar" : "en" }] },
        handle: nextHandle,
      },
    } as DeckIR);
  };

  const save = async () => {
    const nextName = name.trim() || currentName;
    const nextHandle = bareHandle(handle) ?? currentHandle;
    setSaving(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in again to save your name.");
      await saveDisplayNameOverride(user.id, nextName);
      if (nextHandle && nextHandle !== currentHandle) await saveHandle(user.id, nextHandle);
      applyToDeck(nextName, nextHandle);
      setSaved(true);
      setEditing(false);
      window.setTimeout(() => setSaved(false), 1800);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div style={{ display: "grid", gap: 5 }}>
        <span style={mono}>On every slide</span>
        <button
          type="button"
          onClick={() => { setName(currentName); setHandle(currentHandle); setEditing(true); }}
          style={{
            display: "flex", alignItems: "center", gap: 8, background: "none",
            border: "none", padding: 0, cursor: "pointer", textAlign: "start",
            color: "var(--text-primary)", fontFamily: "var(--ff-ui)", fontSize: 14,
          }}
        >
          <span>{currentName}</span>
          <span style={{ color: "var(--text-muted)", fontSize: 13 }}>@{currentHandle}</span>
          {saved ? <Check size={12} color="var(--brand)" /> : <Pencil size={11} color="var(--text-muted)" />}
        </button>
        <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
          Click to correct how your name appears.
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <span style={mono}>On every slide</span>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        aria-label="Your name"
        autoFocus
        style={input}
      />
      <input
        value={handle}
        onChange={(e) => setHandle(e.target.value)}
        placeholder="linkedin handle"
        aria-label="Your LinkedIn handle"
        style={input}
      />
      {error && <span style={{ fontSize: 12, color: "var(--error)" }}>{error}</span>}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          style={{
            ...mono, border: "1px solid var(--brand)", background: "var(--brand)",
            color: "var(--text-inverse)", borderRadius: 999, padding: "6px 14px", cursor: "pointer",
          }}
        >
          {saving ? "Saving" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => { setEditing(false); setError(null); }}
          style={{
            ...mono, border: "1px solid var(--border-default)", background: "transparent",
            color: "var(--text-muted)", borderRadius: 999, padding: "6px 14px", cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default IdentityBlock;