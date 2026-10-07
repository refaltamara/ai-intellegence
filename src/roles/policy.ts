/**
 * Who may change what in a role (CMS plan, "One brain, three layers"). A role reaches a
 * client in three layers: Fair's released version, the company's changes (set by its
 * Builder) and each person's own settings. Every field Fair does not list here is
 * locked; a listed field says the lowest layer that may change it and the guard rails
 * a value must keep. resolve() applies the layers field by field and reports what it
 * dropped, so nothing a client sets can break the product's own rules. Pure.
 */
import { DECK_TEMPLATE_KEYS, NAV_KEYS, SKILL_LAYERS, templateKeysFor } from "./registry";
import { sectionKeys } from "../dashboard/sections";
import type { NavKey, RoleModel } from "./model";

/** the layer a change comes from; "company" is the Builder's, "member" a person's own */
export type Layer = "company" | "member";

/** changes as dotted paths ("alert.min_comments") to values */
export type Overrides = Record<string, unknown>;

type Check = (v: unknown, fair: RoleModel) => unknown | undefined;

const int = (lo: number, hi: number): Check => (v) => (typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : undefined);
const num = (lo: number, hi: number): Check => (v) => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : undefined);
const text = (max: number): Check => (v) => (typeof v === "string" && v.trim() && v.length <= max ? v.trim() : undefined);
const texts = (maxItems: number, maxLen: number): Check => (v) =>
  Array.isArray(v) && v.length <= maxItems && v.every((x) => typeof x === "string" && x.trim() && x.length <= maxLen) ? v.map((x) => (x as string).trim()) : undefined;
const oneOf = <T>(xs: readonly T[]): Check => (v) => (xs.includes(v as T) ? v : undefined);

/** a reordering or narrowing of what Fair offers, never something new; empty is refused */
const subsetOf = (allowed: (fair: RoleModel) => readonly string[], keep: string[] = []): Check => (v, fair) => {
  if (!Array.isArray(v) || !v.length) return undefined;
  const ok = new Set(allowed(fair));
  const list = [...new Set(v.filter((x): x is string => typeof x === "string" && ok.has(x)))];
  return list.length === v.length && keep.every((k) => !ok.has(k) || list.includes(k)) ? list : undefined;
};

/** sections of the role's Dashboard: at most all but two hidden; [] shows everything again */
const hiddenSections: Check = (v, fair) => {
  const keys = sectionKeys(fair.id);
  if (!Array.isArray(v) || v.length > keys.length - 2) return undefined;
  const list = [...new Set(v)];
  return list.every((x) => typeof x === "string" && keys.includes(x)) ? list : undefined;
};
/** a whole order of the role's Dashboard sections, each once */
const sectionOrder: Check = (v, fair) => {
  const keys = sectionKeys(fair.id);
  return Array.isArray(v) && v.length === keys.length && new Set(v).size === v.length && v.every((x) => keys.includes(x as string)) ? v : undefined;
};
/** new titles for some sections, each up to 40 characters */
const sectionNames: Check = (v, fair) => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const keys = sectionKeys(fair.id);
  const e = Object.entries(v as Record<string, unknown>);
  return e.every(([k, x]) => keys.includes(k) && typeof x === "string" && x.trim() && x.length <= 40) ? Object.fromEntries(e.map(([k, x]) => [k, (x as string).trim()])) : undefined;
};

export type Policy = { who: Layer; check: Check };

/**
 * The fields below Fair: everything else (identity, voice, home, the shape of the
 * ladder and the watch rules) is locked. Guard rails keep a status meaningful: the
 * crisis level is 1.5× the issue level, so an issue multiple of 4 already means crisis
 * at 6×; under 20 comments a day a status is noise.
 */
export const POLICIES: Record<string, Policy> = {
  "alert.negative_multiple": { who: "company", check: num(1.5, 4) },
  "alert.min_comments": { who: "company", check: int(20, 2000) },
  "alert.baseline_days": { who: "company", check: int(14, 90) },
  "alert.crisis_multiple": { who: "company", check: num(2, 6) },
  "alert.crisis_min_negative": { who: "company", check: int(20, 2000) },
  "watch.underperform_pct": { who: "company", check: int(10, 90) },
  "watch.storm_negative": { who: "company", check: int(5, 1000) },
  "watch.min_account_posts": { who: "company", check: int(3, 30) },
  hero_title: { who: "company", check: text(120) },
  hero_intro: { who: "company", check: text(600) },
  suggested: { who: "company", check: texts(6, 200) },
  house_rules: { who: "company", check: texts(20, 300) },
  nav: { who: "company", check: subsetOf((f) => f.nav.filter((k) => NAV_KEYS.includes(k)), ["dashboard", "chats"]) },
  deck_templates: { who: "company", check: subsetOf((f) => (f.deck_templates.length ? f.deck_templates : templateKeysFor(f.id))) },
  skill_order: { who: "company", check: subsetOf(() => SKILL_LAYERS) },
  "tiles.hidden": { who: "company", check: hiddenSections },
  "tiles.names": { who: "company", check: sectionNames },
  "tiles.order": { who: "member", check: sectionOrder },
  "prefs.days": { who: "member", check: oneOf([7, 14, 30, 90]) },
  "prefs.answer": { who: "member", check: oneOf(["short", "full"] as const) },
};

/** may this layer change this path? a company may also set a member field as everyone's default */
export function allowed(path: string, layer: Layer): boolean {
  const p = POLICIES[path];
  return !!p && (layer === "company" || p.who === "member");
}

function setPath(o: Record<string, unknown>, path: string, v: unknown) {
  const keys = path.split(".");
  let cur = o;
  for (const k of keys.slice(0, -1)) {
    const next = cur[k];
    cur[k] = next && typeof next === "object" && !Array.isArray(next) ? { ...(next as object) } : {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[keys.at(-1)!] = v;
}

export type Resolved = { role: RoleModel; dropped: { layer: Layer; path: string; why: "locked" | "invalid" }[] };

/**
 * Fair's version, then the company's changes, then the person's: each change applies only
 * where its layer may change the field and the value keeps the guard rails; the rest is
 * reported and left out. A role's own ids that the code no longer knows are dropped too.
 */
export function resolve(fair: RoleModel, company?: Overrides | null, member?: Overrides | null): Resolved {
  const out = structuredClone(fair) as RoleModel & Record<string, unknown>;
  const dropped: Resolved["dropped"] = [];
  out.nav = out.nav.filter((k): k is NavKey => NAV_KEYS.includes(k));
  out.skill_order = out.skill_order?.filter((l) => (SKILL_LAYERS as readonly string[]).includes(l));
  out.deck_templates = out.deck_templates.filter((k) => DECK_TEMPLATE_KEYS.includes(k) || (out.template_defs ?? []).some((d) => d.key === k));
  for (const [layer, changes] of [["company", company], ["member", member]] as const) {
    for (const [path, value] of Object.entries(changes ?? {})) {
      if (!allowed(path, layer)) {
        dropped.push({ layer, path, why: "locked" });
        continue;
      }
      // a nested value only exists where Fair's role has that block (a PR role has no watch rules)
      const head = path.split(".")[0];
      if (path.includes(".") && head !== "prefs" && head !== "tiles" && !(out[head] && typeof out[head] === "object")) {
        dropped.push({ layer, path, why: "locked" });
        continue;
      }
      const v = POLICIES[path].check(value, fair);
      if (v === undefined) {
        dropped.push({ layer, path, why: "invalid" });
        continue;
      }
      setPath(out, path, v);
    }
  }
  // the crisis level always sits above the issue level, whatever the two layers set
  if (out.alert?.crisis_multiple != null && out.alert.crisis_multiple < out.alert.negative_multiple * 1.25) {
    dropped.push({ layer: "company", path: "alert.crisis_multiple", why: "invalid" });
    delete out.alert.crisis_multiple;
  }
  return { role: out, dropped };
}

/** keep only what a layer may set, e.g. before saving a change */
export function sanitize(changes: Overrides, layer: Layer, fair: RoleModel): Overrides {
  const ok: Overrides = {};
  for (const [path, value] of Object.entries(changes)) {
    if (!allowed(path, layer)) continue;
    const v = POLICIES[path].check(value, fair);
    if (v !== undefined) ok[path] = v;
  }
  return ok;
}

/** What each changeable field is, in words a Builder (and CeMO in Builder mode) reads; the range is the guard rail. */
export const POLICY_HELP: Record<string, { label: string; range: string; roles?: string[] }> = {
  "alert.negative_multiple": { label: "Issue level: a day's negative share against its norm", range: "1.5× to 4×", roles: ["pr"] },
  "alert.crisis_multiple": { label: "Crisis level (must sit at least 1.25× above the issue level)", range: "2× to 6×; unset = 1.5× the issue level", roles: ["pr"] },
  "alert.crisis_min_negative": { label: "Negative comments a day needs before it can be a crisis", range: "20 to 2000; unset = the comment floor", roles: ["pr"] },
  "alert.min_comments": { label: "Comments a day needs before it gets a status", range: "20 to 2000", roles: ["pr"] },
  "alert.baseline_days": { label: "Days the norm is read over", range: "14 to 90", roles: ["pr"] },
  "watch.underperform_pct": { label: "A post needs attention when it is this far below its account's usual", range: "10% to 90%", roles: ["social"] },
  "watch.storm_negative": { label: "Negative comments that make a comment storm", range: "5 to 1000", roles: ["social"] },
  "watch.min_account_posts": { label: "Measured posts an account needs before it is judged", range: "3 to 30", roles: ["social"] },
  hero_title: { label: "Chats' welcome title", range: "up to 120 characters; {{client}} is the client brand" },
  hero_intro: { label: "Chats' welcome text", range: "up to 600 characters" },
  suggested: { label: "Suggested questions on Chats' first screen", range: "up to 6, each up to 200 characters" },
  nav: { label: "Places in the sidebar, in order", range: "from the role's own; Dashboard and Chats stay" },
  deck_templates: { label: "Fair's deck templates on offer, in order", range: "from the role's own" },
  skill_order: { label: "Which kinds of analysis come first in the composer's menu", range: "audience, brands, comments, conversation, creators, posts" },
  "tiles.hidden": { label: "Dashboard sections hidden for everyone", range: "section ids; at least two stay; [] shows all" },
  "tiles.names": { label: "Dashboard sections renamed for everyone", range: "{ section id: new title up to 40 characters }" },
  "tiles.order": { label: "Dashboard sections in order (each person may also set their own)", range: "every section id, once each" },
  "prefs.days": { label: "Default window on the Dashboard", range: "7, 14, 30 or 90 days" },
  "prefs.answer": { label: "How long CeMO's answers are", range: "short or full" },
};

/** the fields a company may change on this role, in the order above */
export function companyPaths(fair: RoleModel): string[] {
  return Object.keys(POLICY_HELP).filter((p) => p !== "house_rules" && allowed(p, "company") && (!POLICY_HELP[p].roles || POLICY_HELP[p].roles!.includes(fair.id)));
}

/** the value a resolved role holds at a dotted path */
export function valueAt(role: RoleModel, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), role);
}
