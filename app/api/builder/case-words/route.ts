/**
 * The team's case words (src/company/caseWords.ts). GET: sister brands and boycott words with what
 * each matches. POST { list, action: add | remove | preview, name?, terms? }: a Builder changes them;
 * anyone on the team may preview what a word would match.
 */
import { currentActor, currentWorkspaceId } from "@/auth/current";
import { can } from "@/auth/can";
import { caseWords, changeCaseWords, type CaseWordsOp } from "@/company/caseWords";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [actor, ws] = await Promise.all([currentActor(), currentWorkspaceId()]);
  if (!actor) return Response.json({ error: "unauthorised" }, { status: 401 });
  if (!can(actor, "role.use", { workspace: ws, role: "pr" })) return Response.json({ error: "forbidden" }, { status: 403 });
  return Response.json(await caseWords(ws));
}

export async function POST(req: Request) {
  const [actor, ws] = await Promise.all([currentActor(), currentWorkspaceId()]);
  if (!actor) return Response.json({ error: "unauthorised" }, { status: 401 });
  if (!can(actor, "role.use", { workspace: ws, role: "pr" })) return Response.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as CaseWordsOp;
  const r = await changeCaseWords(actor, ws, b);
  return r.ok ? Response.json(r) : Response.json({ error: r.error }, { status: 400 });
}
