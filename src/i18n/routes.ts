/**
 * The one registry of routes whose text exists in Arabic. Everything else renders English, LTR.
 * Kept free of browser and i18next imports so the e2e specs can read it in Node.
 */
export const ARABIC_READY_ROUTES: (string | RegExp)[] = [
  "/", "/v2",
  "/home", "/dashboard", "/opportunities", "/settings",
  "/auth", "/login", "/request-access", "/accept-invitation",
  "/assessment", "/onboarding",
];

const normPath = (pathname: string): string => {
  let p = (pathname || "/").split(/[?#]/)[0] || "/";
  if (p.length > 1) p = p.replace(/\/+$/, "") || "/";
  return p;
};

export function isArabicReadyRoute(pathname: string): boolean {
  const p = normPath(pathname);
  if (p === "/admin" || p.startsWith("/admin/")) return false;
  return ARABIC_READY_ROUTES.some((r) =>
    typeof r === "string" ? p === r || p.startsWith(`${r}/`) : r.test(p),
  );
}
