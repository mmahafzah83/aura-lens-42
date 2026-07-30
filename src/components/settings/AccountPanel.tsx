import { useEffect, useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { AuraCard } from "@/components/ui/AuraCard";
import { AuraButton } from "@/components/ui/AuraButton";
import SetPasswordModal from "@/components/SetPasswordModal";

interface Props {
  userId: string | null;
  email?: string;
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--ink-4)",
  fontWeight: 600,
  marginBlockEnd: 6,
  display: "block",
};

const inputStyle: React.CSSProperties = {
  inlineSize: "100%",
  paddingBlock: 10,
  paddingInline: 12,
  fontSize: 14,
  background: "var(--paper-2)",
  border: "0.5px solid var(--rule)",
  borderRadius: 8,
  color: "var(--ink)",
  outline: "none",
  fontFamily: "var(--font-body)",
};

export default function AccountPanel({ userId, email }: Props) {
  const [firstName, setFirstName] = useState("");
  const [initialName, setInitialName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase.from("diagnostic_profiles" as any) as any)
        .select("first_name, avatar_url")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      const p = (data as any) || {};
      setFirstName(p.first_name || "");
      setInitialName(p.first_name || "");
      setAvatarUrl(p.avatar_url || null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${userId}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      await (supabase.from("diagnostic_profiles" as any) as any)
        .update({ avatar_url: publicUrl }).eq("user_id", userId);
      setAvatarUrl(publicUrl);
      toast.success("Photo updated");
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleSaveName = async () => {
    if (!userId || saving) return;
    setSaving(true);
    const { error } = await (supabase.from("diagnostic_profiles" as any) as any)
      .update({ first_name: firstName.trim() || null })
      .eq("user_id", userId);
    setSaving(false);
    if (error) { toast.error("Could not save your name"); return; }
    setInitialName(firstName.trim());
    toast.success("Name updated");
  };

  return (
    <>
      <SectionHeader label="Account" subtitle="Your photo, name, and how you sign in." />
      <div className="mb-8">
        <AuraCard variant="default" hover="none">
          {loading ? (
            <div style={{ fontSize: 13, color: "var(--ink-4)" }}>Loading…</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {/* Photo */}
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  aria-label="Change profile photo"
                  style={{
                    position: "relative", inlineSize: 64, blockSize: 64, borderRadius: "50%",
                    border: "1px solid var(--rule)", background: "var(--paper-2)",
                    overflow: "hidden", padding: 0, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" style={{ inlineSize: "100%", blockSize: "100%", objectFit: "cover" }} />
                  ) : uploading ? (
                    <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--ink-4)" }} />
                  ) : (
                    <Camera className="w-4 h-4" style={{ color: "var(--ink-4)" }} />
                  )}
                </button>
                <div>
                  <div style={{ fontSize: 14, color: "var(--ink)" }}>Profile photo</div>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    style={{
                      marginBlockStart: 4, background: "transparent", border: 0, padding: 0,
                      color: "var(--action)", fontSize: 13, fontWeight: 500, cursor: "pointer",
                    }}
                  >
                    {uploading ? "Uploading…" : avatarUrl ? "Change photo" : "Upload photo"}
                  </button>
                </div>
                <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
              </div>

              {/* Name */}
              <div>
                <label style={labelStyle}>First name</label>
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  style={inputStyle}
                  placeholder="Your first name"
                />
              </div>

              {/* Email */}
              <div>
                <label style={labelStyle}>Email</label>
                <input value={email || ""} readOnly style={{ ...inputStyle, color: "var(--ink-3)" }} />
                <p style={{ fontSize: 12, color: "var(--ink-4)", marginBlockStart: 6 }}>
                  This comes from the account you sign in with and can't be changed here.
                </p>
              </div>

              {/* Password */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 14, color: "var(--ink)" }}>Password</div>
                  <div style={{ fontSize: 12, color: "var(--ink-4)", marginBlockStart: 2 }}>
                    Set or change the password you use to sign in.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPasswordOpen(true)}
                  style={{
                    background: "transparent", border: "0.5px solid var(--rule)", borderRadius: 8,
                    paddingBlock: 8, paddingInline: 14, fontSize: 13, fontWeight: 500,
                    color: "var(--ink)", cursor: "pointer",
                  }}
                >
                  Change password
                </button>
              </div>

              <div>
                <AuraButton
                  variant="primary"
                  size="sm"
                  onClick={handleSaveName}
                  disabled={saving || firstName.trim() === initialName}
                >
                  {saving ? "Saving…" : "Save changes"}
                </AuraButton>
              </div>
            </div>
          )}
        </AuraCard>
      </div>
      <SetPasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </>
  );
}
