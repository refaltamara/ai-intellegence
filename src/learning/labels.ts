/**
 * Plain words for the learning loop's keys: a creation's shape, an analysis's place in the
 * composer, an ordinal. Pure.
 */
import { registry } from "../skills/registry";
import type { RoleModel } from "../roles/model";
import { DECK_TEMPLATES } from "../decks/templates";

const ENTITY: Record<string, string> = { posts: "posts", comments: "comments", creators: "creators" };
const DIM: Record<string, string> = { total: "in total", brand_id: "by brand", platform: "by platform", topic: "by topic", sentiment: "by sentiment", day: "by day", week: "by week", month: "by month", ext: "by one of their own fields", creator_id: "by creator", tier: "by tier", source: "by owned or earned" };

export function shapeLabel(shape: string): string {
  const [head, a, b] = shape.split(".");
  switch (head) {
    case "skill": {
      const groups = (b ?? "total").split("-").map((g) => DIM[g] ?? `by ${g.replace(/_/g, " ")}`).join(" and ");
      return `a skill over ${ENTITY[a] ?? a} ${groups}`;
    }
    case "deck": {
      const t = DECK_TEMPLATES.find((x) => x.key === a);
      return a === "scratch" ? "a deck template made from scratch" : `a deck template from "${t?.name ?? a}"`;
    }
    case "rule": return a === "other" ? "house rules" : `house rules about ${a}`;
    case "fact": return "memory facts";
    case "term": return "vocabulary";
    case "extension": return `a data extension on ${a} ${b === "cemo" ? "filled by CeMO" : b === "file" ? "from a file" : b === "rule" ? "filled by rules" : ""}`.trim();
    default: return shape;
  }
}

export const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

/**
 * Where an analysis sits in the composer's list ("/" or "+"): the role's own analyses first,
 * then Fair's skills, the role's layers first (src/skills/team.ts). 1-based; null when the
 * composer does not list it.
 */
export function composerPosition(role: Pick<RoleModel, "recipes" | "skill_order">, key: string): number | null {
  const order = role.skill_order ?? [];
  const rank = (layer: string) => (order.length ? (order.indexOf(layer) + order.length + 1) % (order.length + 1) : 0);
  const skills = [...registry.skills].sort((x, y) => rank(x.layer) - rank(y.layer)).map((s) => s.name);
  const menu = [...(role.recipes ?? []), ...skills];
  const i = menu.indexOf(key);
  return i < 0 ? null : i + 1;
}

export const pct = (n: number, d: number) => (d > 0 ? Math.round((100 * n) / d) : 0);
