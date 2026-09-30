/** PATCH { title?, size?, config? } or DELETE one card on a Pulse of this team. */
import { currentWorkspaceId } from "@/auth/current";
import { cleanConfig, type CardSize } from "@/pulses/cards";
import { knownBrands, SIZES } from "@/pulses/api";
import { deleteCard, getCard, updateCard } from "@/pulses/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/;

export async function PATCH(req: Request, ctx: { params: Promise<{ cardId: string }> }) {
  const ws = await currentWorkspaceId();
  const { cardId } = await ctx.params;
  if (!UUID.test(cardId)) return Response.json({ error: "bad id" }, { status: 400 });
  const card = await getCard(cardId, ws);
  if (!card) return Response.json({ error: "not found" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { title?: unknown; size?: unknown; config?: unknown };
  const updated = await updateCard(cardId, ws, {
    title: typeof b.title === "string" ? (b.title.trim().slice(0, 80) || null) : undefined,
    size: SIZES.includes(b.size as CardSize) ? (b.size as CardSize) : undefined,
    config: b.config && card.kind !== "skill" ? cleanConfig(card.kind, { ...card.config, ...(b.config as object) }, await knownBrands(ws)) : undefined,
  });
  return Response.json(updated);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ cardId: string }> }) {
  const ws = await currentWorkspaceId();
  const { cardId } = await ctx.params;
  if (!UUID.test(cardId)) return Response.json({ error: "bad id" }, { status: 400 });
  const ok = await deleteCard(cardId, ws);
  return Response.json({ ok }, { status: ok ? 200 : 404 });
}
