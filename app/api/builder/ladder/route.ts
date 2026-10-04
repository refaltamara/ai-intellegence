/**
 * "Why this level?" (src/reputation/replay.ts): GET ?brand=&negative_multiple=&min_comments=&crisis_multiple=&crisis_min_negative=&baseline_days=
 * replays the last 90 settled days under the team's rule and under the one being tried. PR teams only.
 */
import { currentActor, currentRole, currentWorkspaceId } from "@/auth/current";
import { can } from "@/auth/can";
import { ladderReplay } from "@/reputation/replay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const [actor, ws] = await Promise.all([currentActor(), currentWorkspaceId()]);
  if (!actor) return Response.json({ error: "unauthorised" }, { status: 401 });
  const role = await currentRole(ws);
  if (role.id !== "pr" || !can(actor, "role.use", { workspace: ws, role: role.id })) return Response.json({ error: "forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const num = (k: string) => (sp.get(k) != null && sp.get(k) !== "" && Number.isFinite(Number(sp.get(k))) ? Number(sp.get(k)) : undefined);
  const r = await ladderReplay(ws, role, sp.get("brand"), { negative_multiple: num("negative_multiple"), min_comments: num("min_comments"), crisis_multiple: num("crisis_multiple"), crisis_min_negative: num("crisis_min_negative"), baseline_days: num("baseline_days") });
  return r ? Response.json(r) : Response.json({ error: "No data." }, { status: 404 });
}
