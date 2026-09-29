/** OAuth 2.1 pieces for the connector that need no database: tokens, hashes, PKCE, redirect checks, the public origin. */
import { createHash, randomBytes } from "node:crypto";

export const token = (prefix: string) => `${prefix}_${randomBytes(32).toString("base64url")}`;
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** PKCE S256: BASE64URL(SHA256(verifier)) must equal the challenge sent at /authorize. */
export function pkceOk(verifier: string | null | undefined, challenge: string): boolean {
  if (!verifier || !/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  return createHash("sha256").update(verifier).digest("base64url") === challenge;
}

/** Redirect URIs a client may register: https, or http on this machine (desktop clients). Nothing else. */
export function validRedirectUri(uri: unknown): uri is string {
  if (typeof uri !== "string" || uri.length > 500) return false;
  try {
    const u = new URL(uri);
    if (u.hash) return false;
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  } catch {
    return false;
  }
}

/** The origin the client reached us on, so metadata and redirects name the same host (production, preview or local). */
export function originOf(headers: Headers): string {
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? "localhost:3000";
  const proto = headers.get("x-forwarded-proto") ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
  return `${proto.split(",")[0].trim()}://${host.split(",")[0].trim()}`;
}

/** CORS for the endpoints browser-based clients call with a bearer token (never cookies). */
export const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
};

export function metadata(origin: string) {
  return {
    resource: {
      resource: `${origin}/api/mcp`,
      authorization_servers: [origin],
      bearer_methods_supported: ["header"],
      scopes_supported: ["read"],
      resource_name: "Fair Intelligence",
    },
    server: {
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/api/oauth/token`,
      registration_endpoint: `${origin}/api/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["read"],
    },
  };
}
