/**
 * Insights (CMS plan, "The learning loop", step 2): each night the signals of the last 30
 * days are rolled up per role into one-sentence insights with their counts, written to
 * model_insights. Every count comes from SQL over model_events, company_versions and
 * creations; the sentences are templates, never the model.
 *
 * Who counts: live workspaces that have not switched learning off (settings.learning =
 * false keeps a workspace's signals on its own CMS page), and only what clients did (Fair
 * staff working in a workspace are left out). An insight is written only when at least
 * three workspaces stand behind it (INSIGHT_FLOOR), so no single client's choices show as
 * such; below the floor, role owners read each workspace's page instead.
 */
import { sql } from "../db/client";
import { toJson } from "../db/json";
import { INSIGHT_FLOOR, INSIGHT_WINDOW_DAYS } from "../config/learning";
import { ROLES, workspaceRoles, type RoleId, type RoleModel } from "../roles/model";
import { fairVersion } from "../roles/store";
import { POLICY_HELP, allowed } from "../roles/policy";
import { fairShown } from "../company/changes";
import { SECTIONS } from "../dashboard/sections";
import { getSkill } from "../skills/registry";
import { fairRecipes } from "../recipes/store";
import { DECK_TEMPLATES } from "../decks/templates";
import { creationShape, INTENT_LABEL, type Intent } from "./vocab";
import { composerPosition, ordinal, pct, shapeLabel } from "./labels";

export type InsightFamily = "setting" | "analysis" | "use" | "creation" | "outcome";
export type Insight = { role: RoleId; key: string; family: InsightFamily; sentence: string; counts: Record<string, unknown>; workspaces: number };
export type PoolWorkspace = { id: string; roles: RoleId[]; category: string | null };

/** The workspaces whose signals travel: live, learning not switched off. */
export async function learningPool(): Promise<PoolWorkspace[]> {
  const rows = (await sql.query("select id, kind, category, settings->'roles' as roles from workspaces where status = 'live' and coalesce(settings->>'learning', 'true') <> 'false' order by id")) as { id: string; kind: string; category: string | null; roles: unknown }[];
  return rows.map((r) => ({ id: r.id, roles: workspaceRoles(r.kind, r.roles), category: r.category }));
}

const EV = `not by_staff and created_at > now() - make_interval(days => ${INSIGHT_WINDOW_DAYS})`;
const tileLabel = (role: RoleId, key: string) => SECTIONS[role].find((s) => s.key === key)?.label ?? key;
const short = (path: string) => (POLICY_HELP[path]?.label ?? path).replace(/\s*\(.*\)$/, "");
const fmt = (v: unknown) => (typeof v === "number" ? (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100)) : String(v));
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Every insight for one role from the pool, above the floor. */
export async function computeInsights(role: RoleId, pool: PoolWorkspace[]): Promise<Insight[]> {
  const ids = pool.filter((w) => w.roles.includes(role)).map((w) => w.id);
  if (ids.length < INSIGHT_FLOOR) return [];
  const fair = (await fairVersion(role)) ?? ROLES[role];
  const out: Insight[] = [];
  out.push(...(await settingInsights(role, fair, ids)));
  out.push(...(await analysisInsights(role, fair, ids)));
  out.push(...(await useInsights(role, ids)));
  out.push(...(await creationInsights(role, ids)));
  return out;
}

// ------------------------------------------------------------------ settings

async function settingInsights(role: RoleId, fair: RoleModel, ids: string[]): Promise<Insight[]> {
  const N = ids.length;
  const cn = ROLES[role].codename;
  const rows = (await sql.query(
    "select distinct on (workspace_id) workspace_id, overrides from company_versions where role = $1 and workspace_id = any($2::text[]) order by workspace_id, version desc",
    [role, ids],
  )) as { workspace_id: string; overrides: Record<string, unknown> }[];
  const out: Insight[] = [];
  const byPath = new Map<string, unknown[]>();
  for (const r of rows) for (const [p, v] of Object.entries(r.overrides ?? {})) if (allowed(p, "company") && p !== "tiles.names" && v !== null) byPath.set(p, [...(byPath.get(p) ?? []), v]);
  for (const [p, vals] of byPath) {
    if (p === "tiles.hidden") {
      const hid = new Map<string, number>();
      for (const v of vals) for (const t of Array.isArray(v) ? v : []) hid.set(String(t), (hid.get(String(t)) ?? 0) + 1);
      for (const [t, n] of hid) if (n >= INSIGHT_FLOOR) out.push({ role, key: `tile_hidden:${t}`, family: "setting", workspaces: n, counts: { hidden: n, of: N }, sentence: `"${tileLabel(role, t)}" is hidden by ${n} of ${N} ${cn} workspaces.` });
      continue;
    }
    const n = vals.length;
    if (n < INSIGHT_FLOOR) continue;
    const nums = vals.filter((v): v is number => typeof v === "number");
    const fairV = fairShown(fair, p);
    if (nums.length === n) {
      const m = median(nums);
      out.push({ role, key: `setting:${p}`, family: "setting", workspaces: n, counts: { changed: n, of: N, median: m, fair: typeof fairV === "number" ? fairV : null }, sentence: `${short(p)}: changed from Fair's ${fmt(fairV)} in ${n} of ${N} ${cn} workspaces; median chosen value ${fmt(m)}.` });
    } else {
      const tally = new Map<string, number>();
      for (const v of vals) { const k = JSON.stringify(v); tally.set(k, (tally.get(k) ?? 0) + 1); }
      const [top, k] = [...tally].sort((a, b) => b[1] - a[1])[0];
      out.push({ role, key: `setting:${p}`, family: "setting", workspaces: n, counts: { changed: n, of: N, most_chosen: JSON.parse(top), chose_it: k }, sentence: `${short(p)}: changed in ${n} of ${N} ${cn} workspaces; ${k} chose ${fmt(JSON.parse(top))}.` });
    }
  }
  const undone = (await sql.query(
    `select payload->>'path' as path, count(*)::int as n, count(distinct workspace_id)::int as ws from model_events where kind = 'setting.undone' and role = $1 and workspace_id = any($2::text[]) and ${EV} group by 1`,
    [role, ids],
  )) as { path: string; n: number; ws: number }[];
  for (const u of undone) if (u.ws >= INSIGHT_FLOOR) out.push({ role, key: `setting_undone:${u.path}`, family: "setting", workspaces: u.ws, counts: { undos: u.n, of: N }, sentence: `${short(u.path)}: changed and then undone in ${u.ws} ${cn} workspaces (${u.n} undos in ${INSIGHT_WINDOW_DAYS} days).` });
  return out;
}

// ------------------------------------------------------------------ analyses

async function analysisInsights(role: RoleId, fair: RoleModel, ids: string[]): Promise<Insight[]> {
  const cn = ROLES[role].codename;
  const [rows, layers, intents] = (await Promise.all([
    sql.query(`select payload->>'layer' as layer, payload->>'analysis' as analysis, count(*)::int as runs, count(distinct workspace_id)::int as ws from model_events where kind = 'chat.analysis' and role = $1 and workspace_id = any($2::text[]) and payload->>'layer' in ('skill','recipe') and ${EV} group by 1, 2 order by 3 desc`, [role, ids]),
    sql.query(`select payload->>'layer' as layer, count(*)::int as runs, count(distinct workspace_id)::int as ws from model_events where kind = 'chat.analysis' and role = $1 and workspace_id = any($2::text[]) and ${EV} group by 1`, [role, ids]),
    sql.query(`select coalesce(payload->>'intent', 'other') as intent, count(*)::int as runs from model_events where kind = 'chat.analysis' and role = $1 and workspace_id = any($2::text[]) and ${EV} group by 1 order by 2 desc`, [role, ids]),
  ])) as [{ layer: string; analysis: string; runs: number; ws: number }[], { layer: string; runs: number; ws: number }[], { intent: Intent; runs: number }[]];
  const total = layers.reduce((a, r) => a + r.runs, 0);
  const wsAll = ((await sql.query(`select count(distinct workspace_id)::int as n from model_events where kind = 'chat.analysis' and role = $1 and workspace_id = any($2::text[]) and ${EV}`, [role, ids])) as { n: number }[])[0]?.n ?? 0;
  const out: Insight[] = [];
  if (!total || wsAll < INSIGHT_FLOOR) return out;
  const recipes = await fairRecipes().catch(() => new Map());
  for (const r of rows.slice(0, 6)) {
    if (r.ws < INSIGHT_FLOOR || !r.analysis) continue;
    const title = r.layer === "skill" ? getSkill(r.analysis)?.title ?? r.analysis : recipes.get(r.analysis)?.title ?? r.analysis;
    const pos = composerPosition(fair, r.analysis);
    out.push({ role, key: `analysis:${r.analysis}`, family: "analysis", workspaces: r.ws, counts: { runs: r.runs, total, share: pct(r.runs, total), position: pos },
      sentence: `${cn}: ${title} is ${pct(r.runs, total)}% of analyses (${r.runs} runs in ${r.ws} workspaces); it is ${pos ? `${ordinal(pos)} in the composer` : "not in the composer's list"}.` });
  }
  const company = layers.find((l) => l.layer === "company");
  if (company && company.ws >= INSIGHT_FLOOR) out.push({ role, key: "analysis:company", family: "analysis", workspaces: company.ws, counts: { runs: company.runs, total, share: pct(company.runs, total) }, sentence: `${cn}: teams' own skills are ${pct(company.runs, total)}% of analyses (${company.runs} runs in ${company.ws} workspaces); their shapes are under What clients make.` });
  const top = intents.filter((i) => i.intent !== "other").slice(0, 4);
  if (top.length) out.push({ role, key: "analysis:intents", family: "analysis", workspaces: wsAll, counts: Object.fromEntries(intents.map((i) => [i.intent, i.runs])), sentence: `${cn}: analyses by what they answer: ${top.map((i) => `${INTENT_LABEL[i.intent] ?? i.intent} ${pct(i.runs, total)}%`).join(", ")} (${total} runs in ${wsAll} workspaces).` });
  return out;
}

// ------------------------------------------------------------------ use

async function useInsights(role: RoleId, ids: string[]): Promise<Insight[]> {
  const cn = ROLES[role].codename;
  const out: Insight[] = [];
  const k = (await sql.query(
    `select kind, count(*)::int as n, count(distinct workspace_id)::int as ws from model_events where role = $1 and workspace_id = any($2::text[]) and ${EV} group by 1`,
    [role, ids],
  )) as { kind: string; n: number; ws: number }[];
  const c = (kind: string) => k.find((x) => x.kind === kind) ?? { n: 0, ws: 0 };
  const ratio = (key: string, num: string, den: string, say: (p: number, a: { n: number }, b: { n: number; ws: number }) => string) => {
    const a = c(num), b = c(den);
    if (b.n > 0 && b.ws >= INSIGHT_FLOOR) out.push({ role, key, family: "use", workspaces: b.ws, counts: { [num]: a.n, [den]: b.n, share: pct(a.n, b.n) }, sentence: say(pct(a.n, b.n), a, b) });
  };
  ratio("use:show_chart", "chat.show_chart", "chat.analysis", (p, a, b) => `${cn}: Show chart pressed after ${p}% of analyses (${a.n} of ${b.n}, ${b.ws} workspaces).`);
  ratio("use:pane_open", "chat.pane_open", "chat.analysis", (p, a, b) => `${cn}: the evidence pane opened after ${p}% of analyses (${a.n} of ${b.n}, ${b.ws} workspaces).`);
  ratio("use:clarify", "chat.clarify", "chat.turn", (p, a, b) => `${cn}: CeMO asked a clarifying question in ${p}% of turns (${a.n} of ${b.n}, ${b.ws} workspaces).`);
  ratio("use:copy", "chat.copy", "chat.turn", (p, a, b) => `${cn}: answers copied after ${p}% of turns (${a.n} of ${b.n}, ${b.ws} workspaces).`);
  ratio("use:ask_why", "dashboard.ask_why", "dashboard.view", (p, a, b) => `${cn}: "Ask why" pressed on ${p}% of Dashboard visits (${a.n} of ${b.n}, ${b.ws} workspaces).`);

  // one-question conversations: started over a day ago and never asked again
  const conv = ((await sql.query(
    `with t as (select payload->>'conv' as conv, workspace_id, bool_or((payload->>'first')::boolean) as started, count(*) as turns, min(created_at) as at from model_events where kind = 'chat.turn' and role = $1 and workspace_id = any($2::text[]) and ${EV} and payload ? 'conv' group by 1, 2)
     select count(*) filter (where started and at < now() - interval '1 day')::int as convs, count(*) filter (where started and turns = 1 and at < now() - interval '1 day')::int as one, count(distinct workspace_id) filter (where started)::int as ws from t`,
    [role, ids],
  )) as { convs: number; one: number; ws: number }[])[0];
  if (conv && conv.convs > 0 && conv.ws >= INSIGHT_FLOOR) out.push({ role, key: "use:one_turn", family: "use", workspaces: conv.ws, counts: { conversations: conv.convs, one_question: conv.one, share: pct(conv.one, conv.convs) }, sentence: `${cn}: ${pct(conv.one, conv.convs)}% of conversations end after one question (${conv.one} of ${conv.convs}, ${conv.ws} workspaces).` });

  // tiles: seen for two seconds per Dashboard visit, over workspaces where the tile shows
  const tiles = (await sql.query(
    `with v as (select workspace_id, count(*) as visits from model_events where kind = 'dashboard.view' and role = $1 and workspace_id = any($2::text[]) and ${EV} group by 1),
          s as (select workspace_id, payload->>'tile' as tile, count(*) as seen from model_events where kind = 'dashboard.tile_viewed' and role = $1 and workspace_id = any($2::text[]) and ${EV} group by 1, 2)
     select s.tile, sum(s.seen)::int as seen, sum(v.visits)::int as visits, count(distinct s.workspace_id)::int as ws from s join v using (workspace_id) group by 1`,
    [role, ids],
  )) as { tile: string; seen: number; visits: number; ws: number }[];
  for (const t of tiles) if (t.ws >= INSIGHT_FLOOR && t.visits > 0) out.push({ role, key: `tile_seen:${t.tile}`, family: "use", workspaces: t.ws, counts: { seen: t.seen, visits: t.visits, share: pct(t.seen, t.visits) }, sentence: `${cn}: "${tileLabel(role, t.tile)}" viewed for 2 s or more in ${pct(t.seen, t.visits)}% of Dashboard visits (${t.ws} workspaces).` });

  // decks: versions made on schedule that someone opened
  const decks = ((await sql.query(
    `with m as (select workspace_id, payload->>'report' as report from model_events where kind = 'deck.version_made' and payload->>'by' = 'cron' and role = $1 and workspace_id = any($2::text[]) and ${EV})
     select count(*)::int as made, count(*) filter (where exists (select 1 from model_events o where o.kind = 'deck.version_opened' and not o.by_staff and o.workspace_id = m.workspace_id and o.payload->>'report' = m.report))::int as opened, count(distinct workspace_id)::int as ws from m`,
    [role, ids],
  )) as { made: number; opened: number; ws: number }[])[0];
  if (decks && decks.made > 0 && decks.ws >= INSIGHT_FLOOR) out.push({ role, key: "use:deck_opened", family: "use", workspaces: decks.ws, counts: { made: decks.made, opened: decks.opened, share: pct(decks.opened, decks.made) }, sentence: `${cn}: ${pct(decks.opened, decks.made)}% of scheduled deck versions were opened (${decks.opened} of ${decks.made}, ${decks.ws} workspaces).` });

  const starts = (await sql.query(
    `select payload->>'template' as template, count(*)::int as n, count(distinct workspace_id)::int as ws from model_events where kind = 'deck.template_chosen' and role = $1 and workspace_id = any($2::text[]) and ${EV} group by 1 order by 2 desc`,
    [role, ids],
  )) as { template: string; n: number; ws: number }[];
  const startWs = ((await sql.query(`select count(distinct workspace_id)::int as n from model_events where kind = 'deck.template_chosen' and role = $1 and workspace_id = any($2::text[]) and ${EV}`, [role, ids])) as { n: number }[])[0]?.n ?? 0;
  const allStarts = starts.reduce((a, s) => a + s.n, 0);
  if (allStarts && startWs >= INSIGHT_FLOOR) {
    const name = (t: string) => DECK_TEMPLATES.find((x) => x.key === t)?.name ?? ({ scratch: "from scratch", chat: "from Chats", company: "their own templates" } as Record<string, string>)[t] ?? t;
    out.push({ role, key: "use:deck_starts", family: "use", workspaces: startWs, counts: Object.fromEntries(starts.map((s) => [s.template, s.n])), sentence: `${cn}: decks start ${starts.slice(0, 4).map((s) => `${name(s.template)} ${pct(s.n, allStarts)}%`).join(", ")} (${allStarts} decks, ${startWs} workspaces).` });
  }
  return out;
}

// ------------------------------------------------------------------ creations

/** What clients make, by shape (never by title), with how many workspaces and how often their skills run. */
export async function creationRollup(role: RoleId, ids: string[]): Promise<{ shape: string; label: string; workspaces: number; items: number; live: number; waiting: number; runs: number; workspace_ids: string[] }[]> {
  const rows = (await sql.query(
    "select id, workspace_id, kind, spec, status from creations where role = $1 and workspace_id = any($2::text[]) and status in ('draft','waiting','approved','sent_back')",
    [role, ids],
  )) as { id: string; workspace_id: string; kind: string; spec: Record<string, unknown>; status: string }[];
  const runs = (await sql.query(
    `select payload->>'analysis' as id, count(*)::int as n from model_events where kind = 'chat.analysis' and payload->>'layer' = 'company' and role = $1 and workspace_id = any($2::text[]) and ${EV} group by 1`,
    [role, ids],
  )) as { id: string; n: number }[];
  const runsOf = new Map(runs.map((r) => [r.id, r.n]));
  const by = new Map<string, { ws: Set<string>; items: number; live: number; waiting: number; runs: number }>();
  for (const c of rows) {
    const s = creationShape(c.kind, c.spec);
    const g = by.get(s) ?? { ws: new Set<string>(), items: 0, live: 0, waiting: 0, runs: 0 };
    g.ws.add(c.workspace_id);
    g.items += 1;
    if (c.status === "approved") g.live += 1;
    if (c.status === "waiting") g.waiting += 1;
    g.runs += runsOf.get(c.id) ?? 0;
    by.set(s, g);
  }
  return [...by].map(([shape, g]) => ({ shape, label: shapeLabel(shape), workspaces: g.ws.size, items: g.items, live: g.live, waiting: g.waiting, runs: g.runs, workspace_ids: [...g.ws] })).sort((a, b) => b.workspaces - a.workspaces || b.items - a.items);
}

async function creationInsights(role: RoleId, ids: string[]): Promise<Insight[]> {
  const cn = ROLES[role].codename;
  const out: Insight[] = [];
  for (const g of await creationRollup(role, ids)) {
    if (g.workspaces < INSIGHT_FLOOR) continue;
    out.push({ role, key: `creation:${g.shape}`, family: "creation", workspaces: g.workspaces, counts: { items: g.items, live: g.live, waiting: g.waiting, runs: g.runs },
      sentence: `${cn}: ${g.workspaces} workspaces made ${g.label} (${g.items} in all, ${g.live} live${g.shape.startsWith("skill.") ? `, run ${g.runs} times in ${INSIGHT_WINDOW_DAYS} days` : ""}).` });
  }
  const m = ((await sql.query(
    `select count(*) filter (where kind = 'creation.submitted')::int as sent, count(*) filter (where kind = 'creation.approved' and (payload->>'own')::boolean is not true)::int as approved,
            count(*) filter (where kind = 'creation.sent_back')::int as sent_back, count(*) filter (where kind = 'creation.rejected')::int as rejected,
            count(distinct workspace_id) filter (where kind = 'creation.submitted')::int as ws
       from model_events where role = $1 and workspace_id = any($2::text[]) and ${EV}`,
    [role, ids],
  )) as { sent: number; approved: number; sent_back: number; rejected: number; ws: number }[])[0];
  if (m && m.sent > 0 && m.ws >= INSIGHT_FLOOR) out.push({ role, key: "creation:approvals", family: "creation", workspaces: m.ws, counts: m, sentence: `${cn}: Members sent ${m.sent} creations to their Builders; ${m.approved} approved, ${m.sent_back} sent back, ${m.rejected} rejected (${m.ws} workspaces).` });
  return out;
}

// ------------------------------------------------------------------ store

/** Recompute today's insights for every role (the nightly cron); returns how many each role has. */
export async function rollUp(): Promise<Record<RoleId, number> & { pool: number }> {
  const pool = await learningPool();
  const res = { pool: pool.length } as Record<RoleId, number> & { pool: number };
  const { outcomeInsights } = await import("./outcomes");
  for (const role of Object.keys(ROLES) as RoleId[]) {
    const list = [...(await computeInsights(role, pool)), ...(await outcomeInsights(role))];
    const version = (await fairVersion(role))?.version ?? ROLES[role].version;
    await sql.query("delete from model_insights where role = $1 and day = current_date", [role]);
    for (const i of list) {
      await sql.query(
        "insert into model_insights (role, role_version, key, family, sentence, counts, workspaces, day) values ($1, $2, $3, $4, $5, $6::jsonb, $7, current_date) on conflict (role, key, day) do update set sentence = excluded.sentence, counts = excluded.counts, workspaces = excluded.workspaces, family = excluded.family",
        [role, version, i.key, i.family, i.sentence, toJson(i.counts), i.workspaces],
      );
    }
    res[role] = list.length;
  }
  return res;
}

export type StoredInsight = { key: string; family: InsightFamily; sentence: string; counts: Record<string, unknown>; workspaces: number; day: string; role_version: string | null; first_day: string };

/** The latest day's insights for a role, each with the day it first appeared. */
export async function latestInsights(role: RoleId): Promise<StoredInsight[]> {
  return (await sql.query(
    `select i.key, i.family, i.sentence, i.counts, i.workspaces, i.day::text as day, i.role_version, (select min(day)::text from model_insights f where f.role = i.role and f.key = i.key) as first_day
       from model_insights i where i.role = $1 and i.day = (select max(day) from model_insights where role = $1) order by i.family, i.workspaces desc, i.key`,
    [role],
  )) as StoredInsight[];
}
