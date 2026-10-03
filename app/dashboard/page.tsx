/**
 * Dashboard (DECISIONS, 30 Sep 2026): the fixed view each team checks every day.
 * The role decides (src/roles/model.ts): Brand & KOL gets brand rankings, tiers,
 * mentions, creators and content; PR gets the reputation dashboard
 * (src/reputation/); a one-person profile keeps the crisis view that used to be Pulse.
 */
import { redirect } from "next/navigation";
import { currentRole, currentWorkspaceId } from "@/auth/current";
import { prDashboard } from "@/reputation/dashboard";
import { PrDashboard } from "@/ui/reputation/PrDashboard";
import { content, dashboardData, loadContext, readContentQuery, readFilters } from "@/dashboard/data";
import { pulsePage } from "@/pulse/page";
import { SkillDb } from "@/skills/db";
import { Dashboard } from "@/ui/dashboard/Dashboard";
import { PulsePage } from "@/ui/PulsePage";
import { getWorkspace } from "@/workspace/store";

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
  if (role.id === "pr") {
    const d = await prDashboard(ws, sp, role);
    if (!d) redirect("/data");
    return <PrDashboard d={d} client={cfg?.client_brand_id ?? null} />;
  }
  const ctx = await loadContext(new SkillDb(), ws);
  const cq = readContentQuery(sp);
  const [d, posts] = await Promise.all([dashboardData(ws, sp), content(ctx, readFilters(sp, ctx), cq)]);
  return <Dashboard d={d} content={posts} cq={cq} />;
}
