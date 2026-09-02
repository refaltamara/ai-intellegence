import { authenticate } from "@/auth/users";
import { cookieHeader, signSession } from "@/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const attempts = new Map<string, { n: number; until: number }>();

/** POST { email, password } -> sets the session cookie. Simple per-email throttle: 8 failures lock for 15 minutes. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!email || !password) return Response.json({ error: "Email and password are required" }, { status: 400 });
  const a = attempts.get(email);
  if (a && a.n >= 8 && a.until > Date.now()) return Response.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
  const user = await authenticate(email, password);
  if (!user) {
    attempts.set(email, { n: (a?.n ?? 0) + 1, until: Date.now() + 15 * 60 * 1000 });
    return Response.json({ error: "Wrong email or password" }, { status: 401 });
  }
  attempts.delete(email);
  const token = await signSession({ uid: user.id, email: user.email, role: user.role, ws: user.workspace_id });
  return Response.json({ ok: true, user: { email: user.email, name: user.name, role: user.role } }, { headers: { "Set-Cookie": cookieHeader(token) } });
}
