/** The connector's clients, codes, tokens and call log. Secrets are stored as SHA-256 hashes only. */
import { sql } from "../db/client";
import { toJson } from "../db/json";
import { liveUser } from "../auth/live";
import { MCP_LIMITS, MCP_TOKENS } from "../config/mcp";
import { sha256, token } from "./oauth";

export type Client = { client_id: string; client_name: string | null; redirect_uris: string[] };
export type Grant = { token_id: string; user_id: string; email: string; workspace_id: string; client_id: string; client_name: string | null };

export async function registerClient(name: string | null, redirectUris: string[]): Promise<Client> {
  const id = token("fic");
  await sql.query("insert into mcp_clients (client_id, client_name, redirect_uris) values ($1, $2, $3::jsonb)", [id, name, toJson(redirectUris)]);
  return { client_id: id, client_name: name, redirect_uris: redirectUris };
}

export async function getClient(id: string): Promise<Client | null> {
  const rows = (await sql.query("select client_id, client_name, redirect_uris from mcp_clients where client_id = $1", [id])) as Client[];
  return rows[0] ?? null;
}

export async function createCode(c: { clientId: string; userId: string; workspaceId: string; redirectUri: string; challenge: string; scope: string | null }): Promise<string> {
  const code = token("fico");
  await sql.query(
    `insert into mcp_codes (code_hash, client_id, user_id, workspace_id, redirect_uri, code_challenge, scope, expires_at)
     values ($1, $2, $3, $4, $5, $6, $7, now() + make_interval(mins => $8))`,
    [sha256(code), c.clientId, c.userId, c.workspaceId, c.redirectUri, c.challenge, c.scope, MCP_TOKENS.code_minutes],
  );
  return code;
}

/** Marks the code used in the same statement that reads it, so a code works exactly once. */
export async function takeCode(code: string): Promise<{ client_id: string; user_id: string; workspace_id: string; redirect_uri: string; code_challenge: string; scope: string | null } | null> {
  const rows = (await sql.query(
    `update mcp_codes set used_at = now() where code_hash = $1 and used_at is null and expires_at > now()
     returning client_id, user_id, workspace_id, redirect_uri, code_challenge, scope`,
    [sha256(code)],
  )) as { client_id: string; user_id: string; workspace_id: string; redirect_uri: string; code_challenge: string; scope: string | null }[];
  return rows[0] ?? null;
}

export async function issueTokens(g: { clientId: string; userId: string; workspaceId: string }): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const access = token("fiat");
  const refresh = token("firt");
  await sql.query(
    `insert into mcp_tokens (access_hash, refresh_hash, client_id, user_id, workspace_id, access_expires_at, refresh_expires_at)
     values ($1, $2, $3, $4, $5, now() + make_interval(mins => $6), now() + make_interval(days => $7))`,
    [sha256(access), sha256(refresh), g.clientId, g.userId, g.workspaceId, MCP_TOKENS.access_minutes, MCP_TOKENS.refresh_days],
  );
  return { access_token: access, refresh_token: refresh, expires_in: MCP_TOKENS.access_minutes * 60 };
}

/** Rotates: the old refresh token stops working the moment a new pair is issued. */
export async function refreshTokens(refresh: string, clientId: string): Promise<{ access_token: string; refresh_token: string; expires_in: number } | null> {
  const rows = (await sql.query(
    `update mcp_tokens set revoked_at = now() where refresh_hash = $1 and client_id = $2 and revoked_at is null and refresh_expires_at > now()
     returning user_id, workspace_id`,
    [sha256(refresh), clientId],
  )) as { user_id: string; workspace_id: string }[];
  if (!rows[0]) return null;
  if (!(await mayReach(rows[0].user_id, rows[0].workspace_id))) return null;
  return issueTokens({ clientId, userId: rows[0].user_id, workspaceId: rows[0].workspace_id });
}

/** A person may act in a workspace while their account exists and it is theirs (members) or they are an owner. */
export async function mayReach(userId: string, workspaceId: string): Promise<boolean> {
  const u = await liveUser(userId);
  return !!u && (u.role === "owner" || u.workspace_id === workspaceId);
}

export async function grantFromBearer(authorization: string | null): Promise<Grant | null> {
  const m = /^Bearer\s+(\S+)$/i.exec(authorization ?? "");
  if (!m) return null;
  const rows = (await sql.query(
    `update mcp_tokens t set last_used_at = now() from users u, mcp_clients c
     where t.access_hash = $1 and t.revoked_at is null and t.access_expires_at > now() and u.id = t.user_id and c.client_id = t.client_id
     returning t.id as token_id, t.user_id, u.email, t.workspace_id, t.client_id, c.client_name`,
    [sha256(m[1])],
  )) as Grant[];
  const g = rows[0];
  if (!g || !(await mayReach(g.user_id, g.workspace_id))) return null;
  return g;
}

export type Usage = { user_minute: number; user_day: number; workspace_day: number };

export async function usage(userId: string, workspaceId: string): Promise<Usage> {
  const rows = (await sql.query(
    `select count(*) filter (where user_id = $1 and created_at > now() - interval '1 minute')::int as user_minute,
            count(*) filter (where user_id = $1)::int as user_day,
            count(*) filter (where workspace_id = $2)::int as workspace_day
     from mcp_calls where created_at > now() - interval '1 day' and (user_id = $1 or workspace_id = $2)`,
    [userId, workspaceId],
  )) as Usage[];
  return rows[0] ?? { user_minute: 0, user_day: 0, workspace_day: 0 };
}

/** Which limit a new call would break, in words the client's model can pass on; null when it may run. */
export function limitHit(u: Usage): string | null {
  if (u.user_minute >= MCP_LIMITS.per_user_per_minute) return `Limit reached: ${MCP_LIMITS.per_user_per_minute} analyses a minute per person. Wait a minute and try again.`;
  if (u.user_day >= MCP_LIMITS.per_user_per_day) return `Limit reached: ${MCP_LIMITS.per_user_per_day} analyses a day per person. It resets over the next 24 hours; the Fair Intelligence app itself is not affected.`;
  if (u.workspace_day >= MCP_LIMITS.per_workspace_per_day) return `Limit reached: ${MCP_LIMITS.per_workspace_per_day} analyses a day for this workspace. It resets over the next 24 hours; ask Fair to raise it if your team needs more.`;
  return null;
}

export async function logCall(c: { grant: Grant; tool: string; params: unknown; status: string; ms: number; error?: string | null }): Promise<void> {
  await sql.query(
    "insert into mcp_calls (user_id, workspace_id, client_id, tool, params, status, duration_ms, error) values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)",
    [c.grant.user_id, c.grant.workspace_id, c.grant.client_id, c.tool, toJson(c.params ?? {}), c.status, c.ms, c.error ?? null],
  ).catch(() => undefined);
}

export type Connection = { id: string; client_name: string | null; workspace_id: string; created_at: string; last_used_at: string | null; calls_today: number };

export async function listConnections(userId: string): Promise<Connection[]> {
  return (await sql.query(
    `select t.id, c.client_name, t.workspace_id, t.created_at, t.last_used_at,
            (select count(*)::int from mcp_calls k where k.user_id = t.user_id and k.client_id = t.client_id and k.workspace_id = t.workspace_id and k.created_at > now() - interval '1 day') as calls_today
     from mcp_tokens t join mcp_clients c on c.client_id = t.client_id
     where t.user_id = $1 and t.revoked_at is null and (t.refresh_expires_at > now() or t.access_expires_at > now())
     order by t.created_at desc`,
    [userId],
  )) as Connection[];
}

/** Disconnects one client for this person: every live token of that client in that workspace. */
export async function revokeConnection(userId: string, tokenId: string): Promise<boolean> {
  const rows = (await sql.query(
    `update mcp_tokens t set revoked_at = now() from mcp_tokens s
     where s.id = $2 and s.user_id = $1 and t.user_id = s.user_id and t.client_id = s.client_id and t.workspace_id = s.workspace_id and t.revoked_at is null
     returning t.id`,
    [userId, tokenId],
  )) as { id: string }[];
  return rows.length > 0;
}
