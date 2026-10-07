/**
 * What a team makes (src/company/creations.ts). GET: this team's creations (?status=waiting
 * for a Builder's inbox). POST { action, id?, kind?, input?, note?, from_deck? }:
 *   make       a new draft (kind + input, or a deck saved as a template with from_deck); `live` adds a Builder's at once
 *   add | submit | approve | send_back | reject | remove | restore | discard   move one along
 * Every rule (who may, guard rails, limits) is checked in the store, never trusted from here.
 */
import { currentActor, currentRole, currentWorkspaceId } from "@/auth/current";
import { can } from "@/auth/can";
import { actOn, getCreation, isCreationKind, listCreations, makeCreation, type CreationAction, type CreationStatus } from "@/company/creations";
import { getDeck } from "@/decks/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS: CreationAction[] = ["add", "submit", "approve", "send_back", "reject", "remove", "restore", "discard"];
const no = (error: string, status = 400) => Response.json({ error }, { status });

export async function GET(req: Request) {
  const [actor, ws] = await Promise.all([currentActor(), currentWorkspaceId()]);
  if (!actor) return no("unauthorised", 401);
  const role = await currentRole(ws);
  if (!can(actor, "role.use", { workspace: ws, role: role.id })) return no("forbidden", 403);
  const sp = new URL(req.url).searchParams;
  const id = sp.get("id");
  if (id) {
    // one creation, for a card in the thread: the maker's own, or any for a Builder of its team
    const c = await getCreation(id, ws);
    if (!c || (c.maker_email !== actor.email && c.status !== "approved" && !can(actor, "company.change", { workspace: ws, role: c.role }))) return no("Not found.", 404);
    return Response.json({ creation: c });
  }
  const status = sp.get("status");
  const list = await listCreations(ws, { role: role.id, status: status ? (status.split(",") as CreationStatus[]) : undefined });
  // a Member sees the team's live creations and their own; a Builder sees everything on the team
  const builder = can(actor, "company.change", { workspace: ws, role: role.id });
  return Response.json({ creations: builder ? list : list.filter((c) => c.status === "approved" || c.maker_email === actor.email) });
}

export async function POST(req: Request) {
  const [actor, ws] = await Promise.all([currentActor(), currentWorkspaceId()]);
  if (!actor) return no("unauthorised", 401);
  const b = (await req.json().catch(() => ({}))) as { action?: string; id?: string; kind?: string; input?: Record<string, unknown>; note?: string; live?: boolean; from_deck?: string };
  if (b.action === "make") {
    const role = await currentRole(ws);
    let input = b.input && typeof b.input === "object" ? b.input : {};
    let kind = b.kind;
    if (b.from_deck) {
      // "Save as template": the deck's own slides and grain, under a new name
      const deck = await getDeck(String(b.from_deck), ws);
      if (!deck) return no("No such deck.", 404);
      const sp = deck.spec;
      kind = "deck_template";
      input = { name: input.name ?? `${deck.name} template`, description: input.description ?? `Saved from the deck "${deck.name}".`, from: deck.template, grain: sp.grain, recurring: deck.recurring, slides: sp.rep?.slides ?? sp.social?.slides ?? sp.slides, findings: (sp.findings ?? []).filter((f) => f.skill.startsWith("recipe:")) };
    }
    if (!isCreationKind(kind)) return no("Unknown kind.");
    const r = await makeCreation(actor, { ws, role: role.id, kind, input, live: !!b.live });
    return r.ok ? Response.json(r) : no(r.error);
  }
  if (!ACTIONS.includes(b.action as CreationAction) || !b.id) return no("Unknown action.");
  const r = await actOn(actor, b.id, ws, b.action as CreationAction, b.note ?? null);
  return r.ok ? Response.json(r) : no(r.error, 403);
}
