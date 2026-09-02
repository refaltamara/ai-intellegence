/**
 * Parameter validation (JSON Schema from the registry, with defaults applied) and
 * resolution of the common params: window, platform, brands, tiers, limit.
 */
import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import { DEFAULT_WORKSPACE_ID } from "../config/thresholds";
import type { SkillDef } from "./registry";
import type { SkillDb } from "./db";
import type { Platform } from "./types";

const ajv = new Ajv({ useDefaults: true, coerceTypes: "array", allErrors: true, strict: false });
addFormats(ajv);
const compiled = new Map<string, ValidateFunction>();

export class ParamError extends Error {}

export function validateParams(def: SkillDef, params: Record<string, unknown>): Record<string, unknown> {
  let v = compiled.get(def.name);
  if (!v) {
    v = ajv.compile(def.input_schema);
    compiled.set(def.name, v);
  }
  const copy = structuredClone(params ?? {});
  if (!v(copy)) {
    const msg = (v.errors ?? [])
      .map((e) => `${e.instancePath || "params"} ${e.message}${e.params?.allowedValues ? ` (${(e.params.allowedValues as string[]).join("|")})` : ""}`)
      .join("; ");
    throw new ParamError(`Invalid params for ${def.name}: ${msg}`);
  }
  return copy;
}

export type Window = { from: string; to: string; label: string };

export type Context = {
  workspaceId: string;
  tz: string;
  /** latest posted_at date in the workspace (local), the anchor for relative windows */
  asOf: string;
  earliest: string;
  /** ISO timestamp of the latest post loaded (meta.freshness) */
  freshness: string;
  clientBrandId: string | null;
  brands: BrandRef[];
};

export type BrandRef = { id: string; name: string; tiktok_handle: string | null; instagram_handle: string | null; is_client: boolean };

export async function loadContext(db: SkillDb, workspaceId = DEFAULT_WORKSPACE_ID): Promise<Context> {
  const ws = await db.one<{ tz: string; client_brand_id: string | null }>(
    "select tz, client_brand_id from workspaces where id = $1",
    [workspaceId],
  );
  if (!ws) throw new ParamError(`Unknown workspace ${workspaceId}`);
  const range = await db.one<{ as_of: string | null; earliest: string | null; freshness: string | null }>(
    `select to_char(max(posted_at at time zone $2), 'YYYY-MM-DD') as as_of,
            to_char(min(posted_at at time zone $2), 'YYYY-MM-DD') as earliest,
            to_char(max(posted_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as freshness
     from posts where workspace_id = $1`,
    [workspaceId, ws.tz],
  );
  const brands = await db.q<BrandRef>(
    "select id, name, tiktok_handle, instagram_handle, is_client from brands where workspace_id = $1 order by id",
    [workspaceId],
  );
  return {
    workspaceId,
    tz: ws.tz,
    asOf: range?.as_of ?? new Date().toISOString().slice(0, 10),
    earliest: range?.earliest ?? "1970-01-01",
    freshness: range?.freshness ?? new Date(0).toISOString(),
    clientBrandId: ws.client_brand_id ?? brands.find((b) => b.is_client)?.id ?? null,
    brands,
  };
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Relative windows are anchored on the latest data (asOf), not on today, so a
 *  static export still answers "last 30 days". Default: last 90 days. */
export function resolveWindow(raw: unknown, ctx: Context, defaultDays = 90): Window {
  const w = (raw ?? {}) as { last_n_days?: number; from?: string; to?: string };
  if (w.from || w.to) {
    const from = w.from ?? ctx.earliest;
    const to = w.to ?? ctx.asOf;
    if (from > to) throw new ParamError(`window.from ${from} is after window.to ${to}`);
    return { from, to, label: `${from} to ${to}` };
  }
  const n = w.last_n_days ?? defaultDays;
  const to = ctx.asOf;
  const from = addDays(to, -(n - 1));
  return { from, to, label: `last ${n} days of data (${from} to ${to})` };
}

export function monthWindow(month: string): Window {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new ParamError(`month must be YYYY-MM, got ${month}`);
  const from = `${month}-01`;
  const to = addDays(addDays(from, 32).slice(0, 7) + "-01", -1);
  return { from, to, label: month };
}

/** ISO week "2026-W24" → Monday..Sunday */
export function isoWeekWindow(week: string): Window {
  const m = /^(\d{4})-W(\d{2})$/.exec(week);
  if (!m) throw new ParamError(`week must be YYYY-Www, got ${week}`);
  const year = Number(m[1]);
  const wk = Number(m[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dow = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - dow + 1 + (wk - 1) * 7);
  const from = monday.toISOString().slice(0, 10);
  return { from, to: addDays(from, 6), label: week };
}

export function previousWindow(w: Window): Window {
  const days = Math.round((Date.parse(w.to) - Date.parse(w.from)) / 86400000) + 1;
  const to = addDays(w.from, -1);
  const from = addDays(to, -(days - 1));
  return { from, to, label: `${from} to ${to}` };
}

export function latestMonth(ctx: Context): string {
  return ctx.asOf.slice(0, 7);
}

export function resolvePlatforms(raw: unknown): Platform[] | null {
  const p = (raw ?? "all") as string;
  return p === "all" ? null : [p as Platform];
}

/** Accepts canonical ids, platform handles or display names (case-insensitive). */
export function resolveBrands(raw: unknown, ctx: Context, opts: { required?: boolean } = {}): string[] | null {
  const list = (raw ?? []) as string[];
  if (!list.length) {
    if (opts.required) throw new ParamError("at least one brand is required");
    return null;
  }
  const idx = new Map<string, string>();
  for (const b of ctx.brands) {
    for (const k of [b.id, b.name, b.tiktok_handle, b.instagram_handle]) if (k) idx.set(k.toLowerCase(), b.id);
  }
  const out: string[] = [];
  for (const raw of list) {
    const id = idx.get(String(raw).trim().toLowerCase().replace(/^@/, ""));
    if (!id) {
      const hint = ctx.brands
        .filter((b) => b.id.includes(String(raw).toLowerCase().slice(0, 4)))
        .map((b) => b.id)
        .slice(0, 5);
      throw new ParamError(`Unknown brand '${raw}'.${hint.length ? ` Did you mean: ${hint.join(", ")}?` : ""}`);
    }
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

export function resolveBrand(raw: unknown, ctx: Context): string {
  const r = resolveBrands(raw ? [raw] : [], ctx, { required: true });
  return r![0];
}

export function limitOf(params: Record<string, unknown>, fallback = 50): number {
  const l = Number(params.limit ?? fallback);
  return Math.max(1, Math.min(200, Number.isFinite(l) ? l : fallback));
}
