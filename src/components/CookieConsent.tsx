import { useEffect, useState } from "react";

const STORAGE_KEY = "aura-cookie-consent";

const CookieConsent = () => {
  const [show, setShow] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) !== "true") setShow(true);
    } catch {
      // ignore
    }
  }, []);

  const accept = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // ignore
    }
    setClosing(true);
    setTimeout(() => setShow(false), 300);
  };

  if (!show) return null;

  return (
    <div
      role="region"
      aria-label="Cookie consent"
      className="fixed left-0 right-0 bottom-0 z-50"
      style={{
        background: "var(--vellum)",
        borderTop: "2px solid var(--brand)",
        transform: closing ? "translateY(100%)" : "translateY(0)",
        transition: "transform 300ms ease",
      }}
    >
      <div
        className="mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 px-5 sm:px-10 py-4"
        style={{ maxWidth: 1280 }}
      >
        <p
          className="text-sm text-center sm:text-left"
          style={{ color: "var(--ink)", fontFamily: "var(--font-body)" }}
        >
          Aura uses essential cookies for authentication and preferences.
        </p>
        <button
          type="button"
          onClick={accept}
          className="px-5 py-2 rounded-md text-sm font-medium transition-opacity hover:opacity-90 shrink-0"
          style={{ background: "var(--brand)", color: "var(--paper)" }}
        >
          Accept
        </button>
      </div>
    </div>
  );
};

export default CookieConsent;