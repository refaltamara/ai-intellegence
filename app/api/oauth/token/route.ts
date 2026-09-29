/** Token endpoint: authorization code + PKCE for a token pair, or a refresh token for a new pair (rotated). Public clients only. */
import { CORS, pkceOk } from "@/mcp/oauth";
import { mayReach, refreshTokens, issueTokens, takeCode } from "@/mcp/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const err = (error: string, description: string, status = 400) => Response.json({ error, error_description: description }, { status, headers: { ...CORS, "Cache-Control": "no-store" } });

async function form(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) return ((await req.json().catch(() => ({}))) as Record<string, string>) ?? {};
  return Object.fromEntries(new URLSearchParams(await req.text()));
}

export async function POST(req: Request) {
  const f = await form(req);
  if (f.grant_type === "authorization_code") {
    if (!f.code || !f.client_id || !f.redirect_uri) return err("invalid_request", "code, client_id and redirect_uri are required");
    const code = await takeCode(f.code);
    if (!code || code.client_id !== f.client_id || code.redirect_uri !== f.redirect_uri) return err("invalid_grant", "The code is unknown, used, expired or was issued to another client.");
    if (!pkceOk(f.code_verifier, code.code_challenge)) return err("invalid_grant", "PKCE verification failed.");
    if (!(await mayReach(code.user_id, code.workspace_id))) return err("invalid_grant", "This account can no longer reach that workspace.");
    const t = await issueTokens({ clientId: code.client_id, userId: code.user_id, workspaceId: code.workspace_id });
    return Response.json({ ...t, token_type: "Bearer", scope: code.scope ?? "read" }, { headers: { ...CORS, "Cache-Control": "no-store" } });
  }
  if (f.grant_type === "refresh_token") {
    if (!f.refresh_token || !f.client_id) return err("invalid_request", "refresh_token and client_id are required");
    const t = await refreshTokens(f.refresh_token, f.client_id);
    if (!t) return err("invalid_grant", "The refresh token is unknown, expired or revoked.");
    return Response.json({ ...t, token_type: "Bearer", scope: "read" }, { headers: { ...CORS, "Cache-Control": "no-store" } });
  }
  return err("unsupported_grant_type", "Use authorization_code or refresh_token.");
}
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
