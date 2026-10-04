/**
 * Fair's people (DECISIONS, 4 Oct 2026). Duties live on accounts.staff and are edited
 * by Refal or Rafli in the CMS (People); this is only the seed applied when existing
 * sign-ins became accounts. Refal and Rafli are the super admins. Audia, Wega and
 * Arneta own all three roles; Audia and Arneta may also change design. Raissa and Yunni
 * reached every workspace before (owners), so they start as data ops.
 */
export const DUTIES = ["owner", "role_owner", "designer", "data_ops"] as const;
export type Duty = (typeof DUTIES)[number];

export const DUTY_LABEL: Record<Duty, string> = {
  owner: "Owner",
  role_owner: "Role owner",
  designer: "Design",
  data_ops: "Data ops",
};

/** by the local part of a fair-indonesia.com address */
export const STAFF_SEED: Record<string, Duty[]> = {
  refal: ["owner"],
  rafli: ["owner"],
  audia: ["role_owner", "designer"],
  wega: ["role_owner"],
  arneta: ["role_owner", "designer"],
  raissa: ["data_ops"],
  yunni: ["data_ops"],
};

export const STAFF_DOMAIN = "fair-indonesia.com";

export const isDuty = (v: unknown): v is Duty => typeof v === "string" && (DUTIES as readonly string[]).includes(v);
