import { supabase } from "@/integrations/supabase/client";

type Severity = "critical" | "high" | "info" | "low";

const MAX_REPORTS_PER_SESSION = 20;
const seenSignatures = new Set<string>();
let reportsSent = 0;
let inFlight = false;

function isSelfOriginated(input: unknown): boolean {
  try {
    const s = typeof input === "string" ? input : JSON.stringify(input ?? "");
    return s.includes("log-client-error");
  } catch {
    return false;
  }
}

export async function reportClientError(
  message: string,
  severity: Severity,
  context?: Record<string, unknown>,
): Promise<void> {
  if (inFlight) return;
  if (reportsSent >= MAX_REPORTS_PER_SESSION) return;

  const sig = `${severity}::${(message ?? "").slice(0, 300)}`;
  if (seenSignatures.has(sig)) return;
  seenSignatures.add(sig);
  reportsSent += 1;

  inFlight = true;
  try {
    // pathname only — never the full URL (invite tokens/emails can be in query).
    const route =
      typeof location !== "undefined" && location.pathname ? location.pathname : "unknown";
    await supabase.functions.invoke("log-client-error", {
      body: {
        message: String(message ?? "unknown").slice(0, 1000),
        severity,
        route,
        context: context ?? {},
      },
    });
  } catch {
    // Swallow — telemetry must never affect the app.
  } finally {
    inFlight = false;
  }
}

let installed = false;
export function installGlobalErrorHandlers(): void {
  if (installed) return;
  if (typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event: ErrorEvent) => {
    try {
      const msg = event?.message || (event?.error && String(event.error?.message)) || "window error";
      const filename = event?.filename || "";
      if (isSelfOriginated(msg) || isSelfOriginated(filename)) return;
      void reportClientError(msg, "info", {
        route: location.pathname,
        userAgent: navigator.userAgent,
        filename: filename ? String(filename).slice(0, 200) : undefined,
        lineno: event?.lineno,
        colno: event?.colno,
      });
    } catch {
      // never throw from a global handler
    }
  });

  window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    try {
      const reason: any = (event as any)?.reason;
      const msg =
        (reason && (reason.message || (typeof reason === "string" ? reason : ""))) ||
        "unhandled promise rejection";
      if (isSelfOriginated(msg)) return;
      void reportClientError(String(msg), "info", {
        route: location.pathname,
        userAgent: navigator.userAgent,
        kind: "unhandledrejection",
      });
    } catch {
      // never throw from a global handler
    }
  });
}