import { useEffect, useState } from "react";
import { MessageCircle, X, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const DISMISS_KEY = "aura_whatsapp_modal_dismissed";

export default function WhatsAppOptInModal() {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (localStorage.getItem(DISMISS_KEY) === "true") return;
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id;
        if (!userId) return;

        const { data: profile } = await supabase
          .from("diagnostic_profiles")
          .select("phone_whatsapp")
          .eq("user_id", userId)
          .maybeSingle();
        if (cancelled) return;
        if (profile?.phone_whatsapp) return;

        const { data: events } = await supabase
          .from("notification_events")
          .select("id")
          .eq("user_id", userId)
          .eq("type", "timing_window")
          .limit(1);
        if (cancelled) return;
        if (!events || events.length === 0) return;

        setOpen(true);
      } catch {
        // silent
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, "true"); } catch {}
    setOpen(false);
  };

  const handleSubmit = async () => {
    setError(null);
    const trimmed = phone.trim();
    const digits = trimmed.replace(/[^\d]/g, "");
    if (!trimmed.startsWith("+") || digits.length < 10 || digits.length > 15) {
      setError("Enter a valid number with country code, e.g. +966 5X XXX XXXX");
      return;
    }
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) { setError("Session expired."); setSubmitting(false); return; }

      const { data: existing } = await supabase
        .from("diagnostic_profiles")
        .select("notification_prefs")
        .eq("user_id", userId)
        .maybeSingle();

      const mergedPrefs = {
        ...(existing?.notification_prefs as Record<string, unknown> | null ?? {}),
        whatsapp_timing_windows: true,
      };

      const { error: updateErr } = await supabase
        .from("diagnostic_profiles")
        .update({ phone_whatsapp: trimmed, notification_prefs: mergedPrefs })
        .eq("user_id", userId);

      if (updateErr) { setError(updateErr.message); setSubmitting(false); return; }

      setSuccess(true);
      setSubmitting(false);
      setTimeout(() => setOpen(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Didn't connect. Try once more.");
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        className="relative w-full max-w-[360px] bg-white p-6 shadow-2xl"
        style={{ borderRadius: "var(--border-radius-lg, 16px)" }}
      >
        <button
          onClick={dismiss}
          aria-label="Close"
          className="absolute top-3 right-3 p-1 rounded-md text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition"
        >
          <X className="w-4 h-4" />
        </button>

        {success ? (
          <div className="flex flex-col items-center text-center py-4">
            <div className="w-12 h-12 rounded-lg bg-emerald-100 flex items-center justify-center mb-3">
              <Check className="w-6 h-6 text-emerald-600" />
            </div>
            <p className="text-neutral-900 text-sm font-medium">
              You're set. I'll reach out when it matters.
            </p>
          </div>
        ) : (
          <>
            <div className="w-11 h-11 rounded-lg bg-amber-100 flex items-center justify-center mb-4">
              <MessageCircle className="w-6 h-6 text-amber-600" />
            </div>
            <h2 className="text-neutral-900 text-lg font-semibold leading-tight mb-2">
              Never miss a timing window
            </h2>
            <p className="text-neutral-600 text-sm leading-relaxed mb-4">
              I detected a live opportunity that closes in hours. Add your WhatsApp and I'll alert you the moment something like this opens — before the window closes.
            </p>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+966 5X XXX XXXX"
              className="w-full px-3 py-2.5 text-sm bg-white border border-neutral-300 rounded-md text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              disabled={submitting}
            />
            {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
            <p className="text-xs text-neutral-500 mt-2">
              Urgent alerts only. Max 3/week. Remove anytime in Settings.
            </p>

            <div className="flex flex-col gap-2 mt-5">
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium py-2.5 rounded-md transition disabled:opacity-60"
              >
                {submitting ? "Saving…" : "Enable WhatsApp alerts"}
              </button>
              <button
                onClick={dismiss}
                disabled={submitting}
                className="w-full text-neutral-600 hover:text-neutral-900 text-sm font-medium py-2 rounded-md transition"
              >
                Not now
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}