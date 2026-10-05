/**
 * A listening workspace's contract, held in the CMS (CMS plan, "Migrating what is
 * hardcoded today", step 2): brands with their handles and relevance terms in
 * brand_handles / brand_terms, the sentiment map in data_sources. The loader reads it
 * from here; etl/listening/<workspace>.json is now an export of this state, and importing
 * that file seeds it (Fintech's, once).
 */
import { readFileSync } from "node:fs";
import { sql } from "../db/client";
import { toJson } from "../db/json";

export type ContractBrand = { name: string; handles: string[]; terms: string[]; never?: string[] };
export type Contract = {
  workspace: string;
  name: string;
  category?: string | null;
  client: string | null;
  brands: Record<string, ContractBrand>;
  /** the dump's sentiment labels → positive | neutral | negative | null */
  sentiment_map: Record<string, "positive" | "neutral" | "negative" | null>;
  settings?: Record<string, unknown>;
};

export const SLUG = /^[a-z0-9][a-z0-9_.-]{1,59}$/;
export const SENTIMENTS = ["positive", "neutral", "negative"] as const;

/** The workspace's source row (one per workspace for now), made on first use. */
export async function sourceOf(ws: string): Promise<{ id: string; config: SourceConfig }> {
  const rows = (await sql.query("select id, config from data_sources where workspace_id = $1 order by created_at limit 1", [ws])) as { id: string; config: SourceConfig }[];
  if (rows[0]) return rows[0];
  const made = (await sql.query("insert into data_sources (workspace_id) values ($1) returning id, config", [ws])) as { id: string; config: SourceConfig }[];
  return made[0];
}

export type StoredFile = { table: string; name: string; url: string; size: number; at: string };
export type SourceConfig = {
  files?: Record<string, StoredFile>;
  sentiment_map?: Contract["sentiment_map"];
  inspect?: unknown;
  inspected_at?: string;
};

export async function patchSource(ws: string, patch: Partial<SourceConfig>): Promise<SourceConfig> {
  const s = await sourceOf(ws);
  const rows = (await sql.query("update data_sources set config = config || $2::jsonb, updated_at = now() where id = $1 returning config", [s.id, toJson(patch)])) as { config: SourceConfig }[];
  return rows[0].config;
}

/** The contract as the CMS holds it now. */
export async function contractFromDb(ws: string): Promise<Contract | null> {
  const w = ((await sql.query("select id, name, category, client_brand_id, settings from workspaces where id = $1", [ws])) as { id: string; name: string; category: string | null; client_brand_id: string | null; settings: Record<string, unknown> }[])[0];
  if (!w) return null;
  const [brands, handles, terms, src] = await Promise.all([
    sql.query("select id, name from brands where workspace_id = $1 order by created_at, id", [ws]) as unknown as Promise<{ id: string; name: string }[]>,
    sql.query("select brand_id, handle from brand_handles where workspace_id = $1 order by created_at, handle", [ws]) as unknown as Promise<{ brand_id: string; handle: string }[]>,
    sql.query("select brand_id, term, mode from brand_terms where workspace_id = $1 order by created_at, term", [ws]) as unknown as Promise<{ brand_id: string; term: string; mode: string }[]>,
    sourceOf(ws),
  ]);
  const out: Record<string, ContractBrand> = {};
  for (const b of brands) {
    const never = terms.filter((t) => t.brand_id === b.id && t.mode === "never").map((t) => t.term);
    out[b.id] = { name: b.name, handles: handles.filter((h) => h.brand_id === b.id).map((h) => h.handle), terms: terms.filter((t) => t.brand_id === b.id && t.mode === "counts").map((t) => t.term), ...(never.length ? { never } : {}) };
  }
  return { workspace: w.id, name: w.name, category: w.category, client: w.client_brand_id, brands: out, sentiment_map: src.config.sentiment_map ?? {}, settings: w.settings };
}

/**
 * Write brands, handles and terms for a workspace (the Brands step, or an imported file).
 * Brand ids are global (src/db/schema.ts), so one used by another workspace is refused.
 * Brands no longer listed are kept (their posts would go with them) unless `prune`.
 */
export async function saveBrands(ws: string, brands: Record<string, ContractBrand>, client: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const ids = Object.keys(brands);
  const bad = ids.filter((id) => !SLUG.test(id));
  if (bad.length) return { ok: false, error: `Brand ids are lowercase letters, digits, dots, dashes or underscores: ${bad.join(", ")}.` };
  const clash = (await sql.query("select id, workspace_id from brands where id = any($1::text[]) and workspace_id <> $2", [ids, ws])) as { id: string; workspace_id: string }[];
  if (clash.length) return { ok: false, error: `Already used in another workspace: ${clash.map((c) => `${c.id} (${c.workspace_id})`).join(", ")}. Pick another id.` };
  const seenHandle = new Map<string, string>();
  for (const [id, b] of Object.entries(brands)) for (const h of b.handles) {
    const k = h.trim().replace(/^@/, "").toLowerCase();
    if (seenHandle.has(k) && seenHandle.get(k) !== id) return { ok: false, error: `@${k} is under both ${seenHandle.get(k)} and ${id}.` };
    seenHandle.set(k, id);
  }
  if (client && !brands[client]) return { ok: false, error: "The client brand must be one of the brands." };
  const rows = Object.entries(brands).map(([id, b]) => ({ id, name: b.name.trim() || id, is_client: id === client, keywords: b.terms, owned: { tiktok: b.handles.map((h) => h.toLowerCase()), instagram: b.handles.map((h) => h.toLowerCase()), threads: b.handles.map((h) => h.toLowerCase()), x: b.handles.map((h) => h.toLowerCase()) } }));
  await sql.query(
    `insert into brands (id, workspace_id, name, is_client, tracked_on, owned_handles, keywords)
     select r.id, $2, r.name, r.is_client, 'both', r.owned, r.keywords from jsonb_to_recordset($1::jsonb) as r(id text, name text, is_client boolean, owned jsonb, keywords jsonb)
     on conflict (id) do update set name = excluded.name, is_client = excluded.is_client, owned_handles = excluded.owned_handles, keywords = excluded.keywords`,
    [toJson(rows), ws],
  );
  await sql.query("delete from brand_handles where workspace_id = $1", [ws]);
  await sql.query("delete from brand_terms where workspace_id = $1", [ws]);
  const hs = Object.entries(brands).flatMap(([id, b]) => [...new Set(b.handles.map((h) => h.trim().replace(/^@/, "").toLowerCase()).filter(Boolean))].map((h) => ({ brand_id: id, handle: h })));
  const ts = Object.entries(brands).flatMap(([id, b]) => [
    ...[...new Set(b.terms.map((t) => t.trim()).filter(Boolean))].map((t) => ({ brand_id: id, term: t, mode: "counts" })),
    ...[...new Set((b.never ?? []).map((t) => t.trim()).filter(Boolean))].map((t) => ({ brand_id: id, term: t, mode: "never" })),
  ]);
  if (hs.length) await sql.query("insert into brand_handles (workspace_id, brand_id, handle) select $2, r.brand_id, r.handle from jsonb_to_recordset($1::jsonb) as r(brand_id text, handle text)", [toJson(hs), ws]);
  if (ts.length) await sql.query("insert into brand_terms (workspace_id, brand_id, term, mode) select $2, r.brand_id, r.term, r.mode from jsonb_to_recordset($1::jsonb) as r(brand_id text, term text, mode text)", [toJson(ts), ws]);
  await sql.query("update workspaces set client_brand_id = $2 where id = $1", [ws, client]);
  return { ok: true };
}

/** Seed the CMS from a contract file (etl/listening/<workspace>.json). */
export async function importContract(path: string): Promise<Contract> {
  const k = JSON.parse(readFileSync(path, "utf8")) as Contract;
  const r = await saveBrands(k.workspace, k.brands, k.client ?? null);
  if (!r.ok) throw new Error(r.error);
  await patchSource(k.workspace, { sentiment_map: k.sentiment_map });
  return k;
}
