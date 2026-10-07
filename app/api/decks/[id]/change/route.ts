/**
 * POST { change, template?, preview?, from? }: change a deck (src/decks/changes.ts). `preview`
 * returns what would change without saving; `template` also changes the template it came from
 * (a Builder's goes live, a Member's waits for a Builder). Every rule is checked in the store.
 */
import { currentActor, currentWorkspaceId } from "@/auth/current";
import { applyDeckChange, cleanChange, previewDeckChange } from "@/decks/changes";
import { getDeck } from "@/decks/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const [actor, ws, { id }] = await Promise.all([currentActor(), currentWorkspaceId(), ctx.params]);
  if (!actor) return Response.json({ error: "unauthorised" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { change?: unknown; template?: unknown; preview?: unknown; from?: unknown };
  const change = cleanChange(b.change);
  if (b.preview === true) {
    const deck = await getDeck(id, ws);
    if (!deck) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json({ preview: await previewDeckChange(deck, change, actor.email) });
  }
  const from = b.from === "comment" || b.from === "form" ? b.from : "chat";
  const r = await applyDeckChange(actor, id, ws, change, { template: b.template === true, from });
  return r.ok ? Response.json({ deck: r.deck, preview: r.preview, template: r.template }) : Response.json({ error: r.error }, { status: 400 });
}
