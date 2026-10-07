/**
 * POST { text }: CeMO drafts a slide from a sentence and tries it on the newest week (src/decks/slideDraft.ts).
 * POST { save: recipe }: keep the draft as a team skill; the page then puts it on the deck.
 */
import { currentActor, currentRole, currentWorkspaceId } from "@/auth/current";
import { can } from "@/auth/can";
import { draftSlide, saveSlide } from "@/decks/slideDraft";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const [actor, ws] = await Promise.all([currentActor(), currentWorkspaceId()]);
  if (!actor) return Response.json({ error: "unauthorised" }, { status: 401 });
  const role = await currentRole(ws);
  if (!can(actor, "role.use", { workspace: ws, role: role.id })) return Response.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { text?: unknown; save?: unknown };
  if (b.save) {
    const r = await saveSlide(ws, role.id, b.save, actor);
    return r.ok ? Response.json(r) : Response.json({ error: r.error }, { status: 400 });
  }
  const r = await draftSlide(ws, role.id, typeof b.text === "string" ? b.text : "", actor);
  return r.ok ? Response.json(r.draft) : Response.json({ error: r.error }, { status: 400 });
}
