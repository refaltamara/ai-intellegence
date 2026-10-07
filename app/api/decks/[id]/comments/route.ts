/** GET ?report=<id>: a version's slide comments. POST { report_id, slide, text }: comment; @CeMO gets a reply (src/decks/comments.ts). */
import { currentActor, currentWorkspaceId } from "@/auth/current";
import { addComment, listComments } from "@/decks/comments";
import { getDeck } from "@/decks/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const [actor, ws, { id }] = await Promise.all([currentActor(), currentWorkspaceId(), ctx.params]);
  if (!actor) return Response.json({ error: "unauthorised" }, { status: 401 });
  if (!(await getDeck(id, ws))) return Response.json({ error: "not found" }, { status: 404 });
  const report = new URL(req.url).searchParams.get("report") ?? "";
  return Response.json({ comments: await listComments(ws, report) });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const [actor, ws, { id }] = await Promise.all([currentActor(), currentWorkspaceId(), ctx.params]);
  if (!actor) return Response.json({ error: "unauthorised" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { report_id?: unknown; slide?: unknown; text?: unknown };
  const r = await addComment(actor, ws, id, { report_id: String(b.report_id ?? ""), slide: Number(b.slide) || 1, text: String(b.text ?? "") });
  return r.ok ? Response.json({ comments: r.comments }) : Response.json({ error: r.error }, { status: 400 });
}
