import { useState, useEffect } from "react";
import { Compass, X } from "lucide-react";

export function TourReminderBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const completed = localStorage.getItem("aura_tour_completed");
    const count = Number(localStorage.getItem("aura_tour_login_count") || "0");
    if (!completed || count >= 3) return;

    const sessionKey = `aura_tour_session_${new Date().toDateString()}`;
    if (!sessionStorage.getItem(sessionKey)) {
      sessionStorage.setItem(sessionKey, "1");
      const newCount = count + 1;
      localStorage.setItem("aura_tour_login_count", String(newCount));
      if (newCount <= 3) setShow(true);
    } else if (count < 3) {
      setShow(true);
    }
  }, []);

  if (!show) return null;

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "10px 16px",
      background: "var(--background-secondary, rgba(176,141,58,0.06))",
      borderRadius: 8,
      marginBottom: 16,
      border: "0.5px solid hsl(var(--border))",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 13,
        color: "hsl(var(--foreground))",
      }}>
        <Compass size={16} aria-hidden />
        Need a refresher?
        <button
          onClick={() => {
            setShow(false);
            if ((window as any).auraReplayTour) (window as any).auraReplayTour();
          }}
          style={{
            background: "none",
            border: "none",
            color: "#B08D3A",
            fontSize: 13,
            cursor: "pointer",
            fontWeight: 500,
            padding: 0,
            textDecoration: "underline",
          }}
        >
          Replay the tour →
        </button>
      </div>
      <button
        onClick={() => {
          setShow(false);
          localStorage.setItem("aura_tour_login_count", "3");
        }}
        aria-label="Dismiss"
        style={{
          background: "none",
          border: "none",
          color: "hsl(var(--muted-foreground))",
          cursor: "pointer",
          padding: 0,
          lineHeight: 1,
          display: "inline-flex",
        }}
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}

export default TourReminderBanner;