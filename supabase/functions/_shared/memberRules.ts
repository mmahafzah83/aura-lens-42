/**
 * THE MEMBER-RULE CONTRACT
 *
 * Always — something every draft must do. Injected as an instruction.
 * Never — something no draft may contain. Injected as an instruction AND
 * verified after writing. A Never that is not checkable is not a Never.
 * Anchors — phrases or signatures that are the member's own. Reference
 * material for the model, never a constraint and never checked.
 *
 * A SUGGESTED rule is a proposal, not a rule. Only `status = 'active'` rows
 * are ever handed to a model.
 */
export interface MemberRuleCheck {
  kind: "phrase" | "opening" | "ending" | "marker";
  value: string;
}

export interface MemberRule {
  id: string;
  kind: "always" | "never" | "anchor";
  text: string;
  check: MemberRuleCheck | null;
}

const KIND_HEADING: Record<MemberRule["kind"], string> = {
  always: "ALWAYS",
  never: "NEVER",
  anchor: "ANCHORS",
};

/** Active rules only. `status='suggested'` and `status='dismissed'` never load. */
export async function loadActiveMemberRules(
  // deno-lint-ignore no-explicit-any
  client: any,
  userId: string,
): Promise<MemberRule[]> {
  const { data, error } = await client
    .from("voice_rules")
    .select("id, kind, text, check, rank")
    .eq("user_id", userId)
    .eq("active", true)
    .eq("status", "active")
    .order("rank");
  if (error) {
    console.error("loadActiveMemberRules failed:", error.message);
    return [];
  }
  // deno-lint-ignore no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: String(r.id),
    kind: r.kind,
    text: String(r.text || "").trim(),
    check: r.check && typeof r.check === "object"
      ? { kind: r.check.kind, value: String(r.check.value || "").trim() }
      : null,
  }))
    .filter((r: MemberRule) => r.text.length > 0);
}

/** Record one prompt injection for all rules in one write, never per retry. */
export async function markMemberRulesApplied(client: any, rules: MemberRule[]): Promise<void> {
  if (rules.length === 0) return;
  const now = new Date().toISOString();
  await Promise.all(rules.map(async (rule) => {
    const { error } = await client.rpc("increment_voice_rule_applied", { p_rule_id: rule.id, p_applied_at: now });
    if (error) console.error("increment_voice_rule_applied failed:", rule.id, error.message);
  }));
}

const normalise = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();

/** Check only mechanically testable Never rules. Advisory Never rules return no violation. */
export function neverRuleViolations(text: string, rules: MemberRule[]): MemberRule[] {
  const body = normalise(text);
  const lines = body.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return rules.filter((rule) => {
    if (rule.kind !== "never" || !rule.check?.value) return false;
    const value = normalise(rule.check.value);
    if (!value) return false;
    const values = value.split("|").map((part) => part.trim()).filter(Boolean);
    if (rule.check.kind === "opening") return values.some((part) => (lines[0] ?? "").startsWith(part));
    if (rule.check.kind === "ending") return (lines[lines.length - 1] ?? "").includes(value);
    return values.some((part) => body.includes(part));
  });
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
  return `THE MEMBER'S OWN RULES:\nALWAYS and NEVER are instructions. ANCHORS are reference material only: use them when natural, never force them.\n${groups.join("\n")}`;
}
