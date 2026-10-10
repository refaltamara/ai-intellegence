/**
 * The serving layer from the command line (src/definitions/; DECISIONS, 10 Oct 2026, step 4).
 *   pnpm totals refresh [workspace ...]   rebuild each post's day-7 reading, the daily totals and the creator days
 *   pnpm totals check [workspace ...]     the daily totals against the posts they are counted from: every difference is 0
 */
import { refreshAll } from "../src/definitions/totals";
import { checkTotals } from "../src/definitions/check";

async function main() {
  const [, , cmd, ...rest] = process.argv;
  const ws = rest.length ? rest : null;
  if (cmd === "refresh") { await refreshAll(ws, (s) => console.log(s)); return; }
  if (cmd === "check") {
    const r = await checkTotals(ws);
    console.table(r);
    if (r.some((x) => Object.entries(x).some(([k, v]) => k !== "workspace" && k !== "rows" && Number(v) !== 0))) process.exitCode = 1;
    return;
  }
  console.log("pnpm totals refresh|check [workspace ...]");
}

main().catch((e) => { console.error(e); process.exit(1); });
