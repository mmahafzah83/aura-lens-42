import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import AuraLogo from "@/components/brand/AuraLogo";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
    document.title = "Aura — Page not found";
  }, [location.pathname]);

  return (
    <div
      className="flex min-h-screen items-center justify-center px-6"
      style={{ background: "var(--paper)" }}
    >
      <div className="text-center max-w-md">
        <div className="flex justify-center mb-6" style={{ color: "var(--ink-5)" }}>
          <AuraLogo size={48} />
        </div>
        <h1
          className="mb-3"
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: 32,
            fontWeight: 500,
            color: "var(--ink)",
            letterSpacing: "-0.01em",
            lineHeight: 1.2,
          }}
        >
          This page doesn't exist
        </h1>
        <p
          className="mb-8"
          style={{
            color: "var(--ink-4)",
            fontSize: 15,
            lineHeight: 1.6,
          }}
        >
          But your intelligence does. Head back to your dashboard.
        </p>
        <Link
          to="/home"
          className="inline-block transition-opacity hover:opacity-90"
          style={{
            background: "var(--brand)",
            color: "var(--paper)",
            borderRadius: 8,
            padding: "12px 28px",
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Go home →
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
