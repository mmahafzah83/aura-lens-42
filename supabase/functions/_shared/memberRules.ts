/**
 * The member's own writing rules, as stored in `voice_rules`.
 *
 * A SUGGESTED rule is a proposal, not a rule. Only `status = 'active'` rows
 * are ever handed to a model — a suggestion that silently changed the output
 * would be the same defect class as a number the member never earned.
 */
export interface MemberRule {
  kind: "always" | "never" | "anchor";
  text: string;
}

const KIND_HEADING: Record<MemberRule["kind"], string> = {
  always: "ALWAYS",
  never: "NEVER",
  anchor: "VOICE ANCHORS",
};

/** Active rules only. `status='suggested'` and `status='dismissed'` never load. */
export async function loadActiveMemberRules(
  // deno-lint-ignore no-explicit-any
  client: any,
  userId: string,
): Promise<MemberRule[]> {
  const { data, error } = await client
    .from("voice_rules")
    .select("kind, text, rank")
    .eq("user_id", userId)
    .eq("active", true)
    .eq("status", "active")
    .order("rank");
  if (error) {
    console.error("loadActiveMemberRules failed:", error.message);
    return [];
  }
  // deno-lint-ignore no-explicit-any
  return (data ?? []).map((r: any) => ({ kind: r.kind, text: String(r.text || "").trim() }))
    .filter((r: MemberRule) => r.text.length > 0);
}

/** A prompt block, or an empty string when the member has written no rules. */
export function memberRulesBlock(rules: MemberRule[]): string {
  if (rules.length === 0) return "";
  const groups = (["always", "never", "anchor"] as const)
    .map((kind) => {
      const items = rules.filter((r) => r.kind === kind);
      if (items.length === 0) return "";
      return `${KIND_HEADING[kind]}:\n${items.map((r) => `- ${r.text}`).join("\n")}`;
    })
    .filter(Boolean);
  return `THE MEMBER'S OWN RULES (they wrote or accepted every line — follow them exactly):\n${groups.join("\n")}`;
}
