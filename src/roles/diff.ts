/** What a draft changes against the current release, in plain words for the proposal screen (CMS plan). Pure. */
import type { RoleModel } from "./model";

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const listDiff = (label: string, a: string[] = [], b: string[] = []) => {
  const added = b.filter((x) => !a.includes(x));
  const removed = a.filter((x) => !b.includes(x));
  const parts = [...added.map((x) => `+ ${x}`), ...removed.map((x) => `− ${x}`)];
  if (!parts.length && !same(a, b)) parts.push("reordered");
  return parts.length ? [`${label}: ${parts.join(", ")}`] : [];
};

export function diffRoles(from: RoleModel, to: RoleModel): string[] {
  const out: string[] = [];
  if (!same(from.voice, to.voice)) out.push("CeMO's voice on this team rewritten");
  if (!same(from.description, to.description)) out.push("Description changed");
  if (!same(from.hero_title, to.hero_title)) out.push(`Chats title: "${to.hero_title ?? "(workspace's own)"}"`);
  if (!same(from.hero_intro, to.hero_intro)) out.push("Chats intro rewritten");
  out.push(...listDiff("Suggested questions", from.suggested, to.suggested));
  out.push(...listDiff("Analyses (recipes)", from.recipes, to.recipes));
  out.push(...listDiff("Deck templates", from.deck_templates, to.deck_templates));
  out.push(...listDiff("Composer order", from.skill_order, to.skill_order));
  for (const block of ["alert", "watch"] as const) {
    const a = (from[block] ?? {}) as Record<string, number>;
    const b = (to[block] ?? {}) as Record<string, number>;
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (a[k] !== b[k]) out.push(`${block}.${k}: ${a[k] ?? "–"} → ${b[k] ?? "–"}`);
  }
  return out;
}
