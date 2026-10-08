/**
 * POST { token, password }: set a new password with a one-time link (src/auth/passwordLinks.ts).
 * Every session from before signs out; the person then signs in with the new password.
 */
import { usePasswordLink } from "@/auth/passwordLinks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { token?: unknown; password?: unknown };
  const r = await usePasswordLink(String(b.token ?? ""), String(b.password ?? ""));
  return r.ok ? Response.json({ ok: true, email: r.email }) : Response.json({ error: r.error }, { status: 400 });
}
