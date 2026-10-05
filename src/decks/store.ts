/** Decks and their versions over the Neon HTTP client; every query is scoped by workspace. */
import { sql } from "../db/client";
import { toJson } from "../db/json";
import { listReportFiles } from "../reports/files";
import type { DeckSpec } from "./spec";

export type DeckSource = "template" | "scratch" | "chat" | "pulse";
export type DeckRow = {
  id: string;
  workspace_id: string;
  user_id: string | null;
  name: string;
  source: DeckSource;
  template: string | null;
  spec: DeckSpec;
  recurring: boolean;
  next_run_at: string | null;
  last_period: string | null;
  last_error: string | null;
  conversation_id: string | null;
  created_at: string;
  updated_at: string;
};

/** One version of a deck: a report for one period, its slides and its files. Same shape as a weekly report on the Weekly Reports page. */
export type DeckVersion = {
  id: string;
  iso: string;
  label: string;
  from: string;
  to: string;
  client: string;
  deck: string;
  created_at: string;
  slides: { n: number; title: string }[];
  pdf: string | null;
  pptx: string | null;
  narrative_by: "model" | "fallback" | null;
};

export async function listDecks(workspaceId: string): Promise<(DeckRow & { versions: number; latest: { id: string; label: string; created_at: string } | null })[]> {
  return (await sql.query(
    `select d.*, (select count(*)::int from reports r where r.deck_id = d.id) as versions,
            (select jsonb_build_object('id', r.id, 'label', r.blocks->'week'->>'label', 'created_at', r.created_at)
               from reports r where r.deck_id = d.id order by r.blocks->'week'->>'from' desc, r.created_at desc limit 1) as latest
     from decks d where d.workspace_id = $1 order by d.updated_at desc`,
    [workspaceId],
  )) as (DeckRow & { versions: number; latest: { id: string; label: string; created_at: string } | null })[];
}

export async function getDeck(id: string, workspaceId: string): Promise<DeckRow | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const r = (await sql.query("select * from decks where id = $1 and workspace_id = $2", [id, workspaceId])) as DeckRow[];
  return r[0] ?? null;
}

export async function createDeck(d: { workspaceId: string; userId: string | null; name: string; source: DeckSource; template: string | null; spec: DeckSpec; recurring: boolean; conversationId?: string | null }): Promise<DeckRow> {
  const r = (await sql.query(
    "insert into decks (workspace_id, user_id, name, source, template, spec, recurring, conversation_id) values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8) returning *",
    [d.workspaceId, d.userId, d.name, d.source, d.template, toJson(d.spec), d.recurring, d.conversationId ?? null],
  )) as DeckRow[];
  return r[0];
}

export async function updateDeck(id: string, workspaceId: string, patch: { name?: string; spec?: DeckSpec; recurring?: boolean; next_run_at?: string | null }): Promise<DeckRow | null> {
  const r = (await sql.query(
    `update decks set name = coalesce($3, name), spec = coalesce($4::jsonb, spec), recurring = coalesce($5, recurring),
            next_run_at = case when $6::boolean then $7::timestamptz else next_run_at end, updated_at = now()
     where id = $1 and workspace_id = $2 returning *`,
    [id, workspaceId, patch.name ?? null, patch.spec ? toJson(patch.spec) : null, patch.recurring ?? null, patch.next_run_at !== undefined, patch.next_run_at ?? null],
  )) as DeckRow[];
  return r[0] ?? null;
}

/** After a run: the period it made, when to look again, and what went wrong if it did. */
export async function markDeckRun(id: string, p: { last_period?: string | null; next_run_at: string | null; error: string | null }): Promise<void> {
  await sql.query(
    "update decks set last_period = coalesce($2, last_period), next_run_at = $3, last_error = $4, updated_at = now() where id = $1",
    [id, p.last_period ?? null, p.next_run_at, p.error],
  );
}

/** Delete a deck; its versions and their files go with it. */
export async function deleteDeck(id: string, workspaceId: string): Promise<boolean> {
  const r = (await sql.query("delete from decks where id = $1 and workspace_id = $2 returning id", [id, workspaceId])) as { id: string }[];
  return r.length > 0;
}

/** Every version, oldest period first; one per period (the newest made). */
export async function deckVersions(deckId: string, workspaceId: string): Promise<DeckVersion[]> {
  const rows = (await sql.query(
    `select id, created_at, blocks->'week' as week, blocks->>'client' as client, blocks->>'title' as deck, blocks->>'narrative_by' as narrative_by,
            coalesce((select jsonb_agg(jsonb_build_object('n', s->'n', 'title', s->'title')) from jsonb_array_elements(blocks->'slides') s), '[]'::jsonb) as slides
     from reports where workspace_id = $1 and deck_id = $2 and jsonb_typeof(blocks->'slides') = 'array'
     order by created_at desc`,
    [workspaceId, deckId],
  )) as { id: string; created_at: string; week: { iso: string; label: string; from: string; to: string }; client: string; deck: string; narrative_by: "model" | "fallback" | null; slides: { n: number; title: string }[] }[];
  const seen = new Set<string>();
  const kept = rows.filter((r) => (seen.has(r.week.iso) ? false : (seen.add(r.week.iso), true)));
  const files = await listReportFiles(kept.map((r) => r.id), workspaceId);
  return kept
    .map((r) => ({
      id: r.id, iso: r.week.iso, label: r.week.label, from: r.week.from, to: r.week.to, client: r.client, deck: r.deck, created_at: r.created_at, slides: r.slides, narrative_by: r.narrative_by,
      pdf: files.find((f) => f.report_id === r.id && f.format === "pdf")?.id ?? null,
      pptx: files.find((f) => f.report_id === r.id && f.format === "pptx")?.id ?? null,
    }))
    .sort((a, b) => a.from.localeCompare(b.from));
}

/** Older versions of the same period, once a newer one is stored. */
export async function pruneVersions(deckId: string, workspaceId: string, iso: string, keep: string): Promise<void> {
  await sql.query("delete from reports where workspace_id = $1 and deck_id = $2 and blocks->'week'->>'iso' = $3 and id <> $4", [workspaceId, deckId, iso, keep]);
}

/** Recurring decks whose next look is due. */
export async function dueDecks(limit = 2): Promise<DeckRow[]> {
  return (await sql.query("select * from decks where recurring and next_run_at is not null and next_run_at <= now() and workspace_id in (select id from workspaces where status = 'live') order by next_run_at limit $1", [limit])) as DeckRow[];
}
