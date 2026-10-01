/**
 * What a client's weekly report watches: their own brands (reported as a
 * portfolio, in the appendix) and the competitors that fill the report. Kept as
 * a contract file for now (data/weekly/<client>.json); the dashboard will store
 * the same shape in `workspaces.settings.weekly` so an owner can edit it.
 *
 * A deck (DECISIONS, 2 Oct 2026) is the same contract with a grain (week or
 * month), the slides it carries, and an optional client: a deck without one
 * reports on the watchlist alone.
 */
import type { WeeklyRules } from "../config/weekly";
import type { Grain } from "./period";
import type { SlideKind } from "./slides";
import type { Group, Platform } from "./types";

export type ContractClient = { name: string; brands: { name: string; brand_ids: string[] }[] };

export type WeeklyContract = {
  title?: string;
  workspace: string;
  /** the weekly report always has one; a deck may not */
  client?: ContractClient | null;
  watchlist: { name: string; short?: string; group: "core" | "when_relevant"; brand_ids: string[]; untracked?: string[] }[];
  platforms?: Platform[];
  rules?: Partial<WeeklyRules>;
  /** week by default */
  grain?: Grain;
  /** a deck's slides; absent for the weekly report, which carries its fixed set */
  slides?: SlideKind[];
};

/** The weekly report's contract: the client is always there. */
export type ClientContract = WeeklyContract & { client: ContractClient };

/** A client named with at least one brand. */
export function contractHasClient(c: Pick<WeeklyContract, "client">): c is { client: ContractClient } {
  return !!c.client?.name && Array.isArray(c.client.brands) && c.client.brands.length > 0;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function contractGroups(c: WeeklyContract): { watchlist: Group[]; portfolio: Group; clientBrands: Group[] } {
  // the weekly report needs its client; a deck says it has none by leaving the client out
  const client = c.client ?? (c.slides ? { name: "", brands: [] } : null);
  if (!client || (c.client && !contractHasClient(c))) throw new Error("contract: client.name and client.brands are required");
  if (!Array.isArray(c.watchlist) || !c.watchlist.length) throw new Error("contract: watchlist is empty");
  const watchlist: Group[] = c.watchlist.map((w) => ({
    key: slug(w.short ?? w.name),
    name: w.name,
    short: w.short,
    kind: w.group === "when_relevant" ? "when_relevant" : "core",
    brand_ids: w.brand_ids ?? [],
    untracked: w.untracked,
  }));
  const clientBrands: Group[] = client.brands.map((b) => ({ key: `client-${slug(b.name)}`, name: b.name, kind: "client_brand", brand_ids: b.brand_ids }));
  const portfolio: Group = { key: "client-portfolio", name: client.name ? `${client.name} portfolio` : "", kind: "client", brand_ids: clientBrands.flatMap((b) => b.brand_ids) };
  const keys = new Set<string>();
  for (const g of [...watchlist, ...clientBrands, portfolio]) {
    if (keys.has(g.key)) throw new Error(`contract: duplicate name ${g.name}`);
    keys.add(g.key);
  }
  return { watchlist, portfolio, clientBrands };
}
