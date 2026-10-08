/**
 * Page speed check (DECISIONS 8 Oct 2026). Builds each workspace's pages the way a visit does
 * and reports how long the database took, how many queries ran and the slowest ones, with
 * what Postgres did for each (EXPLAIN ANALYZE).
 *
 * Each slow query is flagged when Postgres:
 * - read a whole big table;
 * - repeated a scan thousands of times;
 * - sorted on disk;
 * - guessed a workspace's size far off (stale statistics: run analyze).
 *
 * Run it after changing a page's queries and after a big load.
 * Usage: pnpm perf [workspace ...] [--top 5] [--strict]
 * --strict exits 1 when a page's database time is over budget.
 */
import { neon } from "@neondatabase/serverless";

type Logged = { ms: number; text: string; params: unknown[] };
const log: Logged[] = [];

// every query goes through Neon's HTTP endpoint: time each one where it is sent
const send = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!/neon\.tech/.test(url)) return send(input, init);
  const t = performance.now();
  const res = await send(input, init);
  await res.clone().arrayBuffer();
  try {
    const body = JSON.parse(String(init?.body ?? "{}")) as { query?: string; params?: unknown[] };
    if (body.query) log.push({ ms: performance.now() - t, text: body.query, params: body.params ?? [] });
  } catch {
    /* a transaction batch: not a page read */
  }
  return res;
}) as typeof fetch;

/** a page's database time above this is slow for someone waiting on it */
const BUDGET_MS = 2000;

type Page = { name: string; build: () => Promise<unknown> };

async function pagesFor(ws: string): Promise<Page[]> {
  const { getWorkspace } = await import("../src/workspace/store");
  const { getRole } = await import("../src/roles/store");
  const cfg = await getWorkspace(ws);
  if (!cfg) return [];
  const pages: Page[] = [];
  for (const role of cfg.roles) {
    if (role === "pr") {
      if (cfg.kind === "profile" && !cfg.reputation) continue; // its dashboard is the crisis view, timed below
      const { prDashboard } = await import("../src/reputation/dashboard");
      pages.push({ name: "PR dashboard", build: async () => prDashboard(ws, {}, await getRole(ws, "pr")) });
    } else if (role === "social") {
      const { socialDashboard } = await import("../src/social/dashboard");
      pages.push({ name: "Social dashboard", build: async () => socialDashboard(ws, {}, await getRole(ws, "social")) });
    } else {
      const d = await import("../src/dashboard/data");
      const { SkillDb } = await import("../src/skills/db");
      pages.push({
        name: "Brand & KOL dashboard",
        build: async () => {
          const ctx = await d.loadContext(new SkillDb(), ws);
          return Promise.all([d.dashboardData(ws, {}), d.content(ctx, d.readFilters({}, ctx), d.readContentQuery({}))]);
        },
      });
    }
  }
  if (cfg.kind === "profile") {
    const { pulsePage } = await import("../src/pulse/page");
    pages.push({ name: cfg.reputation ? "Pulse" : "Crisis dashboard", build: () => pulsePage(ws) });
  }
  return pages;
}

/** what in a plan is worth a look, in plain words */
function flags(plan: string): string[] {
  const out = new Set<string>();
  for (const m of plan.matchAll(/Seq Scan on (\w+)[^\n]*\n(?:[^\n]*\n){0,2}?\s*Rows Removed by Filter: (\d+)/g)) {
    if (Number(m[2]) >= 100_000) out.add(`reads the whole ${m[1]} table (${Number(m[2]).toLocaleString("en-US")} rows skipped)`);
  }
  // an index lookup repeated is cheap; a scan of a CTE, a subquery or a table repeated per row is not
  const loops = Math.max(0, ...[...plan.matchAll(/(?:CTE Scan|Seq Scan|Subquery Scan)[^\n]*loops=(\d+)/g)].map((m) => Number(m[1])));
  if (loops >= 1000) out.add(`repeats a scan ${loops.toLocaleString("en-US")} times`);
  if (/external merge|Disk: \d+kB/.test(plan)) out.add("sorts or hashes on disk");
  // only a table read says something about the statistics; a CTE or an aggregate is always a guess
  for (const m of plan.matchAll(/Scan (?:using \w+ )?on (?:posts|comments)\b[^\n]*rows=(\d+) width=\d+\) \(actual time=[\d.]+\.\.[\d.]+ rows=([\d.]+) loops=1\)/g)) {
    const est = Number(m[1]);
    const act = Number(m[2]);
    if (act >= 1000 && est > 0 && act / est >= 50) {
      out.add(`guessed ${est.toLocaleString("en-US")} rows, found ${Math.round(act).toLocaleString("en-US")} (stale statistics? run analyze)`);
      break;
    }
  }
  return [...out];
}

async function main() {
  const args = process.argv.slice(2);
  const topAt = args.indexOf("--top");
  const top = topAt >= 0 ? Number(args[topAt + 1]) || 5 : 3;
  const strict = args.includes("--strict");
  const { databaseUrl } = await import("../src/db/client");
  const sql = neon(databaseUrl("pooled"));
  const named = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--top");
  const workspaces = named.length ? named : ((await sql.query("select id from workspaces where status in ('live', 'review') order by id")) as { id: string }[]).map((r) => r.id);

  // the round trip from here: everything a page waits on beyond the database's own time
  const trips: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t = performance.now();
    await sql.query("select 1");
    trips.push(performance.now() - t);
  }
  console.log(`round trip to the database from here: ${Math.min(...trips).toFixed(0)} ms (on Vercel, beside it, a few ms)\n`);

  let over = 0;
  for (const ws of workspaces) {
    for (const page of await pagesFor(ws)) {
      log.length = 0;
      const t = performance.now();
      await page.build();
      const wall = performance.now() - t;
      const ran = [...log];
      // EXPLAIN ANALYZE runs the query again: reads only, and each distinct one once
      const seen = new Set<string>();
      const timed: { ms: number; text: string; flags: string[] }[] = [];
      for (const q of ran) {
        const key = q.text + JSON.stringify(q.params);
        if (seen.has(key) || !/^\s*(select|with)\b/i.test(q.text) || /\b(insert|update|delete)\b/i.test(q.text)) continue;
        seen.add(key);
        const rows = (await sql.query(`explain (analyze, buffers) ${q.text}`, q.params as never[])) as { "QUERY PLAN": string }[];
        const plan = rows.map((r) => r["QUERY PLAN"]).join("\n");
        timed.push({ ms: Number(plan.match(/Execution Time: ([\d.]+)/)?.[1] ?? 0), text: q.text.replace(/\s+/g, " ").trim(), flags: flags(plan) });
      }
      const db = timed.reduce((a, q) => a + q.ms, 0);
      const slow = db > BUDGET_MS;
      if (slow) over++;
      console.log(`${slow ? "SLOW" : "ok  "}  ${ws} · ${page.name}: ${ran.length} queries, database ${Math.round(db).toLocaleString("en-US")} ms in all, ${Math.round(wall).toLocaleString("en-US")} ms here`);
      for (const q of timed.sort((a, b) => b.ms - a.ms).slice(0, top)) {
        console.log(`        ${Math.round(q.ms).toString().padStart(6)} ms  ${q.text.slice(0, 110)}`);
        for (const f of q.flags) console.log(`                   ↳ ${f}`);
      }
    }
  }
  console.log(`\n${over ? `${over} page(s) over the ${BUDGET_MS} ms budget` : `every page within the ${BUDGET_MS} ms budget`}. "Database in all" adds up every query; the page runs some side by side, so it waits less.`);
  if (strict && over) process.exit(1);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
