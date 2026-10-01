/** What the Scheduled tab offers: the workspace's brands, a starting contract, and the weeks a report can be run for. */
import paragon from "../../data/weekly/paragon.json";
import type { ClientContract as WeeklyContract } from "../competitor/contract";
import { latestCompleteWeek } from "../dashboard/period";
import { addDays, isoWeek, weekLabel } from "../competitor/weeks";
import { SkillDb } from "../skills/db";
import { loadContext } from "../skills/params";

/** Starting points for a new Weekly Competitor Pulse, by workspace (the first client's contract). */
const TEMPLATES: WeeklyContract[] = [paragon as WeeklyContract];

export async function scheduleOptions(workspaceId: string): Promise<{ brands: { id: string; name: string }[]; template: WeeklyContract | null; weeks: { key: string; label: string }[] }> {
  const ctx = await loadContext(new SkillDb(), workspaceId);
  const last = latestCompleteWeek(ctx.asOf);
  const weeks = Array.from({ length: 12 }, (_, i) => addDays(last, -7 * i)).filter((m) => m >= ctx.earliest.slice(0, 10) || addDays(m, 6) >= ctx.earliest).map((m) => ({ key: m, label: `${isoWeek(m)} · ${weekLabel(m)}` }));
  return {
    brands: ctx.brands.map((b) => ({ id: b.id, name: b.name })).sort((a, b) => a.name.localeCompare(b.name)),
    template: TEMPLATES.find((t) => t.workspace === workspaceId) ?? null,
    weeks,
  };
}
