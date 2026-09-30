/**
 * Dashboard (DECISIONS, 30 Sep 2026): the fixed view each team checks every day.
 * A category team (Brand & KOL) gets brand rankings, tiers, mentions, creators
 * and content; a profile team (PR) gets the crisis view that used to be Pulse.
 */
import { redirect } from "next/navigation";
import { currentWorkspaceId } from "@/auth/current";
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
  const cfg = await getWorkspace(ws);
  if (cfg?.kind === "profile") {
    const d = await pulsePage(ws);
    if (!d) redirect("/data");
    return <PulsePage d={d} />;
  }
  const sp = await searchParams;
  const ctx = await loadContext(new SkillDb(), ws);
  const cq = readContentQuery(sp);
  const [d, posts] = await Promise.all([dashboardData(ws, sp), content(ctx, readFilters(sp, ctx), cq)]);
  return <Dashboard d={d} content={posts} cq={cq} />;
}
