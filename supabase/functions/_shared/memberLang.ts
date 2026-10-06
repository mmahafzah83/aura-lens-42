// The language a member's server-written text is in: the same rule as the
// emails — diagnostic_profiles.ui_language when it is "ar" or "en", else English.
import { resolveEmailLang } from "./emailLang.ts";
export type MemberLang = "ar" | "en";

export const pickMemberLang = (saved: unknown): MemberLang => (saved === "ar" ? "ar" : "en");

// deno-lint-ignore no-explicit-any
export async function memberLang(admin: any, userId: string | null | undefined, override?: unknown): Promise<MemberLang> {
  return await resolveEmailLang(override, admin, userId ?? null);
}
