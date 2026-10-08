/**
 * POST { email }: Fair makes a one-time link for someone to set a new password (src/auth/passwordLinks.ts):
 * emailed when email is set up, and returned so it can be copied to them. Who may: mayMakeLink.
 */
import { headers } from "next/headers";
import { currentActor } from "@/auth/current";
import { isStaff } from "@/auth/can";
import { createPasswordLink } from "@/auth/passwordLinks";
import { originOf } from "@/mcp/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const actor = await currentActor();
  if (!actor || !isStaff(actor)) return Response.json({ error: "not found" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { email?: unknown };
  const r = await createPasswordLink(actor, String(b.email ?? ""), originOf(await headers()));
  return r.ok ? Response.json(r) : Response.json({ error: r.error }, { status: 403 });
}
