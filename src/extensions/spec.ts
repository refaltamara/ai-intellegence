/**
 * A client extension's definition (CMS plan, "Client extensions"): a field on creators,
 * posts or comments, the values it may take, and where its values come from. The model
 * may draft a definition and name values; it never writes SQL: rule terms become
 * parameters, and the query builder joins the values by id (src/query/builder.ts). Pure.
 */
export const EXT_TARGETS = ["creator", "post", "comment"] as const;
export type ExtTarget = (typeof EXT_TARGETS)[number];
export const EXT_SOURCES = ["rule", "file", "cemo"] as const;
export type ExtSource = (typeof EXT_SOURCES)[number];

export type ExtValue = { name: string; description?: string; hint?: string };
export type ExtRule = { value: string; terms: string[] };
/** which rows CeMO reads (or rules apply to); empty means every row of the target in the workspace */
export type ExtScope = { brands?: string[]; platforms?: string[]; since?: string; min_followers?: number; min_views?: number };

export type ExtDefInput = {
  name: string;
  /** a-z, 0-9 and _; queries call it ext_<key> */
  key?: string;
  target: ExtTarget;
  values: ExtValue[];
  source: ExtSource;
  rules?: ExtRule[];
  /** cemo: how to choose, in the client's words */
  guide?: string;
  scope?: ExtScope;
};

export type ExtDef = {
  id: string;
  workspace_id: string;
  key: string;
  name: string;
  target: ExtTarget;
  values: ExtValue[];
  source: ExtSource;
  spec: { rules?: ExtRule[]; guide?: string; scope?: ExtScope };
  status: "draft" | "approved" | "filling" | "live" | "paused" | "removed";
  creation_id: string | null;
  maker_email: string;
  approver: string | null;
  estimate: Estimate | null;
  progress: { done?: number; total?: number; credits?: number; refreshed_at?: string; error?: string } | null;
  updated_at: string;
  created_at: string;
};

export type Estimate = {
  rows: number;
  /** rows already read (the sample) */
  done: number;
  credits_now: number;
  credits_per_day: number;
  new_rows_per_day: number;
  /** per value: rows in the sample (cemo) or in every row (rule) */
  counts: Record<string, number>;
  examples: { ref: string; label: string; text: string; value: string | null }[];
  sample_credits: number;
};

export const MAX_VALUES = 12;
export const KEY = /^[a-z][a-z0-9_]{1,30}$/;
/** the dimension and filter name in the query builder */
export const dimName = (key: string) => `ext_${key}`;
export const keyOf = (dim: string) => (dim.startsWith("ext_") ? dim.slice(4) : null);
export const isExtDim = (s: string) => /^ext_[a-z][a-z0-9_]{1,30}$/.test(s);

const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30);

/** The definition cleaned, or the reasons it cannot be kept, in words a Builder can act on. */
export function validateExt(raw: Partial<ExtDefInput>): { ok: true; def: ExtDefInput & { key: string } } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const name = String(raw.name ?? "").trim().slice(0, 60);
  if (!name) errors.push("Give it a name, like Persona.");
  const key = raw.key && KEY.test(raw.key) ? raw.key : slug(name);
  if (name && !KEY.test(key)) errors.push("Use a name of at least two letters, starting with a letter.");
  if (!EXT_TARGETS.includes(raw.target as ExtTarget)) errors.push("Say what it describes: a creator, a post or a comment.");
  if (!EXT_SOURCES.includes(raw.source as ExtSource)) errors.push("Say where the values come from: keyword rules, a file, or CeMO reading each row.");
  const values: ExtValue[] = (Array.isArray(raw.values) ? raw.values : [])
    .map((v) => (typeof v === "string" ? { name: v } : v))
    .filter((v): v is ExtValue => !!v && typeof v.name === "string" && !!v.name.trim())
    .map((v) => ({ name: v.name.trim().slice(0, 40), ...(v.description?.trim() ? { description: v.description.trim().slice(0, 200) } : {}), ...(v.hint?.trim() ? { hint: v.hint.trim().slice(0, 200) } : {}) }));
  const names = values.map((v) => v.name.toLowerCase());
  if (values.length < 2) errors.push("List at least two values.");
  if (values.length > MAX_VALUES) errors.push(`Keep it to ${MAX_VALUES} values.`);
  if (new Set(names).size !== names.length) errors.push("Each value once.");
  if (names.some((n) => ["none", "not tagged"].includes(n))) errors.push('"none" and "not tagged" are kept for rows that fit no value.');
  const rules: ExtRule[] = [];
  if (raw.source === "rule") {
    for (const r of Array.isArray(raw.rules) ? raw.rules : []) {
      const v = values.find((x) => x.name.toLowerCase() === String(r?.value ?? "").toLowerCase());
      const terms = (Array.isArray(r?.terms) ? r.terms : []).map((t) => String(t).trim().toLowerCase().slice(0, 40)).filter((t) => t.length >= 2).slice(0, 30);
      if (!v) errors.push(`A rule names "${r?.value}", which is not one of the values.`);
      else if (!terms.length) errors.push(`Give the words that mark ${v.name}.`);
      else rules.push({ value: v.name, terms });
    }
    if (!rules.length) errors.push("Rules need at least one value with the words that mark it.");
  }
  const guide = raw.source === "cemo" ? String(raw.guide ?? "").trim().slice(0, 600) : undefined;
  const sc = raw.scope ?? {};
  const scope: ExtScope = {
    ...(Array.isArray(sc.brands) && sc.brands.length ? { brands: sc.brands.map(String).slice(0, 20) } : {}),
    ...(Array.isArray(sc.platforms) && sc.platforms.length ? { platforms: sc.platforms.map(String).filter((p) => /^[a-z]{1,12}$/.test(p)) } : {}),
    ...(typeof sc.since === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sc.since) ? { since: sc.since } : {}),
    ...(Number.isFinite(sc.min_followers) && Number(sc.min_followers) > 0 ? { min_followers: Math.round(Number(sc.min_followers)) } : {}),
    ...(Number.isFinite(sc.min_views) && Number(sc.min_views) > 0 ? { min_views: Math.round(Number(sc.min_views)) } : {}),
  };
  if (raw.target === "comment" && raw.source === "cemo" && !scope.since && !scope.brands?.length) errors.push("CeMO reading comments needs a start date or brands, so the cost stays known.");
  if (errors.length) return { ok: false, errors };
  return { ok: true, def: { name, key, target: raw.target as ExtTarget, values, source: raw.source as ExtSource, ...(rules.length ? { rules } : {}), ...(guide ? { guide } : {}), scope } };
}

/** the value a person or the model gave, matched to the definition's own spelling; null when none fits */
export function matchValue(values: ExtValue[], v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase();
  return values.find((x) => x.name.toLowerCase() === t)?.name ?? null;
}

/** words for a value's rows in the query builder */
export const NOT_TAGGED = "not tagged";
export const NONE = "none";
