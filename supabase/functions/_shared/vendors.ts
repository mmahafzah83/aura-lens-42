/**
 * vendors.ts — the paid outside services, named in one place.
 *
 * A vendor that has stopped paying out must never look like a quiet night.
 * Every function that spends money reads its key from here, and any function
 * that meets a refusal can ask for a health check with kickVendorHealth().
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/** The Apify token, whatever name it was saved under. */
export function apifyToken(): string | null {
  return Deno.env.get("APIFY_TOKEN")
    || Deno.env.get("APIFY_API_TOKEN")
    || Deno.env.get("APIFY_KEY")
    || Deno.env.get("APIFY_API_KEY")
    || null;
}

export function firecrawlKey(): string | null {
  return Deno.env.get("FIRECRAWL_API_KEY") || null;
}

/** A fetch that gives up rather than hanging the run. */
export async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 15_000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ask for a vendor health check after a refusal, at most once an hour. The
 * timestamp lives in admin_settings so two functions cannot both fire.
 */
export async function kickVendorHealth(admin: SupabaseClient, reason: string): Promise<boolean> {
  const KEY = "vendor_health_last_run";
  const { data } = await admin.from("admin_settings").select("value").eq("key", KEY).maybeSingle();
  const raw = (data as { value?: unknown } | null)?.value as any;
  const last = typeof raw === "string" ? raw : raw?.at ?? null;
  if (last && Date.now() - new Date(String(last)).getTime() < 3_600_000) return false;

  await admin.from("admin_settings")
    .upsert({ key: KEY, value: { at: new Date().toISOString(), reason } as any }, { onConflict: "key" });

  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/oe-vendor-health`;
  try {
    // Fire and forget: the caller's own run must not wait on this.
    void fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ reason }),
    }, 5_000).catch(() => undefined);
  } catch { /* a health check that cannot start is not worth a failed run */ }
  return true;
}
