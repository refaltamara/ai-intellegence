/** Server-side context the evidence pane needs on a thread page: brands and months for "Refine", and each run's stored pane state. */
import { DEFAULT_WORKSPACE_ID } from "@/config/thresholds";
import { paneStates, type MessageRow } from "@/chat/persist";
import type { PaneState } from "@/chat/pane";
import { sql } from "@/db/client";
import { SkillDb } from "@/skills/db";
import { loadContext } from "@/skills/params";

export type PaneContext = { brands: { id: string; name: string; hint?: string }[]; months: string[]; paneStates: Record<string, PaneState> };

export async function paneContext(messages: MessageRow[], workspaceId = DEFAULT_WORKSPACE_ID): Promise<PaneContext> {
  const runIds = messages.flatMap((m) => m.skill_run_ids ?? []);
  const [ctx, monthRows, states] = await Promise.all([
    loadContext(new SkillDb(), workspaceId),
    sql.query("select to_char(month, 'YYYY-MM') as m from posts where workspace_id = $1 group by month order by month", [workspaceId]) as unknown as Promise<{ m: string }[]>,
    paneStates(runIds, workspaceId).catch(() => ({} as Record<string, PaneState>)),
  ]);
  return { brands: ctx.brands.map((b) => ({ id: b.id, name: b.name, hint: b.is_client ? "your brand" : undefined })), months: monthRows.map((r) => r.m), paneStates: states };
}
