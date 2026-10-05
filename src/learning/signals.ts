/**
 * Record a signal (CMS plan, "The learning loop", step 1). The payload is cleaned against
 * the whitelist in ./kinds.ts before it is written, the role's version and the company's
 * version are stamped from the resolver, and Fair staff acting in a client workspace are
 * marked so the roll-ups leave them out. Never throws: a lost signal must never break the
 * thing a person was doing.
 */
import { sql } from "../db/client";
import { toJson } from "../db/json";
import type { Actor } from "../auth/can";
import { isRoleId, type RoleId } from "../roles/model";
import { getRoleResolved } from "../roles/store";
import { getWorkspace } from "../workspace/store";
import { cleanPayload, isSignalKind, SIGNALS, type SignalKind } from "./kinds";

export type SignalCtx = {
  ws: string;
  role: RoleId | string | null | undefined;
  /** the membership (users.id) when a person did it; none for a cron */
  userId?: string | null;
  staff?: boolean;
};

/** who did it, from an Actor: their membership here (or their home one) and whether they are Fair staff */
export const by = (actor: Actor | null | undefined, ws: string, role: RoleId | string | null | undefined): SignalCtx => ({
  ws,
  role,
  userId: actor ? actor.memberships.find((m) => m.workspace_id === ws)?.user_id ?? null : null,
  staff: !!actor && actor.staff.length > 0,
});

export async function signal(ctx: SignalCtx, kind: SignalKind, payload: Record<string, unknown> = {}): Promise<void> {
  try {
    if (!isSignalKind(kind) || !ctx.ws) return;
    const role = isRoleId(ctx.role) ? ctx.role : await firstRole(ctx.ws);
    if (!role) return;
    const resolved = await getRoleResolved(ctx.ws, role).catch(() => null);
    await sql.query(
      "insert into model_events (workspace_id, role, user_id, role_version, company_version, surface, kind, payload, by_staff) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)",
      [ctx.ws, role, ctx.userId ?? null, resolved?.role.version ?? null, resolved?.company_version ?? null, SIGNALS[kind].surface, kind, toJson(cleanPayload(kind, payload)), !!ctx.staff],
    );
  } catch (e) {
    console.error("[signal] not recorded:", kind, (e as Error).message);
  }
}

/** Several signals from one request (a browser batch), each cleaned on its own. */
export async function signals(ctx: SignalCtx, items: { kind: SignalKind; payload?: Record<string, unknown> }[]): Promise<void> {
  for (const it of items) await signal(ctx, it.kind, it.payload ?? {});
}

async function firstRole(ws: string): Promise<RoleId | null> {
  return (await getWorkspace(ws))?.roles[0] ?? null;
}
