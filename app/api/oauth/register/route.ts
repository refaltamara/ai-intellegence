/** RFC 7591 dynamic client registration: Claude or ChatGPT registers itself; nothing is readable until a person signs in and allows it. */
import { CORS, validRedirectUri } from "@/mcp/oauth";
import { registerClient } from "@/mcp/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { client_name?: unknown; redirect_uris?: unknown };
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
  if (!uris.length || uris.length > 5 || !uris.every(validRedirectUri)) {
    return Response.json({ error: "invalid_redirect_uri", error_description: "redirect_uris must be 1 to 5 https URLs (or http on localhost)." }, { status: 400, headers: CORS });
  }
  const name = typeof body.client_name === "string" ? body.client_name.slice(0, 100) : null;
  const c = await registerClient(name, uris as string[]);
  return Response.json(
    { client_id: c.client_id, client_name: c.client_name, redirect_uris: c.redirect_uris, token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], client_id_issued_at: Math.floor(Date.now() / 1000) },
    { status: 201, headers: CORS },
  );
}
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
