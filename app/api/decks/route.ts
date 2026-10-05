/**
 * GET: this team's decks. POST { name, template?, spec, recurring?, period? }: a new deck and its
 * first version (the facts, the words and both files are made before the reply, so it can take a minute).
 */
import { currentActor, currentSession, currentWorkspaceId } from "@/auth/current";
import { by, signal } from "@/learning/signals";
import { generateDeckVersion, nextRun } from "@/decks/generate";
import { cleanSpec } from "@/decks/spec";
import { createDeck, getDeck, listDecks } from "@/decks/store";
import { deckTemplate } from "@/decks/templates";
import { knownBrands, panelWorkspace } from "@/pulses/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const ws = await currentWorkspaceId();
  return Response.json(await listDecks(ws));
}

export async function POST(req: Request) {
  const [ws, session] = await Promise.all([currentWorkspaceId(), currentSession()]);
  if (!(await panelWorkspace(ws))) return Response.json({ error: "decks need a brand panel; this team has one subject" }, { status: 400 });
  const b = (await req.json().catch(() => ({}))) as { name?: unknown; template?: unknown; spec?: unknown; recurring?: unknown; period?: unknown; source?: unknown };
  const spec = cleanSpec(b.spec, await knownBrands(ws));
  if ("error" in spec) return Response.json({ error: spec.error }, { status: 400 });
  // a Fair template, or one the team made (src/company/creations.ts): either way the deck keeps its key
  const t = deckTemplate(b.template) ?? (typeof b.template === "string" && /^co-[a-z0-9-]{3,60}$/.test(b.template) ? { key: b.template, name: spec.title } : null);
  const name = typeof b.name === "string" && b.name.trim() ? b.name.trim().slice(0, 80) : t?.name ?? spec.title;
  const recurring = b.recurring === true;
  const created = await createDeck({ workspaceId: ws, userId: session?.uid ?? null, name, source: t ? "template" : "scratch", template: t?.key ?? null, spec, recurring });
  const deck = recurring ? { ...created, next_run_at: nextRun(spec.grain) } : created;
  const fair = deckTemplate(b.template);
  await signal(by(await currentActor(), ws, spec.social ? "social" : spec.rep ? "pr" : "brand_kol"), "deck.template_chosen", { template: fair?.key ?? (t ? "company" : "scratch"), source: fair ? "fair" : t ? "company" : "scratch" });
  const outcome = await generateDeckVersion(deck, { reason: "create", period: typeof b.period === "string" && b.period ? b.period : undefined });
  return Response.json({ deck: (await getDeck(deck.id, ws)) ?? deck, version: outcome }, { status: 201 });
}
