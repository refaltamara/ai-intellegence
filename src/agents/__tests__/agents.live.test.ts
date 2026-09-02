/**
 * M3 acceptance (PRD §10): promote a /discovery run into an agent, run it twice
 * with a seeded change between runs, and check the second run reports exactly
 * the new entrants. The seeded change is the agent's limit (5 -> 7), which is
 * reversible and does not touch the data. Email is asserted only when Resend
 * is configured.
 */
import { afterAll, describe, expect, it } from "vitest";
import { runSkill } from "../../skills/runner";
import { agentFromBody } from "../api";
import { runAgent } from "../runner";
import { deleteAgent, getAgent, insertAgent, listRuns, updateAgent, type AgentRow } from "../store";
import { sql } from "../../db/client";

const live = !!process.env.DATABASE_URL;
const d = live ? describe : describe.skip;
const WS = "beauty-id";
let agent: AgentRow | null = null;

d("agents (live)", () => {
  afterAll(async () => {
    if (agent) await deleteAgent(agent.id, WS);
    await sql.query("delete from reports where workspace_id = $1 and title like '[test]%'", [WS]);
  });

  it("promotes a discovery run with frozen, relativised params", async () => {
    const run = await runSkill({ skill: "discovery", workspace_id: WS, params: { used_by: ["skintific_official"], tiers: ["nano"], platform: "tiktok", limit: 5, window: { from: "2026-06-01", to: "2026-06-30" } }, actor: { user_id: "test", via: "api" } });
    expect(run.status).toBe("ok");
    const r = await agentFromBody({ from_skill_run_id: run.run_id, name: "[test] weekly nano discovery", delivery: { channels: ["email"], email: "test@example.com" } }, WS);
    if ("error" in r) throw new Error(r.error);
    expect(r.agent.params).toMatchObject({ used_by: ["skintific_official"], tiers: ["nano"], platform: "tiktok", limit: 5, window: { last_n_days: 30 } });
    expect(r.agent.schedule_cron).toBe("0 7 * * 1");
    expect(r.agent.next_run_at).toBeTruthy();
    agent = await insertAgent(r.agent);
    expect(agent.status).toBe("active");
  }, 60_000);

  it("first run records a baseline; second run after a seeded change reports exactly the new entrants", async () => {
    expect(agent).toBeTruthy();
    const first = await runAgent(agent!, { reason: "manual" });
    expect(first.result_status).toBe("ok");
    expect(first.diff?.first_run).toBe(true);
    expect(first.diff?.new.length).toBe(5);
    expect(first.report_id).toBeTruthy();

    const baselineKeys = new Set(first.diff!.new.map((e) => e.key));
    const updated = await updateAgent(agent!.id, WS, { params: { ...agent!.params, limit: 7 } });
    const second = await runAgent(updated!, { reason: "manual" });
    expect(second.result_status).toBe("ok");
    expect(second.diff?.first_run).toBeFalsy();
    expect(second.diff?.gone.length).toBe(0);
    expect(second.diff?.new.length).toBe(2);
    for (const e of second.diff!.new) expect(baselineKeys.has(e.key)).toBe(false);
    expect(second.diff?.unchanged).toBe(5);
    expect(second.run.should_deliver).toBe(true);
    const email = second.delivered.find((x) => x.channel === "email");
    if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) expect(email?.ok).toBe(true);
    else expect(email?.detail).toMatch(/not configured/);

    const third = await runAgent((await getAgent(agent!.id, WS))!, { reason: "manual" });
    expect(third.run.should_deliver).toBe(false);
    const runs = await listRuns(agent!.id);
    expect(runs.length).toBe(3);
    const after = await getAgent(agent!.id, WS);
    expect(after?.last_run_at).toBeTruthy();
    expect(new Date(after!.next_run_at!).getTime()).toBeGreaterThan(Date.now());
  }, 180_000);
});
