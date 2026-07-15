import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AuraLogo from "@/components/brand/AuraLogo";

// Typed wrapper — the supabase.auth.oauth namespace is beta and may not be
// fully typed in the installed client version.
type OAuthClient = { name?: string; client_name?: string; client_uri?: string };
type OAuthAuthorizationDetails = {
  client?: OAuthClient;
  redirect_uri?: string;
  scope?: string;
  scopes?: string[];
  redirect_url?: string;
  redirect_to?: string;
};

const oauthClient = (supabase.auth as any).oauth as {
  getAuthorizationDetails: (id: string) => Promise<{ data: OAuthAuthorizationDetails | null; error: any }>;
  approveAuthorization: (id: string) => Promise<{ data: { redirect_url?: string; redirect_to?: string } | null; error: any }>;
  denyAuthorization: (id: string) => Promise<{ data: { redirect_url?: string; redirect_to?: string } | null; error: any }>;
};

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<OAuthAuthorizationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Missing authorization_id");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        // Preserve the FULL consent URL so Auth returns the user here.
        const returnTo = window.location.pathname + window.location.search;
        window.location.href = "/auth?returnTo=" + encodeURIComponent(returnTo);
        return;
      }
      if (!oauthClient?.getAuthorizationDetails) {
        setError("OAuth is not available in this app build.");
        return;
      }
      const { data, error } = await oauthClient.getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (error) {
        setError(error.message ?? "Could not load this authorization request.");
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    if (!authorizationId) return;
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauthClient.approveAuthorization(authorizationId)
      : await oauthClient.denyAuthorization(authorizationId);
    if (error) {
      setBusy(false);
      setError(error.message ?? "Could not complete the authorization.");
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? details?.client?.client_name ?? "an app";
  const scopeLabels: string[] = details?.scopes ?? (details?.scope ? details.scope.split(/\s+/).filter(Boolean) : []);

  return (
    <main
      className="min-h-screen flex items-center justify-center px-6 py-16"
      style={{ backgroundColor: "var(--paper)", fontFamily: "var(--font-body)", color: "var(--ink)" }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-8"
        style={{ background: "var(--paper-2)", border: "0.5px solid var(--rule)" }}
      >
        <div className="flex items-center gap-3 mb-6">
          <AuraLogo size={28} />
          <div style={{ fontFamily: "var(--serif)", fontSize: 18, letterSpacing: "0.04em" }}>Aura</div>
        </div>

        {error ? (
          <>
            <h1 className="text-xl font-semibold mb-2">Authorization error</h1>
            <p className="text-sm" style={{ color: "var(--ink-3)" }}>{error}</p>
          </>
        ) : !details ? (
          <p className="text-sm" style={{ color: "var(--ink-3)" }}>Loading…</p>
        ) : (
          <>
            <h1 className="text-xl font-semibold mb-2">
              Connect {clientName} to Aura
            </h1>
            <p className="text-sm mb-6" style={{ color: "var(--ink-3)" }}>
              This lets {clientName} use Aura as you.
            </p>

            <div className="mb-6 text-sm" style={{ color: "var(--ink-2)" }}>
              <div className="font-medium mb-2" style={{ color: "var(--ink)" }}>What it can do</div>
              <ul className="list-disc pl-5 space-y-1">
                <li>Read your active strategic signals and their evidence.</li>
                <li>Read your recent LinkedIn posts tracked in Aura.</li>
                <li>Capture new notes and articles into your Aura knowledge base.</li>
              </ul>
              <p className="mt-3 text-xs" style={{ color: "var(--ink-3)" }}>
                This does not bypass Aura's permissions or backend policies.
              </p>
              {scopeLabels.length > 0 && (
                <p className="mt-3 text-xs" style={{ color: "var(--ink-3)" }}>
                  Additional permission requested: {scopeLabels.join(", ")}
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => decide(true)}
                className="flex-1 py-2.5 rounded-lg font-medium"
                style={{ background: "var(--gold, #C5A55A)", color: "var(--paper)", opacity: busy ? 0.6 : 1 }}
              >
                {busy ? "Working…" : "Approve"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => decide(false)}
                className="flex-1 py-2.5 rounded-lg"
                style={{ background: "transparent", border: "0.5px solid var(--rule)", color: "var(--ink)", opacity: busy ? 0.6 : 1 }}
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}