/**
 * Cases from the command line (src/cases/; DECISIONS, 10 Oct 2026, step 5).
 *   pnpm case copy <from workspace> <to panel> --case <id> --brand <from brand>=<panel brand> [--brand ...]
 *                  [--name "..."] [--about "..."] [--starts YYYY-MM-DD] [--terms "a,b"] [--dry]
 *     copies a case workspace into its panel as a case: who may see it comes from the source's restricted_to, and the
 *     case keeps the source's case context (label), hidden fields (pr), case words (commercial) and data notes. --dry shows
 *     the plan and what the copy would meet, and writes nothing.
 */
import { sql } from "../src/db/client";
import { copyCheck, copyIntoCase, type CopyPlan } from "../src/cases/copy";
import { refreshServing } from "../src/definitions/totals";

function flags(args: string[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith("--")) continue;
    const key = args[i].slice(2);
    const next = args[i + 1];
    const value = next !== undefined && !next.startsWith("--") ? args[++i] : "true";
    m.set(key, [...(m.get(key) ?? []), value]);
  }
  return m;
}

async function copy(from: string, to: string, f: Map<string, string[]>) {
  const one = (k: string) => f.get(k)?.[0];
  const id = one("case");
  if (!id || !/^[a-z0-9][a-z0-9-]{2,60}$/.test(id)) throw new Error("--case <id>: lower-case letters, digits and dashes");
  const brands = Object.fromEntries((f.get("brand") ?? []).map((b) => b.split("=")));
  const src = ((await sql.query(`select name, settings from workspaces where id = $1`, [from])) as { name: string; settings: Record<string, unknown> }[])[0];
  if (!src) throw new Error(`no workspace ${from}`);
  const s = src.settings ?? {};
  const access = (s.restricted_to as string[] | undefined) ?? [];
  if (!access.length) throw new Error(`${from} has no restricted_to list: give the case its access list first`);
  const platforms = ((await sql.query(`select distinct platform from posts where workspace_id = $1 order by 1`, [from])) as { platform: string }[]).map((r) => r.platform);
  const first = ((await sql.query(`select to_char(min(posted_at) at time zone 'Asia/Jakarta', 'YYYY-MM-DD') as d from post_items where workspace_id = $1`, [from])) as { d: string | null }[])[0]?.d;
  const plan: CopyPlan = {
    from, to, brands,
    case: {
      id, name: one("name") ?? src.name, about: one("about") ?? String((s.label as { about?: string } | undefined)?.about ?? "").slice(0, 600),
      starts_on: one("starts") ?? first ?? new Date().toISOString().slice(0, 10),
      terms: (one("terms") ?? "").split(",").map((t) => t.trim()).filter(Boolean),
      platforms, access, created_by: access[0],
      settings: { brand: Object.values(brands)[0] ?? null, copied_from: from, label: s.label ?? null, pr: s.pr ?? null, commercial: s.commercial ?? null, notes: s.notes ?? [], subject_noun: s.subject_noun ?? null },
    },
  };
  const check = await copyCheck(plan);
  console.log(JSON.stringify({ ...plan, case: { ...plan.case, settings: Object.keys(plan.case.settings) } }, null, 1));
  console.log("source holds:", check.source);
  if (check.problems.length) throw new Error(`not copied: ${check.problems.join("; ")}`);
  if (f.has("dry")) return console.log("dry run: nothing written");
  const t = Date.now();
  const after = await copyIntoCase(plan);
  console.log(`copied in ${((Date.now() - t) / 1000).toFixed(1)} s; the case holds:`, after);
  // the panel's serving tables are rebuilt as after any load (the case's posts stay out of them)
  await refreshServing(to);
  for (const tb of ["post_items", "posts", "comments", "creators", "labels", "case_posts"]) await sql.query(`analyze ${tb}`);
  console.log("serving tables rebuilt and statistics refreshed");
}

async function main() {
  const [, , cmd, a, b, ...rest] = process.argv;
  if (cmd === "copy") return copy(a, b, flags(rest));
  console.log("pnpm case copy <from workspace> <to panel> --case <id> --brand <from>=<to> [--dry]");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
