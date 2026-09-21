/**
 * How much a kind of record cares about place, read from the catalogue.
 *
 * A full-time executive seat is location-hard. A speaking platform, a
 * membership, a paper or a market signal is not. This is a property of the
 * KIND, kept in oe_opportunity_kinds so it can be corrected without a deploy.
 */
export type Sensitivity = "hard" | "soft" | "none";

export async function loadLocationSensitivity(
  admin: any,
): Promise<Record<string, Sensitivity>> {
  const { data, error } = await admin
    .from("oe_opportunity_kinds")
    .select("code, location_sensitivity");
  if (error) throw new Error(`location sensitivity: ${error.message}`);
  const map: Record<string, Sensitivity> = {};
  for (const row of data ?? []) {
    map[String(row.code)] = (String(row.location_sensitivity ?? "hard") as Sensitivity);
  }
  return map;
}

/** Unknown kind is treated as location-hard: we do not relax a rule we cannot read. */
export const sensitivityOf = (
  map: Record<string, Sensitivity>,
  kind?: string | null,
): Sensitivity => map[String(kind ?? "")] ?? "hard";

/**
 * Whether the seniority test means anything for a kind of record.
 *
 * A seat has a grade; a membership, a speaking slot, a judging panel, an
 * authoring invitation, a partnership and a market signal do not. Reading a
 * grade off "FII Institute Membership Program" is a category error, not an
 * unknown. Kept in oe_opportunity_kinds so it is data, not a branch in code.
 */
export async function loadLevelGateApplies(
  admin: any,
): Promise<Record<string, boolean>> {
  const { data, error } = await admin
    .from("oe_opportunity_kinds")
    .select("code, level_gate_applies");
  if (error) throw new Error(`level gate applicability: ${error.message}`);
  const map: Record<string, boolean> = {};
  for (const row of data ?? []) map[String(row.code)] = row.level_gate_applies !== false;
  return map;
}

/** Unknown kind keeps the gate: we do not skip a test we cannot read. */
export const levelGateApplies = (
  map: Record<string, boolean>,
  kind?: string | null,
): boolean => map[String(kind ?? "")] ?? true;
