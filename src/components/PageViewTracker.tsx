import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { track } from "@/lib/track";

/**
 * Fires a `page_view` product event on every route change.
 * Reuses the existing `track()` helper — which handles session_id and
 * silently no-ops for signed-out users. Dedupes against re-renders by
 * only sending when the pathname actually changes.
 */
export default function PageViewTracker() {
  const location = useLocation();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    const path = location.pathname;
    if (lastPath.current === path) return;
    lastPath.current = path;
    void track("page_view", { path });
  }, [location.pathname]);

  return null;
}