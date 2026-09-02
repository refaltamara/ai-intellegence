import { runSkill } from "@/skills/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST { params } -> SkillResult (persisted). Used by the Skills page and the discovery screen. */
export async function POST(req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { params?: Record<string, unknown> };
  const result = await runSkill({ skill: name, workspace_id: "", params: body.params ?? {}, actor: { user_id: "web", via: "api" } });
  return Response.json(result, { status: result.status === "error" ? 400 : 200 });
}
