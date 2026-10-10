/**
 * Workspace health (CMS plan, "Health"; "Data quality hidden by polish" is a named risk).
 * Checks run after each load and nightly, all counted in SQL: freshness, posts a day
 * against the usual (bursts and gaps), relevance, the catch-all topic, unlabelled
 * comments, follower history, metrics coverage, own accounts that stop, failed jobs.
 * A check that fails two nights running becomes a note on the workspace that CeMO reads,
 * so it does not draw conclusions from a gap ("Own Instagram posts are not captured after 9 Sep").
 */
import { sql } from "../db/client";
import { toJson } from "../db/json";
import { invalidateWorkspace } from "../workspace/store";

export type Check = { key: string; label: string; status: "ok" | "warn" | "fail" | "info"; detail: string; note?: string };
const n = (v: unknown) => Number(v ?? 0) || 0;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const dm = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const PL: Record<string, string> = { tiktok: "TikTok", instagram: "Instagram", threads: "Threads", x: "X", youtube: "YouTube" };

export async function healthChecks(ws: string): Promise<Check[]> {
  const w = ((await sql.query("select tz, settings from workspaces where id = $1", [ws])) as { tz: string; settings: Record<string, unknown> }[])[0];
  if (!w) return [];
  const tz = w.tz || "Asia/Jakarta";
  const synced = w.settings?.source === "sync";
  const out: Check[] = [];

  // freshness per platform
  const fresh = (await sql.query(`select platform, to_char(max(posted_at at time zone $2), 'YYYY-MM-DD') as last, count(*)::int as posts from posts where workspace_id = $1 group by 1 order by 3 desc`, [ws, tz])) as { platform: string; last: string; posts: number }[];
  if (!fresh.length) return [{ key: "data", label: "Data", status: "fail", detail: "Nothing loaded yet." }];
  const today = new Date().toISOString().slice(0, 10);
  for (const f of fresh) {
    const behind = Math.round((Date.parse(today) - Date.parse(f.last)) / 86400000);
    out.push({ key: `fresh_${f.platform}`, label: `${PL[f.platform] ?? f.platform} freshness`, status: synced ? (behind > 4 ? "fail" : behind > 2 ? "warn" : "ok") : "info", detail: `${f.posts.toLocaleString("en-US")} posts, the newest from ${dm(f.last)}${synced ? ` (${behind} day${behind === 1 ? "" : "s"} behind)` : " (loaded from a dump)"}.`, ...(synced && behind > 2 ? { note: `${PL[f.platform] ?? f.platform} data is ${behind} days behind (newest post ${dm(f.last)}).` } : {}) });
  }

  // posts a day against the 28 days before: bursts and gaps over the last 35 days of data
  const days = (await sql.query(
    `with b as (select (max(posted_at at time zone $2))::date as hi from posts where workspace_id = $1),
          d as (select generate_series((select hi from b) - 34, (select hi from b), interval '1 day')::date as day)
     select to_char(d.day, 'YYYY-MM-DD') as day, (select count(*) from posts p where p.workspace_id = $1 and (p.posted_at at time zone $2)::date = d.day)::int as n from d order by 1`,
    [ws, tz],
  )) as { day: string; n: number }[];
  const counts = days.map((d) => d.n);
  const sorted = [...counts].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const bursts = days.filter((d) => median > 0 && d.n > median * 3 && d.n >= 20);
  const gaps = days.slice(0, -2).filter((d) => d.n === 0);
  out.push({ key: "rows_per_day", label: "Posts a day", status: bursts.length || gaps.length ? "warn" : "ok", detail: `Usually about ${median} a day over the last 35 days of data${bursts.length ? `; bursts on ${bursts.slice(0, 4).map((d) => `${dm(d.day)} (${d.n})`).join(", ")}` : ""}${gaps.length ? `; nothing on ${gaps.slice(0, 4).map((d) => dm(d.day)).join(", ")}` : ""}.` });

  // relevance
  const rel = (await sql.query("select platform, count(*)::int as n, count(*) filter (where relevant = false)::int as off from posts where workspace_id = $1 group by 1 order by 2 desc", [ws])) as { platform: string; n: number; off: number }[];
  const tot = rel.reduce((a, r) => a + r.n, 0), off = rel.reduce((a, r) => a + r.off, 0);
  const worst = rel.filter((r) => r.n >= 50 && pct(r.off, r.n) >= 40);
  out.push({ key: "relevance", label: "Posts about their brand", status: pct(off, tot) > 35 || worst.length ? "warn" : "ok", detail: `${off.toLocaleString("en-US")} of ${tot.toLocaleString("en-US")} posts (${pct(off, tot)}%) do not name their brand and are left out${worst.length ? `; ${worst.map((r) => `${PL[r.platform] ?? r.platform} ${pct(r.off, r.n)}%`).join(", ")} off-topic` : ""}. Adjust the terms under Relevance.` });

  // the catch-all topic and thin topics
  const tp = (await sql.query(
    `select t.label, t.is_catch_all, count(c.id)::int as n, count(c.id) filter (where c.posted_at > (select max(posted_at) from comments where workspace_id = $1) - interval '30 days')::int as month
       from topics t left join comments c on c.topic_id = t.id and c.workspace_id = $1 where t.workspace_id = $1 and t.case_id is null group by 1, 2 order by 3 desc`,
    [ws],
  )) as { label: string; is_catch_all: boolean; n: number; month: number }[];
  if (tp.length) {
    const all = tp.reduce((a, t) => a + t.n, 0);
    const ca = tp.find((t) => t.is_catch_all);
    const thin = tp.filter((t) => !t.is_catch_all && t.month < 30);
    out.push({ key: "topics", label: "Topics", status: (ca && pct(ca.n, all) > 30) || thin.length ? "warn" : "ok", detail: `${ca ? `"${ca.label}" holds ${pct(ca.n, all)}% of comments` : "No catch-all topic"}${thin.length ? `; under 30 comments in the last month: ${thin.map((t) => `${t.label} (${t.month})`).join(", ")}` : ""}.` });
  }

  // comments without a label
  const lab = ((await sql.query("select count(*)::int as n, count(*) filter (where sentiment is null and sentiment_source is distinct from 'subject')::int as unl from comments where workspace_id = $1", [ws])) as { n: number; unl: number }[])[0];
  if (lab && lab.n) out.push({ key: "labels", label: "Comment labels", status: pct(lab.unl, lab.n) > 5 ? "warn" : "ok", detail: `${lab.unl.toLocaleString("en-US")} of ${lab.n.toLocaleString("en-US")} comments (${pct(lab.unl, lab.n)}%) have no sentiment yet; they are unlabelled, not neutral.` });

  // follower history
  const fol = ((await sql.query(
    `select count(*)::int as creators, count(*) filter (where (select count(*) from creator_snapshots s where s.creator_id = c.id) > 1)::int as history, count(*) filter (where followers_latest is not null)::int as with_followers from creators c where workspace_id = $1 and brought_in_by = 'panel'`,
    [ws],
  )) as { creators: number; history: number; with_followers: number }[])[0];
  out.push({ key: "followers", label: "Follower history", status: fol.history < Math.max(1, fol.creators * 0.05) ? "warn" : "ok", detail: `${fol.with_followers.toLocaleString("en-US")} of ${fol.creators.toLocaleString("en-US")} accounts have a follower count; ${fol.history.toLocaleString("en-US")} have more than one capture${fol.history < fol.creators * 0.05 ? ", so follower growth is shown as unavailable" : ""}.`, ...(fol.history < fol.creators * 0.05 ? { note: "Follower counts are one capture per account: follower growth is not available." } : {}) });

  // metrics coverage and links
  const met = (await sql.query("select platform, count(*)::int as n, count(*) filter (where views is not null or engagements > 0)::int as m, count(*) filter (where url is null)::int as nourl, (select count(*) from post_snapshots s join posts p2 on p2.id = s.post_id where p2.workspace_id = $1 and p2.platform = p.platform)::int as snaps from posts p where workspace_id = $1 group by 1", [ws])) as { platform: string; n: number; m: number; nourl: number; snaps: number }[];
  const thinM = met.filter((r) => pct(r.m, r.n) < 80);
  out.push({ key: "metrics", label: "Performance metrics", status: thinM.length ? "warn" : "ok", detail: met.map((r) => `${PL[r.platform] ?? r.platform} ${pct(r.m, r.n)}% with views or engagement${r.snaps ? ", tracked daily" : ", no daily tracking"}`).join("; ") + "." });

  // own accounts that stop before the data does
  const own = (await sql.query(
    `with hi as (select (max(posted_at at time zone $2))::date as d from posts where workspace_id = $1)
     select b.name, p.platform, to_char(max(p.posted_at at time zone $2), 'YYYY-MM-DD') as last, count(*)::int as n, max(c.n)::int as busiest
       from posts p join brands b on b.id = p.brand_id
       left join lateral (select count(*)::int as n from posts p2 where p2.workspace_id = $1 and p2.brand_id = p.brand_id and p2.platform = p.platform and p2.source = 'owned' group by (p2.posted_at at time zone $2)::date order by 1 desc limit 1) c on true
      where p.workspace_id = $1 and p.source = 'owned' group by 1, 2 having max((p.posted_at at time zone $2)::date) < (select d from hi) - 7 or max(c.n) >= 20`,
    [ws, tz],
  )) as { name: string; platform: string; last: string; n: number; busiest: number }[];
  const end = fresh.map((f) => f.last).sort().at(-1)!;
  const stopped = own.filter((o) => Date.parse(end) - Date.parse(o.last) > 7 * 86400000);
  if (own.length) {
    out.push({
      key: "own_accounts", label: "Own accounts", status: "warn",
      detail: own.map((o) => `${o.name} on ${PL[o.platform] ?? o.platform}: ${[o.busiest >= 20 ? `up to ${o.busiest} own posts on one day` : "", stopped.includes(o) ? `none after ${dm(o.last)}` : ""].filter(Boolean).join("; ")}`).join("; ") + ".",
      ...(stopped.length ? { note: stopped.map((o) => `${o.name}'s own ${PL[o.platform] ?? o.platform} posts are not captured after ${dm(o.last)}.`).join(" ") } : {}),
    });
  } else out.push({ key: "own_accounts", label: "Own accounts", status: "ok", detail: "Every brand's own posts run to the end of the data." });

  // failed jobs
  const jobs = ((await sql.query("select count(*) filter (where status = 'failed')::int as failed, max(error) filter (where status = 'failed') as err from cms_jobs where workspace_id = $1 and updated_at > now() - interval '7 days'", [ws])) as { failed: number; err: string | null }[])[0];
  out.push({ key: "jobs", label: "Jobs", status: jobs.failed ? "fail" : "ok", detail: jobs.failed ? `${jobs.failed} failed in the last week: ${jobs.err}` : "None failed in the last week." });
  return out;
}

export type HealthState = { at: string; checks: Check[]; streak: Record<string, number> };

/** Run the checks and keep them; a check that fails or warns two runs in a row adds its note for CeMO (once). */
export async function recordHealth(ws: string): Promise<HealthState> {
  const checks = await healthChecks(ws);
  const s = ((await sql.query("select settings from workspaces where id = $1", [ws])) as { settings: { health?: HealthState; notes?: { text: string; source: string; at: string }[] } }[])[0]?.settings ?? {};
  const streak: Record<string, number> = {};
  for (const c of checks) streak[c.key] = c.status === "warn" || c.status === "fail" ? (s.health?.streak?.[c.key] ?? 0) + 1 : 0;
  const notes = [...(s.notes ?? [])];
  for (const c of checks) if (c.note && streak[c.key] >= 2 && !notes.some((x) => x.text === c.note)) notes.push({ text: c.note, source: "health", at: new Date().toISOString() });
  const state: HealthState = { at: new Date().toISOString(), checks, streak };
  await sql.query("update workspaces set settings = settings || $2::jsonb where id = $1", [ws, toJson({ health: state, notes })]);
  invalidateWorkspace(ws);
  return state;
}

/** Notes on the workspace (from data ops or from health) that CeMO reads before answering. */
export async function workspaceNotes(ws: string): Promise<string[]> {
  const s = ((await sql.query("select settings->'notes' as notes from workspaces where id = $1", [ws])) as { notes: { text: string }[] | null }[])[0];
  return (s?.notes ?? []).map((x) => x.text).filter(Boolean);
}

export async function setNotes(ws: string, notes: { text: string; source: string; at: string }[]): Promise<void> {
  await sql.query("update workspaces set settings = jsonb_set(settings, '{notes}', $2::jsonb) where id = $1", [ws, toJson(notes)]);
  invalidateWorkspace(ws);
}
