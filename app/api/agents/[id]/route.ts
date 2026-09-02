import { DEFAULT_WORKSPACE_ID } from "@/config/thresholds";
import { nextRunAt, humanize, validateCron } from "@/agents/schedule";
import { deleteAgent, getAgent, listRuns, updateAgent } from "@/agents/store";
import { getSkill } from "@/skills/registry";
import { validateParams } from "@/skills/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  const agent = await getAgent(id, DEFAULT_WORKSPACE_ID);
  if (!agent) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ ...agent, runs: await listRuns(id, 20) });
}

/** PATCH { status?, name?, params?, schedule?, delivery?, only_if_changed?, diff_config? } */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  const agent = await getAgent(id, DEFAULT_WORKSPACE_ID);
  if (!agent) return Response.json({ error: "not found" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as Record<string, any>;
  const patch: Parameters<typeof updateAgent>[2] = {};
  if (typeof b.name === "string") patch.name = b.name.slice(0, 120);
  if (b.params) {
    try {
      patch.params = validateParams(getSkill(agent.skill)!, b.params);
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 400 });
    }
  }
  const cron = b.schedule?.cron ?? agent.schedule_cron;
  const tz = b.schedule?.tz ?? agent.schedule_tz;
  if (b.schedule) {
    const err = validateCron(cron);
    if (err) return Response.json({ error: `invalid cron: ${err}` }, { status: 400 });
    patch.schedule_cron = cron;
    patch.schedule_tz = tz;
    patch.schedule_human = b.schedule.human ?? humanize(cron, tz);
  }
  if (b.delivery) patch.delivery = { ...agent.delivery, ...b.delivery, channels: Array.from(new Set<string>([...(b.delivery.channels ?? agent.delivery.channels ?? []), "in_app"])) };
  if (typeof b.only_if_changed === "boolean") patch.only_if_changed = b.only_if_changed;
  if (b.diff_config) patch.diff_config = b.diff_config;
  if (b.status && ["active", "paused", "draft"].includes(b.status)) patch.status = b.status;
  const status = patch.status ?? agent.status;
  if (b.schedule || b.status) patch.next_run_at = status === "active" ? nextRunAt(cron, tz).toISOString() : null;
  const updated = await updateAgent(id, DEFAULT_WORKSPACE_ID, patch);
  return Response.json(updated);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  const ok = await deleteAgent(id, DEFAULT_WORKSPACE_ID);
  return Response.json({ ok }, { status: ok ? 200 : 404 });
}
