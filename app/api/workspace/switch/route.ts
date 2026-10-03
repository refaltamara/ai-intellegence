/** POST { workspace_id, role? } switches the team someone is acting as, among the ones they can reach. */
import { currentSession, roleCookieHeader, wsCookieHeader } from "@/auth/current";
import { teamsFor } from "@/workspace/teams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await currentSession();
  if (!session) return Response.json({ error: "unauthorised" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { workspace_id?: string | null; role?: string | null };
  const id = body.workspace_id ? String(body.workspace_id) : session.ws;
  const teams = (await teamsFor(session)).filter((t) => t.workspace_id === id);
  const team = (body.role ? teams.find((t) => t.role === body.role) : null) ?? teams[0];
  if (!team || (body.role && team.role !== body.role)) return Response.json({ error: "That team is not open to this account." }, { status: 403 });
  const back = team.workspace_id === session.ws;
  const headers = new Headers();
  headers.append("Set-Cookie", wsCookieHeader(back ? null : team.workspace_id));
  headers.append("Set-Cookie", roleCookieHeader(team.role));
  return Response.json({ workspace_id: team.workspace_id, role: team.role, home: team.home }, { headers });
}
