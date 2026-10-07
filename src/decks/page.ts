/** What the Decks pages need from the server: the brands, the templates, the slide library, the periods, and a watchlist to start from. */
import paragon from "../../data/weekly/paragon.json";
import type { WeeklyContract } from "../competitor/contract";
import { SLIDES } from "../competitor/slides";
import { SkillDb } from "../skills/db";
import { loadContext } from "../skills/params";
import { deckPeriods } from "./generate";
import { brandLabel, type DeckSpec } from "./spec";
import { templatesFor, type DeckTemplate } from "./templates";
import { companyRecipes, companyTemplates } from "../company/creations";
import { recipesFor } from "../recipes/store";
import { BRAND_KOL, type RoleModel } from "../roles/model";
import { REP_SLIDES } from "../reputation/slides";
import { SOCIAL_SLIDES } from "../social/slides";

export type DeckOptions = {
  brands: { id: string; name: string }[];
  /** Fair's (badge "Fair") and the team's own (badge: the client's name; by: who made it) */
  templates: (DeckTemplate & { badge?: string; by?: string })[];
  slides: { kind: string; title: string; description: string; pages: string; required?: boolean; needs?: string }[];
  periods: { day: { key: string; label: string }[]; week: { key: string; label: string }[]; month: { key: string; label: string }[] };
  /** the workspace's client brand, offered (not set) as the client */
  client: { name: string; brand_ids: string[] } | null;
  /** the Weekly Competitor Pulse's watchlist and client, when this team has one */
  starter: { label: string; client: DeckSpec["client"]; watchlist: DeckSpec["watchlist"] } | null;
  data_through: string;
  /** the first day the data covers (the earliest a chosen day may be) */
  data_from: string;
  /** PR decks: their slide library, the platforms the workspace holds, the brand they are about by default */
  rep_slides: { kind: string; title: string; description: string }[];
  social_slides: { kind: string; title: string; description: string }[];
  platforms: string[];
  focus: string | null;
  /** analyses a Brand & KOL deck can carry as findings: Fair's recipes for the role, then the team's own skills */
  team_skills: { key: string; title: string; description: string; badge: string; by?: string }[];
};

const STARTERS: WeeklyContract[] = [paragon as WeeklyContract];

/** The templates a team starts from: Fair's in the order its role (and company) asks, then the team's own, badged. */
async function teamTemplates(workspaceId: string, role: RoleModel, email: string | null, client: string | null): Promise<DeckOptions["templates"]> {
  // the code's templates, and those Fair adopted from clients into this role version
  const fair = [...templatesFor(role.id), ...(role.template_defs ?? []).filter((t) => !templatesFor(role.id).some((c) => c.key === t.key))];
  const order = role.deck_templates?.length ? role.deck_templates : fair.map((t) => t.key);
  const ours = fair.filter((t) => order.includes(t.key)).sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key)).map((t) => ({ ...t, badge: "Fair" }));
  const own = await companyTemplates(workspaceId, role.id, email).catch(() => []);
  return [...ours, ...own.map((t) => ({ ...t, badge: t._creation.status === "approved" ? client ?? "Your team" : "Yours, not shared yet", by: t._creation.maker }))];
}

export async function deckOptions(workspaceId: string, role: RoleModel = BRAND_KOL, email: string | null = null): Promise<DeckOptions> {
  const ctx = await loadContext(new SkillDb(), workspaceId);
  const [day, week, month] = await Promise.all([deckPeriods(workspaceId, "day", 14), deckPeriods(workspaceId, "week", 12), deckPeriods(workspaceId, "month", 6)]);
  const brands = ctx.brands.map((b) => ({ id: b.id, name: brandLabel(b.name) })).sort((a, b) => a.name.localeCompare(b.name));
  const own = ctx.clientBrandId ? brands.find((b) => b.id === ctx.clientBrandId) : null;
  const c = STARTERS.find((t) => t.workspace === workspaceId);
  const known = new Set(brands.map((b) => b.id));
  return {
    brands,
    templates: await teamTemplates(workspaceId, role, email, own?.name ?? null),
    slides: SLIDES.map((s) => ({ kind: s.kind, title: s.title, description: s.description, pages: s.pages, ...(s.required ? { required: true } : {}), ...(s.needs ? { needs: s.needs } : {}) })),
    periods: { day: day.map((p) => ({ key: p.key, label: p.label })), week: week.map((p) => ({ key: p.key, label: p.label })), month: month.map((p) => ({ key: p.key, label: p.label })) },
    client: own ? { name: own.name, brand_ids: [own.id] } : null,
    starter: c
      ? {
          label: `${c.title ?? "Weekly Competitor Pulse"} · ${c.client?.name ?? ""}`,
          client: c.client ? { name: c.client.name, brands: c.client.brands.map((b) => ({ name: b.name, brand_ids: b.brand_ids.filter((id) => known.has(id)) })).filter((b) => b.brand_ids.length) } : null,
          watchlist: c.watchlist.map((w) => ({ name: w.name, ...(w.short ? { short: w.short } : {}), group: w.group, brand_ids: w.brand_ids.filter((id) => known.has(id)) })).filter((w) => w.brand_ids.length),
        }
      : null,
    data_through: ctx.asOf,
    data_from: ctx.earliest.slice(0, 10),
    rep_slides: REP_SLIDES,
    social_slides: SOCIAL_SLIDES,
    platforms: (await new SkillDb().q<{ platform: string }>("select distinct platform from posts where workspace_id = $1 order by 1", [workspaceId])).map((r) => r.platform),
    focus: ctx.clientBrandId ?? brands[0]?.id ?? null,
    team_skills: [
      ...(await recipesFor(role.recipes).catch(() => [])).map((r) => ({ key: r.key, title: r.title, description: r.description, badge: "Fair" })),
      ...(await companyRecipes(workspaceId, role.id, email).catch(() => [])).filter((r) => r._creation.status === "approved").map((r) => ({ key: r.key, title: r.title, description: r.description, badge: own?.name ?? "Your team", by: r._creation.maker })),
    ],
  };
}
