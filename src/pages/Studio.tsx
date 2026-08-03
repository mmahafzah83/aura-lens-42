/**
 * /studio — a thin route. The studio IS the composer now, living on the shell's
 * `authority` tab, so this address redirects there and carries every query
 * parameter (notably `?draft=`) through unchanged.
 */
import { Navigate, useLocation } from "react-router-dom";

export default function Studio() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  params.set("tab", "authority");
  return <Navigate to={`/home?${params.toString()}`} replace />;
}
