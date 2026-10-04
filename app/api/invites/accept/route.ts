/**
 * POST { token, name?, password? }: accept an invitation. A new person chooses a password
 * and is signed in; someone who already has an account gains the membership and signs in
 * with their own password (the link alone never signs anyone into an existing account).
 */
import { acceptInvite } from "@/auth/invites";
import { forgetUser } from "@/auth/live";
import { cookieHeader, signSession } from "@/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { token?: string; name?: string; password?: string };
  const r = await acceptInvite(String(b.token ?? ""), { name: b.name, password: b.password });
  if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
  forgetUser();
  if (!b.password) return Response.json({ ok: true, signed_in: false });
  const token = await signSession({ uid: r.user_id, email: r.email, role: r.staff ? "staff" : "member", ws: r.workspace_id });
  return Response.json({ ok: true, signed_in: true }, { headers: { "Set-Cookie": cookieHeader(token) } });
}
