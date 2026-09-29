/**
 * The weekly competitor report from the command line.
 *
 *   pnpm weekly --contract data/weekly/paragon.json --week 2026-06-22 --out <dir> [--narrative <file>] [--pdf] [--label "Example report"]
 *
 * Always writes <iso-week>.facts.json (every number in the report). With a
 * narrative file (the phrasing, see src/competitor/narrative.ts) it also checks
 * that every number in the text comes from the facts and renders the deck.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { weeklyReport } from "../src/competitor/facts";
import type { WeeklyContract } from "../src/competitor/contract";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const contractPath = arg("contract") ?? "data/weekly/paragon.json";
  const week = arg("week");
  const out = resolve(arg("out") ?? "out/weekly");
  if (!week) throw new Error("--week YYYY-MM-DD (a Monday) or YYYY-Www is required");
  const contract = JSON.parse(readFileSync(contractPath, "utf8")) as WeeklyContract;
  mkdirSync(out, { recursive: true });
  const t0 = Date.now();
  const report = await weeklyReport(contract, week);
  const base = join(out, `${report.client.toLowerCase()}-${report.week.iso}`);
  writeFileSync(`${base}.facts.json`, JSON.stringify(report, null, 2));
  console.log(`${report.week.iso} (${report.week.label}): ${report.flagged.length} highlighted moves, ${report.movers.length} movers → ${base}.facts.json (${Date.now() - t0} ms)`);

  const narrativePath = arg("narrative");
  if (narrativePath) {
    const { checkNarrative } = await import("../src/competitor/narrative");
    const { renderDeck } = await import("../src/competitor/deck");
    const narrative = JSON.parse(readFileSync(narrativePath, "utf8"));
    const problems = checkNarrative(narrative, report);
    if (problems.length) {
      console.error(`Narrative cites numbers the facts do not contain:\n  ${problems.join("\n  ")}`);
      process.exit(1);
    }
    const pptx = `${base}.pptx`;
    await renderDeck(report, narrative, pptx, { sampleLabel: arg("label") });
    console.log(`deck → ${pptx}`);
    if (process.argv.includes("--pdf")) {
      const { toPdf } = await import("../src/competitor/pdf");
      console.log(`pdf → ${await toPdf(pptx)}`);
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
