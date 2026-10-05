/**
 * The connector endpoint (MCP over Streamable HTTP). Clients authenticate with an
 * OAuth bearer token issued by /oauth/authorize; the token decides the person and
 * the workspace (the team chosen on the consent screen). Every tool call is limited
 * and logged (src/config/mcp.ts).
 */
import { CORS, originOf } from "@/mcp/oauth";
import { handle, type RpcRequest } from "@/mcp/server";
import { grantFromBearer, limitHit, logCall, usage } from "@/mcp/store";
import { callTool, listTools } from "@/mcp/tools";
import { getWorkspace } from "@/workspace/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(body == null ? null : JSON.stringify(body), { status, headers: { ...CORS, ...(body == null ? {} : { "Content-Type": "application/json" }), ...extra } });

function unauthorized(req: Request) {
  const origin = originOf(req.headers);
  return json({ error: "invalid_token", error_description: "Sign in to Fair Intelligence to connect." }, 401, {
    "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource", error="invalid_token"`,
  });
}

export async function POST(req: Request) {
  const grant = await grantFromBearer(req.headers.get("authorization"));
  if (!grant) return unauthorized(req);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }
  const cfg = await getWorkspace(grant.workspace_id);
  const deps = {
    workspaceLabel: cfg?.name ?? grant.workspace_id,
    listTools: () => listTools(grant.workspace_id),
    callTool: (name: string, args: Record<string, unknown>) => callTool(grant.workspace_id, grant.user_id, name, args),
    checkLimit: async () => limitHit(await usage(grant.user_id, grant.workspace_id)),
    log: (tool: string, params: Record<string, unknown>, status: string, ms: number, error?: string | null) => logCall({ grant, tool, params, status, ms, error }),
  };
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handle(m as RpcRequest, deps)))).filter(Boolean);
    return out.length ? json(out) : json(null, 202);
  }
  const res = await handle(body as RpcRequest, deps);
  return res ? json(res) : json(null, 202);
}

/** No server-initiated stream: this server answers requests only. */
export async function GET() {
  return json({ error: "This endpoint takes POST requests only." }, 405, { Allow: "POST" });
}

export async function DELETE() {
  return json(null, 405, { Allow: "POST" });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
