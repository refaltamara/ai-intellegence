/**
 * Labels with their author (src/labels/; DECISIONS, 10 Oct 2026).
 *   pnpm labels backfill     give every judgment already on a post or comment its row (safe to run again)
 *   pnpm labels stats        labels per workspace, kind and labeller
 */
import { sql } from "../src/db/client";
import { backfillLabels } from "../src/labels/backfill";

async function main() {
  const cmd = process.argv[2];
  if (cmd === "backfill") { await backfillLabels((s) => console.log(s)); return; }
  if (cmd === "stats") {
    const rows = (await sql.query(
      `select l.workspace_id, l.kind, b.name || case when b.version <> '' then ' (' || b.version || ')' else '' end as labeller, count(*)::int as n
         from labels l join labellers b on b.id = l.labeller_id group by 1, 2, 3 order by 1, 2, 3`,
    )) as { workspace_id: string; kind: string; labeller: string; n: number }[];
    for (const r of rows) console.log(`${r.workspace_id.padEnd(14)} ${r.kind.padEnd(20)} ${String(r.n).padStart(8)}  ${r.labeller}`);
    return;
  }
  console.log("pnpm labels backfill | stats");
}
main().then(() => process.exit(0)).catch((e) => { console.error((e as Error).message); process.exit(1); });
