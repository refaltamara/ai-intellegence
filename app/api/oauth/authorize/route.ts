/** The consent form's answer: issue a one-time code for the chosen team, or tell the app the person said no. */
import { currentActor, currentSession } from "@/auth/current";
import { checkAuthRequest, withParams } from "@/mcp/authorize";
import { createCode } from "@/mcp/store";
import { teamsFor } from "@/workspace/teams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const go = (url: string) => new Response(null, { status: 303, headers: { Location: url, "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  const session = await currentSession();
  if (!session) return Response.json({ error: "unauthorised" }, { status: 401 });
  const f = Object.fromEntries(new URLSearchParams(await req.text()));
  const checked = await checkAuthRequest({ ...f, response_type: "code", code_challenge_method: "S256" });
  if ("fatal" in checked) return Response.json({ error: checked.fatal }, { status: 400 });
  if ("redirectError" in checked) return go(withParams(checked.redirectError.uri, { error: checked.redirectError.error, state: checked.redirectError.state }));
  const { client, redirectUri, challenge, state, scope } = checked.ok;
  if (f.decision !== "allow") return go(withParams(redirectUri, { error: "access_denied", state }));
  const team = (await teamsFor(await currentActor())).find((t) => t.workspace_id === f.workspace_id);
  if (!team) return go(withParams(redirectUri, { error: "access_denied", error_description: "That team is not open to this account.", state }));
  const code = await createCode({ clientId: client.client_id, userId: session.uid, workspaceId: team.workspace_id, redirectUri, challenge, scope });
  return go(withParams(redirectUri, { code, state }));
}
