import AdminShell from "@/components/admin/AdminShell";

/**
 * /admin/standard — read-only host for the Aura Standard V2.0 constitution.
 * The HTML is served byte-faithfully from public/admin/aura-standard-v2.html
 * inside an iframe so its own CSS, fonts, and theme are fully isolated from
 * the app's design system (Standard §15 — light canonical, derived).
 *
 * Auth: route is wrapped by <AdminGate> in App.tsx, which handles the
 * no-session redirect and the non-admin denial via is_current_user_admin().
 * No local guard is needed here.
 */
export default function AdminStandard() {
  return (
    <AdminShell bleed>
      <iframe
        title="The Aura Standard V2.0"
        src="/admin/aura-standard-v2.html"
        style={{
          display: "block",
          width: "100%",
          height: "calc(100vh - 60px)",
          border: 0,
          background: "var(--paper)",
        }}
      />
    </AdminShell>
  );
}