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

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ws = await currentWorkspaceId();
  const [cfg, role] = await Promise.all([getWorkspace(ws), currentRole(ws)]);
  // a one-person profile keeps its crisis view; a PR team on a brand panel gets the reputation dashboard
  if (cfg?.kind === "profile") {
    const d = await pulsePage(ws);
    if (!d) redirect("/data");
    return <PulsePage d={d} />;
  }
  const sp = await searchParams;
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
  const view: DashLayout = { layout: arrange(role.id, role.tiles, sp.show === "all"), builder: !!actor && can(actor, "company.change", { workspace: ws, role: role.id }), codename: role.codename, clientName, showHref: `/dashboard?${q}`, alert: role.alert };
  if (role.id === "social") {
    const d = await socialDashboard(ws, sp, role);
    if (!d) redirect("/data");
    return <SocialDashboard d={d} client={cfg?.client_brand_id ?? null} view={view} />;
  }
  if (role.id === "pr") {
    const d = await prDashboard(ws, sp, role);
    if (!d) redirect("/data");
    return <PrDashboard d={d} client={cfg?.client_brand_id ?? null} view={view} />;
  }
  const ctx = await loadContext(new SkillDb(), ws);
  const cq = readContentQuery(sp);
  const [d, posts] = await Promise.all([dashboardData(ws, sp), content(ctx, readFilters(sp, ctx), cq)]);
  return <Dashboard d={d} content={posts} cq={cq} view={view} />;
}

async function clientBrandName(ws: string, id: string): Promise<string | null> {
  const r = (await sql.query("select name from brands where workspace_id = $1 and id = $2", [ws, id])) as { name: string }[];
  return r[0]?.name ?? null;
}
