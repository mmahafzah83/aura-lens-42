// The reader's language for a person-triggered email. One rule, every sender:
// (a) `lang` in the request body when it is exactly "ar" or "en";
// (b) the member's saved diagnostic_profiles.ui_language when the account is known;
// (c) English.
import type { EmailLang } from "./emailTemplate.ts";

export function langFromBody(v: unknown): EmailLang | null {
  return v === "ar" || v === "en" ? v : null;
}

// deno-lint-ignore no-explicit-any
export async function resolveEmailLang(bodyLang: unknown, admin?: any, userId?: string | null): Promise<EmailLang> {
  const fromBody = langFromBody(bodyLang);
  if (fromBody) return fromBody;
  if (admin && userId) {
    try {
      const { data } = await admin
        .from("diagnostic_profiles")
        .select("ui_language")
        .eq("user_id", userId)
        .maybeSingle();
      const saved = langFromBody(data?.ui_language);
      if (saved) return saved;
    } catch (e) {
      console.warn("resolveEmailLang: profile lookup failed", (e as Error)?.message);
    }
  }
  return "en";
}
