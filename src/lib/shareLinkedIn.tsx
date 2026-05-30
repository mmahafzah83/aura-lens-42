import { toast } from "sonner";

/**
 * Copies share text to the clipboard and surfaces a clickable LinkedIn link.
 * We intentionally do NOT call window.open — sandboxed previews and aggressive
 * popup blockers swallow it silently. A persistent toast with an anchor tag
 * gives the user a reliable one-click path to LinkedIn.
 */
export async function shareToLinkedIn(opts: {
  text: string;
  toastMessage?: string;
  mode?: "share" | "feed";
  url?: string;
}) {
  // NOTE: the legacy `mode: "feed"` URL (linkedin.com/feed/?shareActive=true)
  // is blocked by LinkedIn (ERR_BLOCKED_BY_RESPONSE). We always use the
  // share-offsite endpoint regardless of `mode` so callers can never drift
  // back to the blocked URL.
  const { text, url = "https://aura-intel.org" } = opts;

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

  // 2. Build the LinkedIn URL (always share-offsite — feed URL is blocked)
  const target = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;

  // 3. Persistent toast with clickable link (no auto window.open)
  const id = toast.success(
    <div>
      <div style={{ fontWeight: 500, marginBottom: 4 }}>
        Caption copied to clipboard ✓
      </div>
      <a
        href={target}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: "#B08D3A", textDecoration: "underline" }}
        onClick={() => toast.dismiss(id)}
      >
        Open LinkedIn to paste →
      </a>
    </div>,
    { duration: 10000 }
  );
}