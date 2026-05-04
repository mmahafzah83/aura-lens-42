import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, ThumbsUp, MessageSquare, Repeat2, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const isArabic = (t: string) => /[\u0600-\u06FF]/.test(t || "");

interface Props {
  text: string;
  language?: "en" | "ar";
}

const LinkedInPreview = ({ text, language }: Props) => {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<{ name: string; level: string | null; avatar_url: string | null } | null>(null);

  useEffect(() => {
    if (!open || profile) return;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;
      const { data } = await supabase
        .from("diagnostic_profiles")
        .select("first_name, level, firm, avatar_url")
        .eq("user_id", session.user.id)
        .maybeSingle();
      const fullName = data?.first_name || (session.user.email?.split("@")[0] ?? "You");
      setProfile({
        name: fullName,
        level: [data?.level, data?.firm].filter(Boolean).join(" · ") || null,
        avatar_url: data?.avatar_url || null,
      });
    })();
  }, [open, profile]);

  const rtl = language === "ar" || isArabic(text);
  const lines = (text || "").split("\n").filter(Boolean);
  const preview = lines.slice(0, 5).join("\n");
  const hasMore = lines.length > 5 || (text || "").length > 280;

  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors border border-border/20 rounded-lg"
      >
        <span>Preview on LinkedIn</span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {open && (
        <div className="mt-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1.5">Preview</p>
          <div
            style={{
              background: "#fff",
              color: "#000000E6",
              border: "1px solid #E0E0E0",
              borderRadius: 8,
              padding: 16,
              fontFamily: '-apple-system, system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
              boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
              maxWidth: 552,
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  background: "#EEF3F8",
                  flexShrink: 0,
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 18,
                  fontWeight: 600,
                  color: "#666",
                }}
              >
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  (profile?.name || "Y").charAt(0).toUpperCase()
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 14, fontWeight: 600, color: "#000000E6" }}>
                  <span>{profile?.name || "You"}</span>
                  <span style={{ color: "#00000099", fontWeight: 400, fontSize: 12 }}>• 1st</span>
                </div>
                {profile?.level && (
                  <div style={{ fontSize: 12, color: "#00000099", lineHeight: 1.3, marginTop: 1 }}>{profile.level}</div>
                )}
                <div style={{ fontSize: 12, color: "#00000099", marginTop: 1 }}>Just now • 🌐</div>
              </div>
            </div>

            {/* Body */}
            <div
              dir={rtl ? "rtl" : "ltr"}
              style={{
                marginTop: 12,
                fontSize: 14,
                lineHeight: 1.5,
                color: "#000000E6",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {preview}
              {hasMore && (
                <>
                  {"… "}
                  <span style={{ color: "#00000099", cursor: "pointer" }}>see more</span>
                </>
              )}
            </div>

            {/* Engagement bar */}
            <div
              style={{
                marginTop: 14,
                paddingTop: 8,
                borderTop: "1px solid #E0E0E0",
                display: "flex",
                justifyContent: "space-around",
                color: "#00000099",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {[
                { icon: <ThumbsUp size={16} />, label: "Like" },
                { icon: <MessageSquare size={16} />, label: "Comment" },
                { icon: <Repeat2 size={16} />, label: "Repost" },
                { icon: <Send size={16} />, label: "Send" },
              ].map(a => (
                <div key={a.label} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px" }}>
                  {a.icon}
                  <span>{a.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LinkedInPreview;