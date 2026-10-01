/** GET one deck with its versions; PATCH { name?, spec?, recurring? }; DELETE the deck and every version. */
import { currentWorkspaceId } from "@/auth/current";
import { nextRun } from "@/decks/generate";
import { cleanSpec } from "@/decks/spec";
import { deckVersions, deleteDeck, getDeck, updateDeck } from "@/decks/store";
import { knownBrands } from "@/pulses/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const ws = await currentWorkspaceId();
  const { id } = await ctx.params;
  const deck = await getDeck(id, ws);
  if (!deck) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ deck, versions: await deckVersions(deck.id, ws) });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const ws = await currentWorkspaceId();
  const { id } = await ctx.params;
  const deck = await getDeck(id, ws);
  if (!deck) return Response.json({ error: "not found" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { name?: unknown; spec?: unknown; recurring?: unknown };
  let spec;
  if (b.spec !== undefined) {
    const s = cleanSpec(b.spec, await knownBrands(ws));
    if ("error" in s) return Response.json({ error: s.error }, { status: 400 });
    spec = s;
  }
  const recurring = typeof b.recurring === "boolean" ? b.recurring : undefined;
  const grain = (spec ?? deck.spec).grain;
  const turnedOn = recurring === true && !deck.recurring;
  const updated = await updateDeck(deck.id, ws, {
    name: typeof b.name === "string" && b.name.trim() ? b.name.trim().slice(0, 80) : undefined,
    spec,
    recurring,
    // a recurring deck looks again after the next period ends; switched off, it stops looking
    ...(recurring === false ? { next_run_at: null } : turnedOn || (spec && spec.grain !== deck.spec.grain && deck.recurring) ? { next_run_at: nextRun(grain) } : {}),
  });
  return Response.json({ deck: updated });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const ws = await currentWorkspaceId();
  const { id } = await ctx.params;
  const ok = await deleteDeck(id, ws);
  return Response.json({ ok }, { status: ok ? 200 : 404 });
}
