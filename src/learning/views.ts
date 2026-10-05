/**
 * What the CMS shows of the learning loop (Fair staff only): a role's signals over the
 * last 30 days, by kind and by workspace; a workspace's own signals (shown even when it
 * has switched learning off, since they never leave its page); the learning switch.
 */
import { sql } from "../db/client";
import { toJson } from "../db/json";
import { INSIGHT_WINDOW_DAYS } from "../config/learning";
import type { RoleId } from "../roles/model";
import { audit } from "../roles/store";
import { SIGNALS, isSignalKind, type SignalKind } from "./kinds";

export type KindCount = { kind: SignalKind; label: string; surface: string; family: string; n: number; workspaces: number; staff: number };

const label = (k: string) => (isSignalKind(k) ? SIGNALS[k].label : k);

/** Signals by kind over the window: clients' count and workspaces, and Fair staff's count beside them. */
export async function kindCounts(o: { role?: RoleId; ws?: string; ids?: string[] }): Promise<KindCount[]> {
  const where = [`created_at > now() - make_interval(days => ${INSIGHT_WINDOW_DAYS})`];
  const args: unknown[] = [];
  if (o.role) { args.push(o.role); where.push(`role = $${args.length}`); }
  if (o.ws) { args.push(o.ws); where.push(`workspace_id = $${args.length}`); }
  if (o.ids) { args.push(o.ids); where.push(`workspace_id = any($${args.length}::text[])`); }
  const rows = (await sql.query(
    `select kind, surface, count(*) filter (where not by_staff)::int as n, count(distinct workspace_id) filter (where not by_staff)::int as workspaces, count(*) filter (where by_staff)::int as staff
       from model_events where ${where.join(" and ")} group by 1, 2 order by 2, 3 desc`,
    args,
  )) as { kind: string; surface: string; n: number; workspaces: number; staff: number }[];
  return rows.filter((r) => isSignalKind(r.kind)).map((r) => ({ ...r, kind: r.kind as SignalKind, label: label(r.kind), family: SIGNALS[r.kind as SignalKind].family }));
}

export type WorkspaceUse = { workspace_id: string; name: string; learning: boolean; status: string; questions: number; analyses: number; visits: number; decks: number; shaping: number; last: string | null };

/** Each workspace's use of one role over the window (clients only), for role owners to read one by one. */
export async function workspaceUse(role: RoleId): Promise<WorkspaceUse[]> {
  return (await sql.query(
    `select w.id as workspace_id, w.name, coalesce(w.settings->>'learning', 'true') <> 'false' as learning, w.status,
            count(e.id) filter (where e.kind = 'chat.turn')::int as questions,
            count(e.id) filter (where e.kind = 'chat.analysis')::int as analyses,
            count(e.id) filter (where e.kind = 'dashboard.view')::int as visits,
            count(e.id) filter (where e.kind like 'deck.%')::int as decks,
            count(e.id) filter (where e.kind like 'creation.%' or e.kind like 'setting.%' or e.kind = 'suggestion.sent')::int as shaping,
            max(e.created_at)::text as last
       from workspaces w join model_events e on e.workspace_id = w.id and e.role = $1 and not e.by_staff and e.created_at > now() - make_interval(days => ${INSIGHT_WINDOW_DAYS})
      group by 1, 2, 3, 4 order by questions desc, visits desc`,
    [role],
  )) as WorkspaceUse[];
}

/** A workspace's signals by role and kind, its learning switch, and when it last sent one. */
export async function workspaceSignals(ws: string): Promise<{ learning: boolean; byRole: Record<string, KindCount[]>; last: string | null }> {
  const w = (await sql.query("select coalesce(settings->>'learning', 'true') <> 'false' as learning from workspaces where id = $1", [ws])) as { learning: boolean }[];
  const rows = (await sql.query("select distinct role from model_events where workspace_id = $1", [ws])) as { role: RoleId }[];
  const byRole: Record<string, KindCount[]> = {};
  for (const r of rows) byRole[r.role] = await kindCounts({ role: r.role, ws });
  const last = ((await sql.query("select max(created_at)::text as last from model_events where workspace_id = $1", [ws])) as { last: string | null }[])[0]?.last ?? null;
  return { learning: w[0]?.learning ?? true, byRole, last };
}

/** Switch a workspace in or out of learning across clients (its contract decides); its signals stay on its own page either way. */
export async function setLearning(ws: string, on: boolean, by: string): Promise<boolean> {
  const rows = (await sql.query("update workspaces set settings = jsonb_set(settings, '{learning}', $2::jsonb) where id = $1 returning id", [ws, toJson(on)])) as unknown[];
  if (rows.length) await audit({ workspace_id: ws, actor: by, area: "workspace", action: on ? "learning_on" : "learning_off", path: "settings.learning" });
  return rows.length > 0;
}
