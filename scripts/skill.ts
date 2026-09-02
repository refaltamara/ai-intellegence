/**
 * Skill CLI (PRD §4.4).
 *   pnpm skill list
 *   pnpm skill run <name> [--params '{"brand":"skintific_official"}'] [--workspace beauty-id] [--no-persist] [--compact]
 */
import { listSkills } from "../src/skills/registry";
import { runSkill } from "../src/skills/runner";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const [, , cmd, name] = process.argv;
  if (cmd === "list") {
    for (const s of listSkills()) console.log(`${s.name.padEnd(16)} ${String(s.phase).padEnd(3)} ${s.layer.padEnd(12)} ${s.title}`);
    return;
  }
  if (cmd !== "run" || !name) {
    console.error("usage: pnpm skill run <name> [--params json] [--workspace id] [--no-persist] [--compact]");
    process.exit(2);
  }
  const params = JSON.parse(arg("--params") ?? "{}");
  const res = await runSkill({
    skill: name,
    workspace_id: arg("--workspace") ?? "",
    params,
    actor: { user_id: "cli", via: "cli" },
    persist: !process.argv.includes("--no-persist"),
  });
  if (process.argv.includes("--compact")) {
    const { rows, evidence, ...rest } = res;
    console.log(JSON.stringify({ ...rest, rows: rows.slice(0, 5), rows_total: rows.length, evidence: evidence.slice(0, 3), evidence_total: evidence.length }, null, 2));
  } else {
    console.log(JSON.stringify(res, null, 2));
  }
  if (res.status === "error") process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
