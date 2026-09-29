/** Checks an authorization request before anything is shown or issued. A bad client or redirect is never redirected to. */
import { getClient, type Client } from "./store";

export type AuthRequest = { client: Client; redirectUri: string; challenge: string; state: string | null; scope: string | null };

export async function checkAuthRequest(p: Record<string, string | undefined>): Promise<{ ok: AuthRequest } | { fatal: string } | { redirectError: { uri: string; state: string | null; error: string; description: string } }> {
  const client = p.client_id ? await getClient(p.client_id) : null;
  if (!client) return { fatal: "This app is not registered with Fair Intelligence. Remove the connector and add it again." };
  const redirectUri = p.redirect_uri ?? (client.redirect_uris.length === 1 ? client.redirect_uris[0] : "");
  if (!client.redirect_uris.includes(redirectUri)) return { fatal: "The app asked to return to an address it did not register. Nothing was shared." };
  const state = p.state ?? null;
  if (p.response_type !== "code") return { redirectError: { uri: redirectUri, state, error: "unsupported_response_type", description: "Only the authorization code flow is supported." } };
  if (!p.code_challenge || (p.code_challenge_method ?? "plain") !== "S256") return { redirectError: { uri: redirectUri, state, error: "invalid_request", description: "PKCE with S256 is required." } };
  return { ok: { client, redirectUri, challenge: p.code_challenge, state, scope: p.scope ?? null } };
}

export function withParams(uri: string, params: Record<string, string | null>): string {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(k, v);
  return u.toString();
}
