/**
 * What a client's weekly report watches: their own brands (reported as a
 * portfolio, in the appendix) and the competitors that fill the report. Kept as
 * a contract file for now (data/weekly/<client>.json); the dashboard will store
 * the same shape in `workspaces.settings.weekly` so an owner can edit it.
 */
import type { WeeklyRules } from "../config/weekly";
import type { Group, Platform } from "./types";

export type WeeklyContract = {
  title?: string;
  workspace: string;
  client: { name: string; brands: { name: string; brand_ids: string[] }[] };
  watchlist: { name: string; short?: string; group: "core" | "when_relevant"; brand_ids: string[]; untracked?: string[] }[];
  platforms?: Platform[];
  rules?: Partial<WeeklyRules>;
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function contractGroups(c: WeeklyContract): { watchlist: Group[]; portfolio: Group; clientBrands: Group[] } {
  if (!c.client?.name || !Array.isArray(c.client.brands) || !c.client.brands.length) throw new Error("contract: client.name and client.brands are required");
  if (!Array.isArray(c.watchlist) || !c.watchlist.length) throw new Error("contract: watchlist is empty");
  const watchlist: Group[] = c.watchlist.map((w) => ({
    key: slug(w.short ?? w.name),
    name: w.name,
    short: w.short,
    kind: w.group === "when_relevant" ? "when_relevant" : "core",
    brand_ids: w.brand_ids ?? [],
    untracked: w.untracked,
  }));
  const clientBrands: Group[] = c.client.brands.map((b) => ({ key: `client-${slug(b.name)}`, name: b.name, kind: "client_brand", brand_ids: b.brand_ids }));
  const portfolio: Group = { key: "client-portfolio", name: `${c.client.name} portfolio`, kind: "client", brand_ids: clientBrands.flatMap((b) => b.brand_ids) };
  const keys = new Set<string>();
  for (const g of [...watchlist, ...clientBrands, portfolio]) {
    if (keys.has(g.key)) throw new Error(`contract: duplicate name ${g.name}`);
    keys.add(g.key);
  }
  return { watchlist, portfolio, clientBrands };
}
