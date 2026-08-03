/**
 * /studio — a thin route. The studio itself is a page INSIDE the Aura shell,
 * so this address simply redirects into the shell's hidden `studio` tab and
 * carries every query parameter (notably `?draft=`) through unchanged.
 */
import { Navigate, useLocation } from "react-router-dom";

export default function Studio() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  params.set("tab", "studio");
  return <Navigate to={`/home?${params.toString()}`} replace />;
}
