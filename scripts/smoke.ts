/**
 * Chat smoke test (PRD §10 M2): runs the 20 questions in tests/smoke/questions.json
 * through the real chat loop and reports tool calls and evidence_miss per question.
 * Expect evidence_miss = 0. Skips (exit 0) when no model credentials are configured.
 *   pnpm smoke [--only N] [--verbose]
 */
import { readFileSync } from "node:fs";
import { hasModelCredentials, runChatTurn, type ChatEvent } from "../src/chat/loop";

type Q = { q: string; expect_tool?: string[]; expect_unavailable?: boolean };

async function main() {
  if (!hasModelCredentials()) {
    console.log("smoke: skipped (no ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN)");
    return;
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const questions = JSON.parse(readFileSync("tests/smoke/questions.json", "utf8")) as Q[];
  const onlyIdx = process.argv.indexOf("--only");
  const only = onlyIdx >= 0 ? Number(process.argv[onlyIdx + 1]) : null;
  const verbose = process.argv.includes("--verbose");
  let totalMiss = 0;
  let failures = 0;
  const rows: Record<string, unknown>[] = [];
  for (const [i, q] of questions.entries()) {
    if (only != null && only !== i + 1) continue;
    const tools: string[] = [];
    const statuses: string[] = [];
    let text = "";
    let miss = 0;
    let cited = 0;
    let error = "";
    await runChatTurn({ userText: q.q, conversationId: null, userId: null }, (e: ChatEvent) => {
      if (e.type === "text") text += e.text;
      if (e.type === "tool_result") {
        tools.push(e.tool.skill ?? e.tool.name);
        statuses.push(e.tool.status);
      }
      if (e.type === "done") {
        miss = e.evidence_miss;
        cited = Object.keys(e.evidence).length;
      }
      if (e.type === "error") error = e.message;
    });
    const expectOk = !q.expect_tool || q.expect_tool.some((t) => tools.includes(t));
    const unavailOk = !q.expect_unavailable || statuses.includes("unavailable");
    const ok = expectOk && unavailOk && miss === 0 && !error;
    if (!ok) failures += 1;
    totalMiss += miss;
    rows.push({ n: i + 1, ok: ok ? "✓" : "✗", tools: tools.join(",") || "-", miss, chips: (text.match(/<ev /g) ?? []).length, evidence: cited, error: error.slice(0, 60) });
    if (verbose) console.log(`\n#${i + 1} ${q.q}\n${text}\n`);
  }
  console.table(rows);
  console.log(`evidence_miss total: ${totalMiss}; failures: ${failures}/${rows.length}`);
  if (failures) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
