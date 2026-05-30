import { toast } from "sonner";

/**
 * Copies share text to the clipboard and opens LinkedIn's working feed in a
 * new tab so the user can click "Start a post" and paste.
 *
 * Why not a share URL? LinkedIn's share-offsite endpoint only shares a
 * scrapeable webpage — it cannot prefill a text post nor attach a local
 * image. The legacy `feed/?shareActive=true` URL is blocked
 * (ERR_BLOCKED_BY_RESPONSE). Plain `/feed/` is the logged-in homepage and
 * works reliably; the call is user-initiated so popup blockers allow it.
 */
export async function shareToLinkedIn(opts: {
  text: string;
  toastMessage?: string;
  mode?: "share" | "feed";
  url?: string;
  withImage?: boolean;
}) {
  const { text, withImage = false } = opts;

  // 1. Copy to clipboard (with textarea fallback)
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    } catch { /* ignore */ }
  }

  // 2. Open the working LinkedIn feed (user-initiated → not popup-blocked).
  window.open("https://www.linkedin.com/feed/", "_blank", "noopener,noreferrer");

  // 3. Tell the user exactly what to do next.
  const base = "Your text is copied — in the LinkedIn tab, click 'Start a post' and paste (⌘/Ctrl+V)";
  const msg = withImage ? `${base}, then attach the image you just downloaded.` : `${base}.`;
  toast.success(msg, { duration: 10000 });
}