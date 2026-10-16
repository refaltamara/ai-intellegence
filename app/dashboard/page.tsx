/**
 * Dashboard (DECISIONS, 30 Sep 2026): the fixed view each team checks every day.
 * The role decides (src/roles/model.ts): Brand & KOL gets brand rankings, tiers,
 * mentions, creators and content; PR gets the reputation dashboard
 * (src/reputation/); Social Media gets its own accounts (src/social/); a one-person profile keeps the crisis view that used to be Pulse.
 */
import { redirect } from "next/navigation";
import { currentActor, currentRole, currentWorkspaceId } from "@/auth/current";
import { can } from "@/auth/can";
import { arrange, type DashLayout } from "@/dashboard/sections";
import { prDashboard } from "@/reputation/dashboard";
import { PrDashboard } from "@/ui/reputation/PrDashboard";
import { socialDashboard } from "@/social/dashboard";
import { SocialDashboard } from "@/ui/social/SocialDashboard";
import { content, dashboardData, loadContext, readContentQuery, readFilters } from "@/dashboard/data";
import { pulsePage } from "@/pulse/page";
import { SkillDb } from "@/skills/db";
import { Dashboard } from "@/ui/dashboard/Dashboard";
import { PulsePage } from "@/ui/PulsePage";
import { getWorkspace } from "@/workspace/store";
import { sql } from "@/db/client";
import { by, signal } from "@/learning/signals";
import { runTeamPanels, teamPanels, type PanelScope } from "@/dashboard/panels";
import { panelId } from "@/dashboard/panelSpec";
import { ROLE_VIEWS } from "@/definitions/catalog";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ws = await currentWorkspaceId();
  const [cfg, role] = await Promise.all([getWorkspace(ws), currentRole(ws)]);
  // a one-person profile keeps its crisis view until it moves onto the reputation dashboard (then the crisis view is Pulse)
  if (cfg?.kind === "profile" && !cfg.reputation) {
    const d = await pulsePage(ws);
    if (!d) redirect("/data");
    return <PulsePage d={d} />;
  }
  const sp = await searchParams;
  // the team's own panels (src/dashboard/panels.ts) sit among the sections and run over the Dashboard's filters
  const specsP = teamPanels(ws, role.id).catch(() => []);
  // the sections in the team's order, with what a Builder hid (Show brings them back for this view)
  const actor = await currentActor();
  const clientName = cfg?.client_brand_id ? (await clientBrandName(ws, cfg.client_brand_id)) : null;
  const q = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && k !== "show" ? [[k, v]] : [])));
  q.set("show", "all");
  // the learning loop counts the visit and which filters it carries (their names, never their values)
  const filters = [...q.keys()].filter((k) => k !== "show" && /^[a-z_]{1,24}$/.test(k));
  const ctxSig = by(actor, ws, role.id);
  await signal(ctxSig, "dashboard.view", { filtered: filters.length > 0 });
  for (const f of filters) await signal(ctxSig, "dashboard.filter", { filter: f });
  const specs = await specsP;
  const runPanels = (scope: PanelScope) => runTeamPanels(ws, role.id, scope, ROLE_VIEWS[role.id], specs);
  const view: DashLayout = { layout: arrange(role.id, role.tiles, sp.show === "all", specs.map((p) => ({ key: panelId(p.key), label: p.title, width: p.width }))), builder: !!actor && can(actor, "company.change", { workspace: ws, role: role.id }), codename: role.codename, clientName, showHref: `/dashboard?${q}`, alert: role.alert, crisis: cfg?.kind === "profile" && !!cfg.reputation };
  if (role.id === "social") {
    const d = await socialDashboard(ws, sp, role);
    if (!d) redirect("/data");
    const scope: PanelScope = { from: d.filters.from, to: d.filters.to, platform: d.filters.platform, brands: [d.filters.brand] };
    return <SocialDashboard d={d} client={cfg?.client_brand_id ?? null} view={{ ...view, scope, panels: await runPanels(scope) }} />;
  }
  if (role.id === "pr") {
    const d = await prDashboard(ws, sp, role);
    if (!d) redirect("/data");
    const scope: PanelScope = { from: d.filters.from, to: d.filters.to, platform: d.filters.platform, brands: [d.filters.brand] };
    return <PrDashboard d={d} client={cfg?.client_brand_id ?? null} view={{ ...view, scope, panels: await runPanels(scope) }} hide={cfg?.pr_hide ?? []} />;
  }
  const ctx = await loadContext(new SkillDb(), ws);
  const cq = readContentQuery(sp);
  const f = readFilters(sp, ctx);
  const scope: PanelScope = { from: f.period.from, to: f.period.to, platform: f.platform, brands: f.brands };
  const [d, posts, panels] = await Promise.all([dashboardData(ws, sp), content(ctx, f, cq), runPanels(scope)]);
  return <Dashboard d={d} content={posts} cq={cq} view={{ ...view, scope, panels }} />;
}

async function clientBrandName(ws: string, id: string): Promise<string | null> {
  const r = (await sql.query("select name from brands where workspace_id = $1 and id = $2", [ws, id])) as { name: string }[];
  return r[0]?.name ?? null;
}
