/**
 * Client creations in the CMS (DECISIONS, 4 Oct 2026). POST { id, status: seen | adopted | declined, note? }:
 * a role owner answers what a Builder suggested to Fair; the Builder sees the answer on "Our Chorus".
 * Bringing a client's pattern into Fair's role is a Role Lab draft, never an edit of the client's item.
 */
import { currentActor } from "@/auth/current";
import { can } from "@/auth/can";
import { answerSuggestion } from "@/company/changes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const actor = await currentActor();
  if (!actor || !can(actor, "role.draft")) return Response.json({ error: "Only role owners answer suggestions." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { id?: string; status?: string; note?: string };
  if (!b.id || !/^[0-9a-f-]{36}$/.test(b.id) || !["seen", "adopted", "declined"].includes(String(b.status))) return Response.json({ error: "Unknown suggestion or answer." }, { status: 400 });
  const ok = await answerSuggestion({ email: actor.email }, b.id, b.status as "seen" | "adopted" | "declined", b.note?.trim() || null);
  return ok ? Response.json({ ok }) : Response.json({ error: "No such suggestion." }, { status: 404 });
}
