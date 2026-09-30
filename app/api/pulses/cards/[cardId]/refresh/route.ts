/** POST: run a pinned analysis again with the parameters it was pinned with, and show the new result on the card. */
import { currentSession, currentWorkspaceId } from "@/auth/current";
import { getSkillRun } from "@/chat/persist";
import { getCard, updateCard } from "@/pulses/store";
import { runSkill } from "@/skills/runner";
import type { SkillResult } from "@/skills/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(_req: Request, ctx: { params: Promise<{ cardId: string }> }) {
  const [ws, session] = await Promise.all([currentWorkspaceId(), currentSession()]);
  const { cardId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(cardId)) return Response.json({ error: "bad id" }, { status: 400 });
  const card = await getCard(cardId, ws);
  if (!card || card.kind !== "skill" || !card.skill_run_id) return Response.json({ error: "not a pinned analysis" }, { status: 400 });
  const run = await getSkillRun(card.skill_run_id, ws);
  if (!run) return Response.json({ error: "the analysis behind this card is gone" }, { status: 404 });
  const prev = run.result as SkillResult;
  const result = await runSkill({ skill: run.skill, workspace_id: ws, params: prev.params_resolved ?? {}, actor: { user_id: session?.uid ?? "pulse", via: "api" } });
  if (result.status !== "ok" || !result.run_id) return Response.json({ error: result.message ?? `the analysis returned ${result.status}` }, { status: 422 });
  await updateCard(cardId, ws, { skillRunId: result.run_id });
  return Response.json({ ok: true, run_id: result.run_id, rows: result.rows.length });
}
