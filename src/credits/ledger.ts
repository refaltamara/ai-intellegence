/**
 * Credits (CMS plan, "Credits and billing"). Model work is counted in credits, a unit Fair
 * prices (src/config/credits.ts); SQL work (dashboards, filters, approvals) is free. Each
 * workspace has a monthly pool shared by its people, plus top-ups for that month; a Builder
 * may set a lower monthly cap and is told once a month at 80%.
 *
 * Until Fair turns billing on for a workspace (settings.credits.enforce, set by Refal or
 * Rafli in the CMS), credits are recorded and shown but nothing stops: the CMS records
 * cost without charging (DECISIONS 4 Oct 2026). Fair staff working in a client's
 * workspace are recorded at 0 credits.
 */
import { sql } from "../db/client";
import { toJson } from "../db/json";
import { ALERT_AT, CREDIT_PRICE_USD, DEFAULT_MODEL_COST, DEFAULT_MONTHLY_POOL, MODEL_COST_USD, type CreditKind } from "../config/credits";
import { invalidateWorkspace } from "../workspace/store";

export type CreditSettings = { pool?: number; enforce?: boolean; cap?: number | null; alerted?: string };

const n = (v: unknown) => Number(v ?? 0) || 0;
export const monthOf = (d = new Date()) => d.toISOString().slice(0, 7);
const r2 = (x: number) => Math.round(x * 100) / 100;

export async function creditSettings(ws: string): Promise<CreditSettings> {
  const rows = (await sql.query("select settings->'credits' as c from workspaces where id = $1", [ws])) as { c: CreditSettings | null }[];
  return rows[0]?.c ?? {};
}

async function patchSettings(ws: string, patch: Partial<CreditSettings>): Promise<void> {
  await sql.query("update workspaces set settings = jsonb_set(settings, '{credits}', coalesce(settings->'credits', '{}'::jsonb) || $2::jsonb) where id = $1", [ws, toJson(patch)]);
  invalidateWorkspace(ws);
}

export type MonthState = {
  month: string;
  pool: number;
  topups: number;
  /** pool + this month's top-ups */
  allowance: number;
  cap: number | null;
  /** what the month allows: the cap when it is lower */
  limit: number;
  spent: number;
  remaining: number;
  share: number;
  enforce: boolean;
};

export async function monthState(ws: string, month = monthOf()): Promise<MonthState> {
  const s = await creditSettings(ws);
  const rows = (await sql.query(
    `select coalesce(sum(-credits) filter (where credits < 0), 0) as spent, coalesce(sum(credits) filter (where kind = 'topup'), 0) as topups
       from credit_ledger where workspace_id = $1 and to_char(created_at at time zone 'Asia/Jakarta', 'YYYY-MM') = $2`,
    [ws, month],
  )) as { spent: string; topups: string }[];
  const pool = s.pool ?? DEFAULT_MONTHLY_POOL;
  const topups = n(rows[0]?.topups);
  const allowance = pool + topups;
  const cap = s.cap ?? null;
  const limit = cap != null ? Math.min(cap, allowance) : allowance;
  const spent = r2(n(rows[0]?.spent));
  return { month, pool, topups, allowance, cap, limit, spent, remaining: r2(Math.max(0, limit - spent)), share: limit > 0 ? spent / limit : 1, enforce: !!s.enforce };
}

/** May this workspace spend these credits now? Only a workspace on billing is ever stopped. */
export async function canSpend(ws: string, credits: number): Promise<{ ok: true } | { ok: false; message: string; state: MonthState }> {
  const st = await monthState(ws);
  if (!st.enforce || credits <= 0 || st.spent + credits <= st.limit) return { ok: true };
  const why = st.cap != null && st.cap < st.allowance ? "the monthly cap your Builder set" : "this month's credits";
  return { ok: false, state: st, message: `Your team has used ${why} (${Math.round(st.spent).toLocaleString("en-US")} of ${st.limit.toLocaleString("en-US")}). Dashboards, decks already made and everything without CeMO keep working; a Builder can raise the cap, or ask Fair for a top-up.` };
}

export type Charge = { ws: string; email?: string | null; staff?: boolean; kind: CreditKind; credits: number; ref?: string | null; note?: string | null };

/** Record credits spent (as a negative row). Fair staff are recorded at 0. Never throws: billing must not break the product. */
export async function charge(c: Charge): Promise<void> {
  if (!(c.credits > 0)) return;
  try {
    const credits = c.staff ? 0 : r2(c.credits);
    await sql.query("insert into credit_ledger (workspace_id, account_email, kind, credits, ref, note) values ($1, $2, $3, $4, $5, $6)", [
      c.ws, c.email ?? null, c.kind, -credits, c.ref ?? null, c.staff ? `Fair staff: ${r2(c.credits)} credits not charged${c.note ? ` · ${c.note}` : ""}` : c.note ?? null,
    ]);
    if (credits > 0) await alertIfNeeded(c.ws);
  } catch (e) {
    console.error("[credits] not recorded:", (e as Error).message);
  }
}

/** Once a month, past 80% of what the month allows: tell the workspace's Builders by email. */
async function alertIfNeeded(ws: string): Promise<void> {
  const [s, st] = await Promise.all([creditSettings(ws), monthState(ws)]);
  if (st.share < ALERT_AT || s.alerted === st.month) return;
  await patchSettings(ws, { alerted: st.month });
  const builders = (await sql.query(
    // the client's own Builders: Fair staff hold Builder-level memberships everywhere and are not told
    "select distinct a.email from users u join accounts a on a.id = u.account_id where u.workspace_id = $1 and coalesce(array_length(a.staff, 1), 0) = 0 and exists (select 1 from jsonb_each_text(u.levels) l where l.value = 'builder')",
    [ws],
  )) as { email: string }[];
  const { sendEmail } = await import("../delivery/email");
  const pct = Math.round(st.share * 100);
  for (const b of builders) {
    await sendEmail({
      to: b.email,
      subject: `Your team has used ${pct}% of this month's credits`,
      html: `<p>Your team has used ${Math.round(st.spent).toLocaleString("en-US")} of ${st.limit.toLocaleString("en-US")} credits this month (${pct}%).</p><p>See who used what, or change the cap, under Credits in Fair Intelligence.</p>`,
      text: `Your team has used ${Math.round(st.spent)} of ${st.limit} credits this month (${pct}%). See Credits in Fair Intelligence.`,
    }).catch(() => undefined);
  }
  await sql.query("insert into credit_ledger (workspace_id, kind, credits, note) values ($1, 'adjust', 0, $2)", [ws, `Alert at ${pct}% sent to ${builders.length} Builder${builders.length === 1 ? "" : "s"}`]);
}

/** A Builder's monthly cap (null: no cap below what the month allows). */
export async function setCap(ws: string, cap: number | null, by: string): Promise<void> {
  await patchSettings(ws, { cap: cap == null ? null : Math.max(0, Math.round(cap)) });
  const { audit } = await import("../roles/store");
  await audit({ workspace_id: ws, actor: by, area: "credits", action: "cap", new: { cap } });
}

/** Fair's side: the monthly pool and whether billing stops actions. Refal or Rafli. */
export async function setPool(ws: string, pool: number, enforce: boolean, by: string): Promise<void> {
  await patchSettings(ws, { pool: Math.max(0, Math.round(pool)), enforce });
  const { audit } = await import("../roles/store");
  await audit({ workspace_id: ws, actor: by, area: "credits", action: "pool", new: { pool, enforce } });
}

export async function topUp(ws: string, credits: number, by: string, note?: string | null): Promise<void> {
  await sql.query("insert into credit_ledger (workspace_id, account_email, kind, credits, note) values ($1, $2, 'topup', $3, $4)", [ws, by, Math.round(credits), note ?? null]);
  const { audit } = await import("../roles/store");
  await audit({ workspace_id: ws, actor: by, area: "credits", action: "topup", new: { credits }, note });
}

export type Use = { by_person: { email: string | null; credits: number; actions: number }[]; by_kind: { kind: string; credits: number; actions: number }[]; by_day: { day: string; credits: number }[]; recent: { at: string; email: string | null; kind: string; credits: number; note: string | null }[] };

/** Use over the last days, by person, kind and day (spends only). */
export async function useBreakdown(ws: string, days = 30): Promise<Use> {
  const since = `now() - make_interval(days => ${Math.max(1, Math.min(365, Math.round(days)))})`;
  const [byPerson, byKind, byDay, recent] = await Promise.all([
    sql.query(`select account_email as email, sum(-credits)::float8 as credits, count(*)::int as actions from credit_ledger where workspace_id = $1 and created_at > ${since} and credits <= 0 and kind not in ('adjust') group by 1 order by 2 desc`, [ws]),
    sql.query(`select kind, sum(-credits)::float8 as credits, count(*)::int as actions from credit_ledger where workspace_id = $1 and created_at > ${since} and credits <= 0 and kind not in ('adjust') group by 1 order by 2 desc`, [ws]),
    sql.query(`select to_char(created_at at time zone 'Asia/Jakarta', 'YYYY-MM-DD') as day, sum(-credits)::float8 as credits from credit_ledger where workspace_id = $1 and created_at > ${since} and credits < 0 group by 1 order by 1`, [ws]),
    sql.query(`select created_at as at, account_email as email, kind, credits::float8 as credits, note from credit_ledger where workspace_id = $1 order by created_at desc limit 25`, [ws]),
  ]);
  return { by_person: byPerson as never, by_kind: byKind as never, by_day: byDay as never, recent: recent as never };
}

export type CostRow = { workspace_id: string; name: string; credits_spent: number; credits_value_usd: number; model_cost_usd: number; tokens_in: number; tokens_out: number; state: MonthState };

/** Owners only: what each workspace spent in credits this month against Fair's real model cost. */
export async function costByWorkspace(month = monthOf()): Promise<CostRow[]> {
  const ws = (await sql.query("select id, name from workspaces order by created_at")) as { id: string; name: string }[];
  const calls = (await sql.query(
    `select workspace_id, model, sum(tokens_in)::float8 as tin, sum(tokens_out)::float8 as tout, sum(cache_read)::float8 as cr, sum(cache_write)::float8 as cw
       from model_calls where to_char(created_at at time zone 'Asia/Jakarta', 'YYYY-MM') = $1 group by 1, 2`,
    [month],
  )) as { workspace_id: string | null; model: string; tin: number; tout: number; cr: number; cw: number }[];
  const out: CostRow[] = [];
  for (const w of ws) {
    const state = await monthState(w.id, month);
    const mine = calls.filter((c) => c.workspace_id === w.id);
    const cost = mine.reduce((a, c) => { const p = MODEL_COST_USD[c.model] ?? DEFAULT_MODEL_COST; return a + (c.tin * p.in + c.tout * p.out + c.cr * p.cache_read + c.cw * p.cache_write) / 1e6; }, 0);
    out.push({ workspace_id: w.id, name: w.name, credits_spent: state.spent, credits_value_usd: r2(state.spent * CREDIT_PRICE_USD), model_cost_usd: r2(cost), tokens_in: mine.reduce((a, c) => a + c.tin + c.cr + c.cw, 0), tokens_out: mine.reduce((a, c) => a + c.tout, 0), state });
  }
  return out;
}

/** Fair's own model cost this month (the Role Lab, crons with no workspace). */
export async function fairOwnCost(month = monthOf()): Promise<number> {
  const rows = (await sql.query("select model, sum(tokens_in)::float8 as tin, sum(tokens_out)::float8 as tout, sum(cache_read)::float8 as cr, sum(cache_write)::float8 as cw from model_calls where workspace_id is null and to_char(created_at at time zone 'Asia/Jakarta', 'YYYY-MM') = $1 group by 1", [month])) as { model: string; tin: number; tout: number; cr: number; cw: number }[];
  return r2(rows.reduce((a, c) => { const p = MODEL_COST_USD[c.model] ?? DEFAULT_MODEL_COST; return a + (c.tin * p.in + c.tout * p.out + c.cr * p.cache_read + c.cw * p.cache_write) / 1e6; }, 0));
}
