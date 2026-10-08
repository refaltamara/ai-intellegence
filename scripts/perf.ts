/**
 * Page speed check (DECISIONS 8 Oct 2026). Builds what a visit builds: the sign-in and sidebar
 * every page loads first, then each live workspace's dashboards and Pulse. Reports how long the
 * database took, how many queries ran and the slowest ones, with what Postgres did for each
 * (EXPLAIN ANALYZE).
 *
 * Each slow query is flagged when Postgres:
 * - read a whole big table;
 * - repeated a scan thousands of times;
 * - sorted or hashed on disk;
 * - guessed a table read's size far off (stale statistics, or filters it cannot combine).
 *
 * Two times per page:
 * - "database": every query re-run once with EXPLAIN ANALYZE (planning included, a repeated query
 *   counted each time it ran). Steady, and the budget applies to it. It is warm: a database that
 *   has scaled down after a quiet spell runs about twice as slow.
 * - "here": how long the page took to build from this machine, round trips included.
 *
 * Usage: pnpm perf [workspace ...] [--all] [--as email] [--top 5] [--strict]
 * - --all: also workspaces in review.
 * - --as: the account whose sign-in and sidebar are timed (default: the first Fair staff account).
 * - --strict: exits 1 when a page is over budget or fails to build.
 */
import { neon } from "@neondatabase/serverless";

type Logged = { text: string; params: unknown[] };
const log: Logged[] = [];

// every query goes through Neon's HTTP endpoint: note each one as it is sent, to re-run with EXPLAIN
const send = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (/neon\.tech/.test(url)) {
    try {
      const body = JSON.parse(String(init?.body ?? "{}")) as { query?: string; params?: unknown[] };
      if (body.query) log.push({ text: body.query, params: body.params ?? [] });
    } catch {
      /* a transaction batch: not a page read */
    }
  }
  return send(input, init);
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
  // a profile not on the reputation dashboard shows its crisis view on /dashboard for every role
  const crisisOnly = cfg.kind === "profile" && !cfg.reputation;
  for (const role of crisisOnly ? [] : cfg.roles) {
    if (role === "pr") {
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

/** What every full page load runs before its own data (proxy.ts, app/layout.tsx): the session, the team, the sidebar. */
async function signInPage(sql: { query: (text: string, params?: unknown[]) => Promise<unknown> }, email: string | null): Promise<Page | null> {
  const rows = (await sql.query(
    `select u.id, u.workspace_id from users u join accounts a on a.id = u.account_id
     where ($1::text is null and cardinality(a.staff) > 0) or a.email = $1 order by a.created_at, u.created_at limit 1`,
    [email],
  )) as { id: string; workspace_id: string }[];
  const who = rows[0];
  if (!who) return null;
  const { liveUser } = await import("../src/auth/live");
  const { loadActor } = await import("../src/auth/accounts");
  const { teamsFor } = await import("../src/workspace/teams");
  const { listConversations } = await import("../src/chat/persist");
  const { getWorkspace } = await import("../src/workspace/store");
  const { getRole } = await import("../src/roles/store");
  return {
    name: `sign-in and sidebar (${email ?? "first Fair staff account"})`,
    build: async () => {
      await liveUser(who.id);
      const actor = await loadActor(who.id);
      const cfg = await getWorkspace(who.workspace_id);
      await Promise.all([listConversations(who.workspace_id, who.id, 8), getRole(who.workspace_id, cfg?.roles[0] ?? "brand_kol", who.id)]);
      if (actor) await teamsFor(actor);
    },
  };
}

/** what in a plan is worth a look, in plain words */
function flags(plan: string): string[] {
  const out = new Set<string>();
  // a parallel scan reports rows per worker: multiply by its loops
  for (const m of plan.matchAll(/Seq Scan on (\w+)[^\n]*?loops=(\d+)\)\n(?:[^\n]*\n){0,2}?\s*Rows Removed by Filter: (\d+)/g)) {
    const removed = Number(m[3]) * Number(m[2]);
    if (removed >= 100_000) out.add(`reads the whole ${m[1]} table (${removed.toLocaleString("en-US")} rows skipped)`);
  }
  // an index lookup repeated is cheap; a scan of a CTE, a subquery or a table repeated per row is not
  const loops = Math.max(0, ...[...plan.matchAll(/(?:CTE Scan|Seq Scan|Subquery Scan)[^\n]*loops=(\d+)/g)].map((m) => Number(m[1])));
  if (loops >= 1000) out.add(`repeats a scan ${loops.toLocaleString("en-US")} times`);
  if (/external merge|Disk(?: Usage)?: \d+kB/.test(plan)) out.add("sorts or hashes on disk");
  // only a table read says something about the statistics; a CTE or an aggregate is always a guess
  for (const m of plan.matchAll(/Scan (?:using \w+ )?on (?:posts|comments)\b[^\n]*rows=(\d+) width=\d+\) \(actual time=[\d.]+\.\.[\d.]+ rows=([\d.]+) loops=1\)/g)) {
    const est = Number(m[1]);
    const act = Number(m[2]);
    if (act >= 1000 && est > 0 && act / est >= 50) {
      out.add(`guessed ${est.toLocaleString("en-US")} rows, found ${Math.round(act).toLocaleString("en-US")} (stale statistics, or filters the planner cannot combine)`);
      break;
    }
  }
  return [...out];
}

async function main() {
  const args = process.argv.slice(2);
  const value = (flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
  const top = Number(value("--top")) || 3;
  const as = value("--as") ?? null;
  const strict = args.includes("--strict");
  const { databaseUrl } = await import("../src/db/client");
  const sql = neon(databaseUrl("pooled"));
  const named = args.filter((a, i) => !a.startsWith("--") && !["--top", "--as"].includes(args[i - 1]));
  const statuses = args.includes("--all") ? ["live", "review"] : ["live"];
  const workspaces = named.length ? named : ((await sql.query("select id from workspaces where status = any($1::text[]) order by id", [statuses])) as { id: string }[]).map((r) => r.id);

  // the round trip from here: everything a page waits on beyond the database's own time
  const trips: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t = performance.now();
    await sql.query("select 1");
    trips.push(performance.now() - t);
  }
  const trip = Math.min(...trips);
  console.log(`round trip to the database from here: ${trip.toFixed(0)} ms (on Vercel, beside it, a few ms)\n`);

  const jobs: { ws: string; page: Page }[] = [];
  const signIn = await signInPage(sql, as);
  if (signIn) jobs.push({ ws: "every page", page: signIn });
  for (const ws of workspaces) for (const page of await pagesFor(ws)) jobs.push({ ws, page });

  let over = 0;
  let failed = 0;
  for (const { ws, page } of jobs) {
    try {
      log.length = 0;
      const t = performance.now();
      await page.build();
      const wall = performance.now() - t;
      const ran = [...log];
      // EXPLAIN ANALYZE runs the query again: reads only, each distinct one once, counted as often as it ran
      const plans = new Map<string, { ms: number; text: string; flags: string[]; times: number } | null>();
      for (const q of ran) {
        const key = q.text + JSON.stringify(q.params);
        const seen = plans.get(key);
        if (seen !== undefined) {
          if (seen) seen.times++;
          continue;
        }
        if (!/^\s*(select|with)\b/i.test(q.text) || /\b(insert|update|delete)\b/i.test(q.text)) {
          plans.set(key, null);
          continue;
        }
        try {
          const rows = (await sql.query(`explain (analyze, buffers) ${q.text}`, q.params as never[])) as { "QUERY PLAN": string }[];
          const plan = rows.map((r) => r["QUERY PLAN"]).join("\n");
          const ms = Number(plan.match(/Planning Time: ([\d.]+)/)?.[1] ?? 0) + Number(plan.match(/Execution Time: ([\d.]+)/)?.[1] ?? 0);
          plans.set(key, { ms, text: q.text.replace(/\s+/g, " ").trim(), flags: flags(plan), times: 1 });
        } catch {
          plans.set(key, null); // a query EXPLAIN cannot take as it is: left out of the database time
        }
      }
      const timed = [...plans.values()].filter((p): p is NonNullable<typeof p> => p != null);
      const db = timed.reduce((a, q) => a + q.ms * q.times, 0);
      const slow = db > BUDGET_MS;
      if (slow) over++;
      console.log(`${slow ? "SLOW" : "ok  "}  ${ws} · ${page.name}: ${ran.length} queries, database ${Math.round(db).toLocaleString("en-US")} ms, ${Math.round(wall).toLocaleString("en-US")} ms here`);
      for (const q of timed.sort((a, b) => b.ms * b.times - a.ms * a.times).slice(0, top)) {
        console.log(`        ${Math.round(q.ms).toString().padStart(6)} ms${q.times > 1 ? ` ×${q.times}` : ""}  ${q.text.slice(0, 110)}`);
        for (const f of q.flags) console.log(`                   ↳ ${f}`);
      }
    } catch (e) {
      failed++;
      console.log(`FAIL  ${ws} · ${page.name}: ${(e as Error).message.split("\n")[0]}`);
    }
  }
  console.log(
    `\n${over ? `${over} page(s) over the ${BUDGET_MS} ms budget` : `every page within the ${BUDGET_MS} ms budget`}${failed ? `, ${failed} failed to build` : ""}. Times add up every query; a page runs some side by side, so it waits less.`,
  );
  process.exit(strict && (over || failed) ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
