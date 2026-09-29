/** POST { workspace_id } switches the team someone is acting as, among the ones they can reach. */
import { currentSession, wsCookieHeader } from "@/auth/current";
import { teamsFor } from "@/workspace/teams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await currentSession();
  if (!session) return Response.json({ error: "unauthorised" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { workspace_id?: string | null };
  const id = body.workspace_id ? String(body.workspace_id) : null;
  const teams = await teamsFor(session);
  const team = id ? teams.find((t) => t.workspace_id === id) : teams.find((t) => t.workspace_id === session.ws);
  if (!team) return Response.json({ error: "That team is not open to this account." }, { status: 403 });
  const back = team.workspace_id === session.ws;
  return Response.json({ workspace_id: team.workspace_id, home: team.home }, { headers: { "Set-Cookie": wsCookieHeader(back ? null : team.workspace_id) } });
}
