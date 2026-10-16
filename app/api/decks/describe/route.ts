/**
 * POST { text }: CeMO lays out a deck from what the person wrote (src/decks/describe.ts): a template, the brands,
 * how often, the slides and the team's analyses, with at most two new slides drafted and kept as the team's
 * skills. The New deck form takes the draft; nothing is made until the person creates the deck.
 */
import { currentActor, currentRole, currentWorkspaceId } from "@/auth/current";
import { can } from "@/auth/can";
import { describeDeck } from "@/decks/describe";
import { deckOptions } from "@/decks/page";
import { deckWorkspace } from "@/pulses/api";
import { currentBrand } from "@/brand/current";
import { fairBadge } from "@/brand/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(req: Request) {
  const [actor, ws] = await Promise.all([currentActor(), currentWorkspaceId()]);
  if (!actor) return Response.json({ error: "unauthorised" }, { status: 401 });
  if (!(await deckWorkspace(ws))) return Response.json({ error: "Decks are not available on this workspace yet." }, { status: 400 });
  const role = await currentRole(ws);
  if (!can(actor, "role.use", { workspace: ws, role: role.id })) return Response.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { text?: unknown };
  const options = await deckOptions(ws, role, actor.email, fairBadge(await currentBrand()));
  const family = role.id === "pr" ? "reputation" : role.id === "social" ? "social" : "brand";
  const r = await describeDeck(ws, role.id, options, typeof b.text === "string" ? b.text : "", actor, family);
  return r.ok ? Response.json(r.draft) : Response.json({ error: r.error }, { status: 400 });
}
