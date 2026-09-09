/** PATCH /api/runs/[id]/pane { state } stores the pane's cosmetic state (sort, filter, exclusions) for a run. */
import { DEFAULT_WORKSPACE_ID } from "@/config/thresholds";
import { currentSession } from "@/auth/current";
import { getSkillRun, setPaneState } from "@/chat/persist";
import type { PaneState } from "@/chat/pane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f-]{36}$/;

function clean(raw: unknown): PaneState {
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: PaneState = {};
  const sort = s.sort as { key?: unknown; dir?: unknown } | null | undefined;
  out.sort = sort && typeof sort.key === "string" ? { key: sort.key.slice(0, 64), dir: sort.dir === "asc" ? "asc" : "desc" } : null;
  out.filter = typeof s.filter === "string" ? s.filter.slice(0, 120) : "";
  out.excluded = Array.isArray(s.excluded) ? s.excluded.filter((x): x is string => typeof x === "string").slice(0, 5000) : [];
  return out;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!(await currentSession())) return Response.json({ error: "unauthorised" }, { status: 401 });
  if (!UUID.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  const run = await getSkillRun(id, DEFAULT_WORKSPACE_ID);
  if (!run) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ state: run.pane_state ?? {} });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!(await currentSession())) return Response.json({ error: "unauthorised" }, { status: 401 });
  if (!UUID.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { state?: unknown };
  const state = clean(body.state);
  const ok = await setPaneState(id, DEFAULT_WORKSPACE_ID, state);
  return ok ? Response.json({ state }) : Response.json({ error: "not found" }, { status: 404 });
}
