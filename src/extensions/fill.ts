/**
 * Filling an extension (CMS plan, "Client extensions"). Three sources:
 *   rule  keyword rules computed in SQL over every row in scope (free; refreshed daily)
 *   file  values a Builder uploads (creator handles or post links, and a value each)
 *   cemo  CeMO reads each row and names one value (or none): the main cost, per row read
 * Before anyone approves, a sample shows what it would do and an estimate says what it
 * costs now and a day after. Every count is SQL; the model only names values. Rule terms
 * reach the database as parameters, never as SQL.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { sql } from "../db/client";
import { anthropicClient, toolAnswer } from "../chat/client";
import { modelId } from "../chat/loop";
import { CREDIT_PRICES, EXTENSION_SAMPLE_ROWS } from "../config/credits";
import { canSpend, charge } from "../credits/ledger";
import { matchValue, NONE, type Estimate, type ExtDef, type ExtScope } from "./spec";

const r2 = (x: number) => Math.round(x * 100) / 100;
/** a rule's words as whole-word patterns (Postgres \m \M), every regex character escaped: words, never SQL or a pattern of the model's own */
export const wordPattern = (t: string) => `\\m${t.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}\\M`;

/**
 * The rows an extension covers, as SQL over the workspace with its scope as parameters.
 * Returns the from-and-where (alias x for the row, ref for its id as text, label and text to read).
 */
export function scopeSql(def: Pick<ExtDef, "target" | "workspace_id"> & { spec: { scope?: ExtScope } }, add: (v: unknown) => string): { from: string; ref: string; label: string; text: string; created: string } {
  const s = def.spec.scope ?? {};
  const ws = add(def.workspace_id);
  const postScope = (alias: string) => [
    `${alias}.relevant is not false and ${alias}.brought_in_by = 'panel'`,
    ...(s.brands?.length ? [`${alias}.brand_id = any(${add(s.brands)}::text[])`] : []),
    ...(s.platforms?.length ? [`${alias}.platform = any(${add(s.platforms)}::text[])`] : []),
  ];
  if (def.target === "creator") {
    const inner = [`p.creator_id = x.id`, ...postScope("p"), ...(s.since ? [`p.posted_at >= ${add(s.since)}::date`] : [])].join(" and ");
    return {
      from: `creators x where x.workspace_id = ${ws} and exists (select 1 from posts p where ${inner})${s.min_followers ? ` and x.followers_latest >= ${add(s.min_followers)}` : ""}`,
      ref: "x.id::text",
      label: "'@' || x.handle",
      text: "coalesce(x.display_name, '') || ' · ' || (select string_agg(left(coalesce(p.caption, ''), 300), ' | ') from (select caption from posts p where p.creator_id = x.id and p.relevant is not false and p.brought_in_by = 'panel' order by p.posted_at desc nulls last limit 3) p)",
      created: "x.created_at",
    };
  }
  if (def.target === "post") {
    return {
      from: `posts x where x.workspace_id = ${ws} and ${postScope("x").join(" and ")}${s.since ? ` and x.posted_at >= ${add(s.since)}::date` : ""}${s.min_views ? ` and x.views >= ${add(s.min_views)}` : ""}`,
      ref: "x.id::text",
      label: "coalesce('@' || x.creator_handle, x.platform) || ' · ' || to_char(x.posted_at, 'DD Mon')",
      text: "left(coalesce(x.caption, ''), 600)",
      created: "x.created_at",
    };
  }
  return {
    from: `comments x join posts p on p.id = x.post_id where x.workspace_id = ${ws} and x.sentiment_source is distinct from 'subject' and ${postScope("p").join(" and ")}${s.since ? ` and x.posted_at >= ${add(s.since)}::date` : ""}`,
    ref: "x.id::text",
    label: "coalesce(x.platform, '') || ' comment'",
    text: "left(coalesce(x.text, ''), 400)",
    created: "x.created_at",
  };
}

/** the rule's SQL: the first rule whose words appear wins; null when none does */
function ruleCase(def: ExtDef, add: (v: unknown) => string, text: string): string {
  const rules = def.spec.rules ?? [];
  if (!rules.length) return "null::text";
  const whens = rules.map((r) => `when lower(${text}) ~ any(${add(r.terms.map(wordPattern))}::text[]) then ${add(r.value)}::text`);
  return `case ${whens.join(" ")} else null end`;
}

/** for a creator, the words may sit in the handle, the name or any of their captions */
function ruleText(def: ExtDef): string {
  return def.target === "creator"
    ? "(x.handle || ' ' || coalesce(x.display_name, '') || ' ' || coalesce((select string_agg(coalesce(p.caption, ''), ' ') from (select caption from posts p where p.creator_id = x.id and p.relevant is not false and p.brought_in_by = 'panel' order by p.posted_at desc nulls last limit 20) p), ''))"
    : def.target === "post" ? "coalesce(x.caption, '')" : "coalesce(x.text, '')";
}

/** Fill (or refresh) a rule extension over every row in scope, in one statement. */
export async function fillRules(def: ExtDef): Promise<number> {
  const args: unknown[] = [];
  const add = (v: unknown) => { args.push(v); return `$${args.length}`; };
  const sc = scopeSql(def, add);
  const value = ruleCase(def, add, ruleText(def));
  const rows = (await sql.query(
    `insert into ext_values (def_id, workspace_id, row_ref, value, source)
     select ${add(def.id)}::uuid, ${add(def.workspace_id)}, ${sc.ref}, ${value}, 'rule' from ${sc.from}
     on conflict (def_id, row_ref) do update set value = excluded.value, source = 'rule' returning 1`,
    args,
  )) as unknown[];
  return rows.length;
}

/** How many rows are in scope, how many are read, and how many arrive a day (last 30 days). */
export async function scopeCounts(def: ExtDef): Promise<{ rows: number; done: number; per_day: number }> {
  const args: unknown[] = [];
  const add = (v: unknown) => { args.push(v); return `$${args.length}`; };
  const sc = scopeSql(def, add);
  const id = add(def.id);
  const r = (await sql.query(
    `select count(*)::int as rows, count(*) filter (where exists (select 1 from ext_values v where v.def_id = ${id}::uuid and v.row_ref = ${sc.ref}))::int as done,
            count(*) filter (where ${sc.created} > now() - interval '30 days')::int as recent from ${sc.from}`,
    args,
  )) as { rows: number; done: number; recent: number }[];
  return { rows: r[0]?.rows ?? 0, done: r[0]?.done ?? 0, per_day: Math.round(((r[0]?.recent ?? 0) / 30) * 10) / 10 };
}

/** Rows in scope not read yet, oldest first. */
async function unread(def: ExtDef, limit: number, random = false): Promise<{ ref: string; label: string; text: string }[]> {
  const args: unknown[] = [];
  const add = (v: unknown) => { args.push(v); return `$${args.length}`; };
  const sc = scopeSql(def, add);
  return (await sql.query(
    `select ${sc.ref} as ref, ${sc.label} as label, ${sc.text} as text from ${sc.from}
       and not exists (select 1 from ext_values v where v.def_id = ${add(def.id)}::uuid and v.row_ref = ${sc.ref})
     order by ${random ? "random()" : sc.created} limit ${add(limit)}`,
    args,
  )) as { ref: string; label: string; text: string }[];
}

/** what reads a batch of rows: the model by default; a test or a dry run may pass its own */
export type Tagger = (def: ExtDef, rows: { ref: string; label: string; text: string }[]) => Promise<Record<string, string | null>>;

const TAG_TOOL: Anthropic.Tool = {
  name: "tag_rows",
  description: "Give each row the one value that fits it, or none.",
  input_schema: { type: "object", properties: { tags: { type: "array", items: { type: "object", properties: { ref: { type: "string" }, value: { type: "string" } }, required: ["ref", "value"] } } }, required: ["tags"] },
};

/** CeMO reads a batch and names a value per row; values outside the definition count as none. Metered per workspace. */
export const modelTagger: Tagger = async (def, rows) => {
  const client = anthropicClient({ workspace: def.workspace_id, purpose: "extension", ref: def.id });
  const what = def.target === "creator" ? "creator (handle, name and recent captions)" : def.target === "post" ? "post caption" : "comment";
  const values = def.values.map((v) => `- ${v.name}${v.description ? `: ${v.description}` : ""}${v.hint ? ` (recognise by: ${v.hint})` : ""}`).join("\n");
  const prompt = [
    `Each row below is a ${what} from Indonesian social media. For each, choose the one value of "${def.name}" that fits, or "none" when the text does not say enough. Do not guess beyond the text.`,
    def.spec.guide ? `How the team decides: ${def.spec.guide}` : "",
    `Values:\n${values}`,
    `Rows:\n${rows.map((r) => `[${r.ref}] ${r.label}: ${r.text.replace(/\s+/g, " ").slice(0, 700)}`).join("\n")}`,
  ].filter(Boolean).join("\n\n");
  const { use } = await toolAnswer((req) => client.messages.create(req), { model: modelId(), max_tokens: 4000, tools: [TAG_TOOL], messages: [{ role: "user", content: prompt }] }, "tag_rows");
  const out: Record<string, string | null> = {};
  for (const t of ((use?.input as { tags?: { ref: string; value: string }[] })?.tags ?? [])) {
    if (rows.some((r) => r.ref === t.ref)) out[t.ref] = matchValue(def.values, t.value);
  }
  return out;
};

const BATCH = 25;

/** Read up to `limit` unread rows with CeMO and save the values, charging per row read; stops at the workspace's cap. */
export async function tagRows(def: ExtDef, limit: number, opts: { tagger?: Tagger; email?: string | null; staff?: boolean; random?: boolean; kindNote?: string } = {}): Promise<{ read: number; credits: number; stopped?: string; tagged: { ref: string; label: string; text: string; value: string | null }[] }> {
  const tagger = opts.tagger ?? modelTagger;
  const rows = await unread(def, limit, opts.random);
  const tagged: { ref: string; label: string; text: string; value: string | null }[] = [];
  let credits = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const cost = r2(batch.length * CREDIT_PRICES.extension_row);
    const ok = await canSpend(def.workspace_id, cost);
    if (!ok.ok) return { read: tagged.length, credits, stopped: ok.message, tagged };
    const got = await tagger(def, batch);
    const refs = batch.map((r) => r.ref);
    const values = batch.map((r) => got[r.ref] ?? null);
    await sql.query(
      `insert into ext_values (def_id, workspace_id, row_ref, value, source) select $1::uuid, $2, r, v, 'cemo' from unnest($3::text[], $4::text[]) as t(r, v)
       on conflict (def_id, row_ref) do nothing`,
      [def.id, def.workspace_id, refs, values],
    );
    await charge({ ws: def.workspace_id, email: opts.email ?? def.maker_email, staff: opts.staff, kind: "extension_row", credits: cost, ref: def.id, note: `${def.name}: ${batch.length} rows read${opts.kindNote ? ` (${opts.kindNote})` : ""}` });
    credits = r2(credits + cost);
    batch.forEach((r, k) => tagged.push({ ...r, value: values[k] }));
  }
  return { read: tagged.length, credits, tagged };
}

/** What a rule extension would say, over every row in scope, without saving: counts per value and a few examples. */
async function ruleSample(def: ExtDef): Promise<{ counts: Record<string, number>; examples: Estimate["examples"] }> {
  const args: unknown[] = [];
  const add = (v: unknown) => { args.push(v); return `$${args.length}`; };
  const sc = scopeSql(def, add);
  const value = ruleCase(def, add, ruleText(def));
  const rows = (await sql.query(
    `with v as (select ${sc.ref} as ref, ${sc.label} as label, ${sc.text} as text, ${value} as value from ${sc.from})
     select value, count(*)::int as n, (array_agg(json_build_object('ref', ref, 'label', label, 'text', left(text, 200))))[1:3] as ex from v group by value order by n desc`,
    args,
  )) as { value: string | null; n: number; ex: { ref: string; label: string; text: string }[] }[];
  const counts: Record<string, number> = {};
  const examples: Estimate["examples"] = [];
  for (const r of rows) {
    counts[r.value ?? NONE] = r.n;
    if (r.value) for (const e of r.ex ?? []) examples.push({ ...e, value: r.value });
  }
  return { counts, examples: examples.slice(0, 12) };
}

/**
 * Sample, then estimate (CMS plan): a rule is counted over every row for free; CeMO reads
 * 50 rows (paid, and kept, so they are not read again) and the rest is priced from there.
 */
export async function sampleAndEstimate(def: ExtDef, opts: { tagger?: Tagger; email?: string | null; staff?: boolean } = {}): Promise<Estimate & { stopped?: string }> {
  if (def.source === "rule") {
    const [s, c] = await Promise.all([ruleSample(def), scopeCounts(def)]);
    return { rows: c.rows, done: 0, credits_now: 0, credits_per_day: 0, new_rows_per_day: c.per_day, counts: s.counts, examples: s.examples, sample_credits: 0 };
  }
  if (def.source === "file") {
    const c = await scopeCounts(def);
    return { rows: c.rows, done: c.done, credits_now: 0, credits_per_day: 0, new_rows_per_day: 0, counts: {}, examples: [], sample_credits: 0 };
  }
  const t = await tagRows(def, EXTENSION_SAMPLE_ROWS, { ...opts, random: true, kindNote: "sample" });
  const c = await scopeCounts(def);
  const counts: Record<string, number> = {};
  for (const x of t.tagged) counts[x.value ?? NONE] = (counts[x.value ?? NONE] ?? 0) + 1;
  return {
    rows: c.rows,
    done: c.done,
    credits_now: r2((c.rows - c.done) * CREDIT_PRICES.extension_row),
    credits_per_day: r2(c.per_day * CREDIT_PRICES.extension_row),
    new_rows_per_day: c.per_day,
    counts,
    examples: t.tagged.slice(0, 12).map((x) => ({ ref: x.ref, label: x.label, text: x.text.slice(0, 200), value: x.value })),
    sample_credits: t.credits,
    ...(t.stopped ? { stopped: t.stopped } : {}),
  };
}

/** A file's values: rows of key (creator handle or post link) and value. Unknown keys and values are reported, not guessed. */
export async function fillFromFile(def: ExtDef, rows: { key: string; value: string }[]): Promise<{ saved: number; unknown_keys: string[]; unknown_values: string[] }> {
  const unknownValues = new Set<string>();
  const clean = rows.map((r) => ({ key: r.key.trim(), value: matchValue(def.values, r.value), raw: r.value })).filter((r) => {
    if (!r.value && r.raw.trim()) unknownValues.add(r.raw.trim());
    return r.key && r.value;
  });
  if (def.target === "comment") return { saved: 0, unknown_keys: [], unknown_values: [] };
  const keys = clean.map((r) => (def.target === "creator" ? r.key.replace(/^@/, "").toLowerCase() : r.key));
  const found = (def.target === "creator"
    ? await sql.query("select id::text as ref, lower(handle) as k from creators where workspace_id = $1 and lower(handle) = any($2::text[])", [def.workspace_id, keys])
    : await sql.query("select id::text as ref, url as k from posts where workspace_id = $1 and url = any($2::text[])", [def.workspace_id, keys])) as { ref: string; k: string }[];
  const byKey = new Map<string, string[]>();
  for (const f of found) byKey.set(f.k, [...(byKey.get(f.k) ?? []), f.ref]);
  const refs: string[] = [];
  const values: string[] = [];
  const unknownKeys: string[] = [];
  clean.forEach((r, i) => {
    const hit = byKey.get(keys[i]);
    if (!hit) unknownKeys.push(r.key);
    else for (const ref of hit) { refs.push(ref); values.push(r.value!); }
  });
  if (refs.length) {
    await sql.query(
      `insert into ext_values (def_id, workspace_id, row_ref, value, source) select $1::uuid, $2, r, v, 'file' from unnest($3::text[], $4::text[]) as t(r, v)
       on conflict (def_id, row_ref) do update set value = excluded.value, source = 'file'`,
      [def.id, def.workspace_id, refs, values],
    );
  }
  return { saved: refs.length, unknown_keys: unknownKeys.slice(0, 50), unknown_values: [...unknownValues].slice(0, 20) };
}
