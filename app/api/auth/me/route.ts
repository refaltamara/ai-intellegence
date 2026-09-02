import { currentSession } from "@/auth/current";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const s = await currentSession();
  if (!s) return Response.json({ user: null }, { status: 401 });
  return Response.json({ user: { email: s.email, role: s.role } });
}
