import { toast } from "sonner";

/**
 * Copies text to the clipboard and opens the LinkedIn share dialog
 * (or the LinkedIn feed composer as a fallback).
 * Pass `mode: "feed"` for the in-app composer (used after post generation).
 */
export async function shareToLinkedIn(opts: {
  text: string;
  toastMessage?: string;
  mode?: "share" | "feed";
  url?: string;
}) {
  const { text, toastMessage, mode = "share", url = "https://aura-intel.org" } = opts;
  try {
    await navigator.clipboard.writeText(text);
  } catch { /* ignore */ }
  if (toastMessage) toast.success(toastMessage);
  const target =
    mode === "feed"
      ? "https://www.linkedin.com/feed/?shareActive=true"
      : `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  window.open(target, "_blank", "noopener,noreferrer");
}