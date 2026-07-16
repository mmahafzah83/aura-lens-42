import { Link } from "react-router-dom";
import AdminShell from "@/components/admin/AdminShell";
import { ArrowRight, Palette, Sparkles } from "lucide-react";

const cardStyle = {
  backgroundColor: "var(--ob-panel)",
  border: "1px solid var(--hair)",
  borderRadius: 12,
  padding: "20px",
};

const mutedStyle = { color: "var(--glass-2)", fontSize: 13 };

const LINKS = [
  {
    to: "/admin/design-system",
    label: "Design tokens & versions",
    description: "Legacy bronze token sets and version history.",
    icon: Palette,
  },
  {
    to: "/admin/experience",
    label: "Atmosphere & backgrounds",
    description: "Legacy atmosphere, gradients and background controls.",
    icon: Sparkles,
  },
];

export default function AdminAppearance() {
  return (
    <AdminShell title="Appearance">
      <div className="grid gap-4">
        <div
          style={{
            ...cardStyle,
            borderLeft: "3px solid var(--hair)",
            backgroundColor: "var(--ob-raised)",
          }}
        >
          <p style={{ margin: 0, ...mutedStyle, lineHeight: 1.55 }}>
            These panels control the legacy bronze / dual-theme token set. The live app now
            renders System-A tokens from code, so most edits here won't change the current
            look. Kept for reference and rollback.
          </p>
        </div>

        <div className="grid gap-3">
          {LINKS.map(({ to, label, description, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center justify-between"
              style={{
                ...cardStyle,
                textDecoration: "none",
                gap: 16,
              }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="flex items-center justify-center"
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: "var(--ob-raised)",
                    border: "1px solid var(--hair)",
                    color: "var(--brand)",
                    flexShrink: 0,
                  }}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <div style={{ color: "var(--glass)", fontSize: 15, fontWeight: 500 }}>
                    {label}
                  </div>
                  <div style={{ ...mutedStyle, marginTop: 4 }}>{description}</div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 shrink-0" style={{ color: "var(--glass-2)" }} />
            </Link>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}