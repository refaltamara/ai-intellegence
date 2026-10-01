/**
 * Publish weekly reports into the app with words written ahead of time (the samples in data/weekly/<client>/),
 * as runs of the client's Weekly Competitor Pulse schedule, so they appear under it in Reports and in Weekly Reports.
 *
 *   pnpm weekly:publish --workspace beauty-id --schedule "Weekly Competitor Pulse · Paragon" --weeks 2026-W22,2026-W23 --dir data/weekly/paragon
 *
 * Every narrative must pass checkNarrative against the week's facts, or nothing is stored for that week.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { finishRun, insertRun, listAgents } from "../src/agents/store";
import { weeklyReport } from "../src/competitor/facts";
import { checkNarrative, type Narrative } from "../src/competitor/narrative";
import { FORMATS, storeWeekly, validContract, type WeeklyParams } from "../src/competitor/scheduled";

const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };

async function main() {
  const ws = arg("workspace") ?? "beauty-id";
  const name = arg("schedule");
  const weeks = (arg("weeks") ?? "").split(",").filter(Boolean);
  const dir = arg("dir") ?? "data/weekly/paragon";
  const agent = (await listAgents(ws)).find((a) => a.kind === "weekly_report" && (!name || a.name === name));
  if (!agent) throw new Error(`no weekly schedule${name ? ` named "${name}"` : ""} in ${ws}`);
  const contract = validContract((agent.params as unknown as WeeklyParams).contract, ws);
  if (typeof contract === "string") throw new Error(contract);
  for (const w of weeks) {
    const r = await weeklyReport(contract, w);
    const n = JSON.parse(readFileSync(join(dir, `${r.week.iso}.json`), "utf8")) as Narrative;
    const problems = checkNarrative(n, r);
    if (problems.length) { console.error(`${r.week.iso}: not published\n  ${problems.join("\n  ")}`); continue; }
    const run = await insertRun(agent.id);
    const { reportId } = await storeWeekly({ workspaceId: ws, agentName: agent.name, runId: run.id, report: r, narrative: n, by: "model", problems: [], formats: FORMATS });
    await finishRun(run.id, { should_deliver: true, report_id: reportId });
    console.log(`${r.week.iso} (${r.week.label}) → report ${reportId}`);
  }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
