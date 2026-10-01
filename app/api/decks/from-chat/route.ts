/**
 * POST { conversation_id } or { skill_run_id }: a deck from Chats (DECISIONS, 2 Oct 2026). Every analysis in
 * the conversation (or the one analysis) becomes a finding, run again for each version; the first version is
 * made before the reply.
 */
import { currentSession, currentWorkspaceId } from "@/auth/current";
import { chatDeckSpec, conversationFindings, findingFromRun } from "@/decks/fromChat";
import { generateDeckVersion } from "@/decks/generate";
import { createDeck, getDeck } from "@/decks/store";
import { panelWorkspace } from "@/pulses/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const [ws, session] = await Promise.all([currentWorkspaceId(), currentSession()]);
  if (!(await panelWorkspace(ws))) return Response.json({ error: "decks need a brand panel; this team has one subject" }, { status: 400 });
  const b = (await req.json().catch(() => ({}))) as { conversation_id?: unknown; skill_run_id?: unknown; name?: unknown };
  let title: string;
  let findings;
  let conversationId: string | null = null;
  if (typeof b.conversation_id === "string" && /^[0-9a-f-]{36}$/.test(b.conversation_id)) {
    const c = await conversationFindings(b.conversation_id, ws, session?.uid ?? null);
    if (!c) return Response.json({ error: "conversation not found" }, { status: 404 });
    title = c.title;
    findings = c.findings;
    conversationId = b.conversation_id;
  } else if (typeof b.skill_run_id === "string") {
    const f = await findingFromRun(b.skill_run_id, ws);
    if (!f) return Response.json({ error: "that analysis is not in this workspace" }, { status: 404 });
    title = f.title;
    findings = [f];
  } else return Response.json({ error: "conversation_id or skill_run_id is required" }, { status: 400 });
  const spec = await chatDeckSpec(typeof b.name === "string" && b.name.trim() ? b.name.trim() : title, findings, ws);
  if ("error" in spec) return Response.json({ error: spec.error }, { status: 400 });
  const deck = await createDeck({ workspaceId: ws, userId: session?.uid ?? null, name: spec.title, source: "chat", template: null, spec, recurring: false, conversationId });
  const version = await generateDeckVersion(deck, { reason: "create" });
  return Response.json({ deck: (await getDeck(deck.id, ws)) ?? deck, version }, { status: 201 });
}
