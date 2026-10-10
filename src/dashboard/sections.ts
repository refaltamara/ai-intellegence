/**
 * The sections of each team's Dashboard, as ids (CMS plan, Compatibility): what a Builder
 * may hide, rename or move for the company ("Customise"), and what a person may reorder
 * for themselves. The status, the headline tiles and the filters stay where they are; the
 * sections below them follow the role's `tiles` (src/roles/policy.ts). Pure, so client
 * components may import it.
 */
import type { RoleId, RoleModel } from "../roles/model";

export type SectionDef = { key: string; label: string; width: "full" | "half" };

export const SECTIONS: Record<RoleId, SectionDef[]> = {
  pr: [
    { key: "issues", label: "Issues building", width: "full" },
    { key: "rising", label: "Rising now", width: "half" },
    { key: "amplifiers", label: "Amplifiers", width: "half" },
    { key: "narratives", label: "Narratives", width: "full" },
    { key: "voices", label: "Who is talking", width: "full" },
    { key: "own", label: "Own channels", width: "half" },
    { key: "service", label: "For customer service", width: "half" },
    { key: "competitive", label: "Competitive reputation", width: "full" },
    { key: "health", label: "Data health", width: "full" },
  ],
  social: [
    { key: "attention", label: "Needs attention", width: "full" },
    { key: "accounts", label: "Accounts", width: "full" },
    { key: "formats", label: "Formats", width: "half" },
    { key: "timing", label: "When to post", width: "half" },
    { key: "best", label: "Best posts", width: "half" },
    { key: "weakest", label: "Weakest posts", width: "half" },
    { key: "competitors", label: "Competitors' own channels", width: "full" },
    { key: "community", label: "Community", width: "full" },
    { key: "health", label: "Data health", width: "full" },
  ],
  brand_kol: [
    { key: "rankings", label: "Brand performance rankings", width: "full" },
    { key: "mix", label: "Viewership mix", width: "full" },
    { key: "tiers", label: "Creator tiers", width: "full" },
    { key: "trend", label: "Mentions over time", width: "full" },
    { key: "creators", label: "Top creators", width: "full" },
    { key: "content", label: "Trending content", width: "full" },
  ],
};

export const sectionKeys = (role: RoleId): string[] => SECTIONS[role].map((s) => s.key);

export type Tiles = { hidden?: string[]; order?: string[]; names?: Record<string, string> };

export type Arranged = { shown: (SectionDef & { title: string })[]; hidden: (SectionDef & { title: string })[]; all: (SectionDef & { title: string; hidden: boolean })[] };

/**
 * The sections in the order the role asks for (unknown ids dropped). A section the order
 * does not name, such as one a release added after the order was saved, goes right after
 * the section it follows by default, so it still shows where Fair put it. `show` brings
 * back what a Builder hid, for this view only.
 */
export function arrange(role: RoleId, tiles: Tiles | undefined, show = false): Arranged {
  const defs = SECTIONS[role];
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const order = [...new Set((tiles?.order ?? []).filter((k) => byKey.has(k)))];
  defs.forEach((d, i) => {
    if (!order.includes(d.key)) order.splice(i ? order.indexOf(defs[i - 1].key) + 1 : 0, 0, d.key);
  });
  const hidden = new Set((tiles?.hidden ?? []).filter((k) => byKey.has(k)));
  const all = order.map((k) => ({ ...byKey.get(k)!, title: tiles?.names?.[k]?.trim() || byKey.get(k)!.label }));
  return { shown: all.filter((s) => show || !hidden.has(s.key)), hidden: all.filter((s) => hidden.has(s.key)), all: all.map((s) => ({ ...s, hidden: hidden.has(s.key) })) };
}

/** Rows to lay out: two half-width sections next to each other share a row; a half alone takes the row. */
export function rows(shown: SectionDef[]): SectionDef[][] {
  const out: SectionDef[][] = [];
  for (let i = 0; i < shown.length; i++) {
    const s = shown[i];
    const next = shown[i + 1];
    if (s.width === "half" && next?.width === "half") {
      out.push([s, next]);
      i++;
    } else out.push([s]);
  }
  return out;
}

/** how the team has its Dashboard, and what this person may change there */
export type DashLayout = { layout: Arranged; builder: boolean; codename: string; clientName: string | null; showHref: string; alert?: RoleModel["alert"] };
