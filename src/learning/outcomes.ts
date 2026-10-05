/**
 * Where a version came from and what it changed (CMS plan, "The learning loop", steps 3–5).
 *
 * Origins: a role owner records what a version started from (insights, client creations,
 * Builders' suggestions) as references on role_versions.origins; the CMS names them to
 * Fair, and the release can say "started from creations in three workspaces" without
 * naming anyone. Measures: role_versions.measures lists what the version should move.
 *
 * Before and after: for each workspace in the learning pool, the 28 days before the
 * version reached it against the 28 days after (from its first signal on the version; a
 * staged release reaches workspaces at different times), for the workspaces that took
 * the version against those that stayed on another one (pinned, or outside the stage): a
 * natural control. Every count is SQL over model_events; nothing is estimated.
 */
import { sql } from "../db/client";
import { toJson } from "../db/json";
import { INSIGHT_FLOOR, MEASURE_DAYS, MEASURE_INTERIM_DAYS } from "../config/learning";
import { ROLES, type RoleId } from "../roles/model";
import { audit, type Who } from "../roles/store";
import { fairRecipes } from "../recipes/store";
import { getSkill } from "../skills/registry";
import { learningPool, type Insight } from "./insights";
import { measureOf, type Count, type Measure } from "./measures";

export type Origin = { kind: "insight" | "creation" | "suggestion"; ref: string };
export const isOrigin = (o: unknown): o is Origin => !!o && typeof o === "object" && ["insight", "creation", "suggestion"].includes((o as Origin).kind) && typeof (o as Origin).ref === "string" && /^[a-z0-9_.:@-]{1,80}$/i.test((o as Origin).ref);

type Result = { ok: true } | { ok: false; error: string };

/** Record what a version started from and what it should move. Role owners while it is a draft or proposal; Refal or Rafli any time. */
export async function setOrigins(role: RoleId, version: string, origins: Origin[], measures: string[], who: Who): Promise<Result> {
  const owner = who.staff.includes("owner");
  if (!owner && !who.staff.includes("role_owner")) return { ok: false, error: `${who.email} is not a role owner.` };
  const clean = origins.filter(isOrigin).slice(0, 40);
  const ms = [...new Set(measures.filter((m) => measureOf(m)))].slice(0, 12);
  const rows = (await sql.query(
    `update role_versions set origins = $3::jsonb, measures = $4::text[] where role = $1 and version = $2 ${owner ? "" : "and status in ('draft','proposed')"} returning version`,
    [role, version, toJson(clean), ms],
  )) as unknown[];
  if (!rows.length) return { ok: false, error: owner ? "No such version." : "Only a draft or a proposal can change what it started from." };
  await audit({ actor: who.email, area: "role", action: "origins", path: `${role}@${version}`, new: { origins: clean.length, measures: ms } });
  return { ok: true };
}

export type OriginDetail = Origin & { text: string; workspace_id: string | null; workspace_name: string | null; category: string | null };

/** The origins with what they point at, for Fair's eyes only (creation titles and client names). */
export async function originDetails(role: RoleId, origins: Origin[]): Promise<OriginDetail[]> {
  const out: OriginDetail[] = [];
  for (const o of origins) {
    if (o.kind === "insight") {
      const r = (await sql.query("select sentence from model_insights where role = $1 and key = $2 order by day desc limit 1", [role, o.ref])) as { sentence: string }[];
      out.push({ ...o, text: r[0]?.sentence ?? o.ref, workspace_id: null, workspace_name: null, category: null });
    } else {
      const r = (await sql.query(
        o.kind === "creation"
          ? "select c.title as text, c.workspace_id, w.name, w.category from creations c join workspaces w on w.id = c.workspace_id where c.id::text = $1"
          : "select coalesce(c.title, s.ref) || ': ' || s.note as text, s.workspace_id, w.name, w.category from fair_suggestions s join workspaces w on w.id = s.workspace_id left join creations c on s.ref_kind = 'creation' and c.id::text = s.ref where s.id::text = $1",
        [o.ref],
      )) as { text: string; workspace_id: string; name: string; category: string | null }[];
      out.push({ ...o, text: r[0]?.text ?? "(gone)", workspace_id: r[0]?.workspace_id ?? null, workspace_name: r[0]?.name ?? null, category: r[0]?.category ?? null });
    }
  }
  return out;
}

const NUM_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const words = (n: number) => NUM_WORDS[n] ?? String(n);

/** "Started from creations in three fintech workspaces and one insight": counts and categories, never a client's name. */
export function originPhrase(details: OriginDetail[]): string {
  const parts: string[] = [];
  const fromClients = (kind: Origin["kind"], noun: string) => {
    const d = details.filter((x) => x.kind === kind);
    if (!d.length) return;
    const ws = new Set(d.map((x) => x.workspace_id).filter(Boolean));
    const cats = [...new Set(d.map((x) => x.category).filter(Boolean))];
    parts.push(`${noun} in ${words(ws.size)} ${cats.length === 1 ? `${cats[0]} ` : ""}workspace${ws.size === 1 ? "" : "s"}`);
  };
  fromClients("creation", "creations");
  fromClients("suggestion", "suggestions");
  const ins = details.filter((x) => x.kind === "insight").length;
  if (ins) parts.push(`${words(ins)} insight${ins === 1 ? "" : "s"}`);
  return parts.length ? `Started from ${parts.join(" and ")}.` : "";
}

// ------------------------------------------------------------------ before and after

export type GroupReading = { workspaces: number; before: number | null; after: number | null; num_before: number; num_after: number; den_before: number; den_after: number };
export type MeasureReading = { key: string; label: string; unit: Measure["unit"]; took: GroupReading; stayed: GroupReading };
export type VersionReading = { role: RoleId; version: string; released_at: string | null; days: number; state: "not_released" | "too_early" | "interim" | "measured"; measures: MeasureReading[]; origins: Origin[]; keys: string[] };

const cond = (alias: string, c: Count, i: number) => `(${alias}.kind = $${i} and ($${i + 1}::text is null or ${alias}.payload->>$${i + 1} = $${i + 2}))`;

/** One measure for one version: per workspace, the window before it reached the workspace and the window after. */
async function readMeasure(role: RoleId, version: string, releasedAt: string, ids: string[], m: Measure): Promise<MeasureReading> {
  const den: Count = m.den === "week" ? { kind: "__none__" } : m.den;
  const rows = (await sql.query(
    `with f as (select workspace_id, min(created_at) as t0 from model_events where role = $1 and role_version = $2 and not by_staff and workspace_id = any($3::text[]) and created_at >= $4::timestamptz group by 1),
          a as (select distinct workspace_id from model_events where role = $1 and not by_staff and workspace_id = any($3::text[]) and created_at >= $4::timestamptz),
          g as (select a.workspace_id, f.t0 is not null as took, coalesce(f.t0, $4::timestamptz) as t0 from a left join f using (workspace_id))
     select g.workspace_id, g.took,
            count(e.id) filter (where e.created_at < g.t0 and ${cond("e", m.num, 6)})::int as num_before,
            count(e.id) filter (where e.created_at >= g.t0 and ${cond("e", m.num, 6)})::int as num_after,
            count(e.id) filter (where e.created_at < g.t0 and ${cond("e", den, 9)})::int as den_before,
            count(e.id) filter (where e.created_at >= g.t0 and ${cond("e", den, 9)})::int as den_after,
            extract(epoch from least(now(), g.t0 + make_interval(days => $5)) - g.t0) / 86400 as days_after
       from g left join model_events e on e.workspace_id = g.workspace_id and e.role = $1 and not e.by_staff
            and e.created_at >= g.t0 - make_interval(days => $5) and e.created_at < least(now(), g.t0 + make_interval(days => $5))
      group by 1, 2, g.t0`,
    [role, version, ids, releasedAt, MEASURE_DAYS, m.num.kind, m.num.field ?? null, m.num.value ?? null, den.kind, den.field ?? null, den.value ?? null],
  )) as { workspace_id: string; took: boolean; num_before: number; num_after: number; den_before: number; den_after: number; days_after: number }[];
  const group = (took: boolean): GroupReading => {
    const r = rows.filter((x) => x.took === took);
    const sum = (k: "num_before" | "num_after" | "den_before" | "den_after") => r.reduce((a, x) => a + x[k], 0);
    const nb = sum("num_before"), na = sum("num_after");
    let db = sum("den_before"), da = sum("den_after");
    if (m.den === "week") {
      // per workspace a week: each workspace's own window, in weeks
      db = r.length * (MEASURE_DAYS / 7);
      da = r.reduce((a, x) => a + Math.max(0, Number(x.days_after)) / 7, 0);
    }
    const rate = (n: number, d: number) => (d > 0 ? (m.unit === "%" ? Math.round((1000 * n) / d) / 10 : Math.round((10 * n) / d) / 10) : null);
    return { workspaces: r.length, before: rate(nb, db), after: rate(na, da), num_before: nb, num_after: na, den_before: Math.round(db * 10) / 10, den_after: Math.round(da * 10) / 10 };
  };
  return { key: m.key, label: m.label, unit: m.unit, took: group(true), stayed: group(false) };
}

/** A version's before and after on each of its measures, over the learning pool. */
export async function measureVersion(role: RoleId, version: string): Promise<VersionReading | null> {
  const rows = (await sql.query("select status, released_at, origins, measures from role_versions where role = $1 and version = $2", [role, version])) as { status: string; released_at: string | null; origins: Origin[] | null; measures: string[] | null }[];
  const v = rows[0];
  if (!v) return null;
  const origins = (v.origins ?? []).filter(isOrigin);
  if (!v.released_at) return { role, version, released_at: null, days: 0, state: "not_released", measures: [], origins, keys: v.measures ?? [] };
  const days = Math.floor((Date.now() - Date.parse(v.released_at)) / 86400000);
  const ids = (await learningPool()).filter((w) => w.roles.includes(role)).map((w) => w.id);
  const titles = await analysisTitles();
  const measures: MeasureReading[] = [];
  for (const key of v.measures ?? []) {
    const m = measureOf(key, titles);
    if (m && ids.length) measures.push(await readMeasure(role, version, v.released_at, ids, m));
  }
  return { role, version, released_at: v.released_at, days, state: days < MEASURE_INTERIM_DAYS ? "too_early" : days < MEASURE_DAYS ? "interim" : "measured", measures, origins, keys: v.measures ?? [] };
}

async function analysisTitles(): Promise<Record<string, string>> {
  const recipes = await fairRecipes().catch(() => new Map());
  const out: Record<string, string> = {};
  for (const [k, r] of recipes) out[k] = (r as { title: string }).title;
  return new Proxy(out, { get: (t, k: string) => t[k] ?? getSkill(k)?.title });
}

const show = (v: number | null, unit: Measure["unit"]) => (v == null ? "n/a" : unit === "%" ? `${v}%` : `${v} ${unit}`);

/** One plain sentence for a reading, from its numbers. */
export function readingSentence(cn: string, version: string, m: MeasureReading): string {
  const moved = m.took.before != null && m.took.after != null ? (m.took.after > m.took.before ? "rose" : m.took.after < m.took.before ? "fell" : "held") : "moved";
  const control = m.stayed.workspaces >= INSIGHT_FLOOR
    ? `; in the ${m.stayed.workspaces} that stayed, ${show(m.stayed.before, m.unit)} to ${show(m.stayed.after, m.unit)}`
    : m.stayed.workspaces > 0 ? `; ${m.stayed.workspaces === 1 ? "one workspace" : `${m.stayed.workspaces} workspaces`} stayed, too few to compare` : "; every workspace took it, so there is no control";
  return `After ${cn} ${version}, ${m.label} ${moved} from ${show(m.took.before, m.unit)} to ${show(m.took.after, m.unit)} in the ${m.took.workspaces} workspace${m.took.workspaces === 1 ? "" : "s"} that took it${control}.`;
}

/**
 * Outcome insights for the nightly roll-up: each released version measured over a full
 * window in the last 120 days, on each measure where at least three workspaces took it.
 */
export async function outcomeInsights(role: RoleId): Promise<Insight[]> {
  const versions = (await sql.query(
    `select version from role_versions where role = $1 and status = 'released' and coalesce(array_length(measures, 1), 0) > 0 and released_at < now() - make_interval(days => $2) and released_at > now() - interval '120 days'`,
    [role, MEASURE_DAYS],
  )) as { version: string }[];
  const out: Insight[] = [];
  for (const { version } of versions) {
    const r = await measureVersion(role, version);
    if (!r) continue;
    const phrase = originPhrase(await originDetails(role, r.origins));
    for (const m of r.measures) {
      if (m.took.workspaces < INSIGHT_FLOOR) continue;
      out.push({ role, key: `outcome:${version}:${m.key}`, family: "outcome", workspaces: m.took.workspaces, counts: { took: m.took, stayed: m.stayed, days: r.days }, sentence: `${readingSentence(ROLES[role].codename, version, m)}${phrase ? ` ${phrase}` : ""}` });
    }
  }
  return out;
}
