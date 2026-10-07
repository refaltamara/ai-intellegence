/**
 * A role's test set (CMS plan, "What every role carries"; DECISIONS 4 Oct 2026). A
 * version is proposed only when its tests pass. Three kinds:
 *  - guard: rules no version may break, read off the spec (it resolves cleanly, its
 *    recipes exist and suit it, its deck templates exist, its thresholds keep their guard
 *    rails, its voice never asks CeMO to compute or to name its tools);
 *  - screen: the role's dashboard and its recipes run on a test workspace without error
 *    and with something to show;
 *  - question: a golden question through the real chat loop with this spec: the expected
 *    analysis is used, no mechanism leaks, every number is cited, at most one question
 *    back. Needs the model; skipped (not failed) without credentials.
 * Every problem a client reports becomes a new case.
 */
import { randomUUID } from "node:crypto";
import { sql } from "../db/client";
import { toJson } from "../db/json";
import { DECK_TEMPLATE_KEYS } from "./registry";
import { POLICIES, resolve } from "./policy";
import type { RoleId, RoleModel } from "./model";
import { recipesFor, fairRecipes } from "../recipes/store";
import { validateRecipe } from "../recipes/spec";
import { runRecipe } from "../recipes/run";
import { hasModelCredentials } from "../chat/loop";

export type TestKind = "guard" | "screen" | "question";
export type GuardCheck = "resolves" | "recipes" | "templates" | "thresholds" | "voice";
export type TestSpec =
  | { kind: "guard"; check: GuardCheck }
  | { kind: "screen"; workspace: string; check: "dashboard" | "recipes" }
  | { kind: "question"; workspace: string; q: string; expect: { uses_any?: string[]; asks_at_most?: number; cites?: boolean } };
export type TestCase = { key: string; role: RoleId; kind: TestKind; spec: TestSpec; source: string; active: boolean };
export type TestStatus = "pass" | "fail" | "skip" | "error";
export type TestResult = { key: string; kind: TestKind; workspace: string | null; status: TestStatus; detail: Record<string, unknown> };
export type TestSummary = { batch: string; role: RoleId; version: string; at: string; pass: number; fail: number; skip: number; error: number; results: TestResult[] };

// ------------------------------------------------------------------ cases

/** the test workspaces per role: the data each role is checked on */
export const TEST_WORKSPACES: Record<RoleId, string[]> = { pr: ["fintech-id", "maudy-ayunda"], brand_kol: ["beauty-id", "fintech-id"], social: ["fintech-id"] };

const GUARDS: GuardCheck[] = ["resolves", "recipes", "templates", "thresholds", "voice"];

/** Golden questions (drafted 4 Oct 2026 from each role's suggested questions; role owners edit and add in the CMS). */
const QUESTIONS: Record<RoleId, { key: string; workspace: string; q: string; uses_any?: string[] }[]> = {
  pr: [
    { key: "q-what-said", workspace: "fintech-id", q: "What are people saying about GoPay this week?" },
    { key: "q-issue-building", workspace: "fintech-id", q: "Is anything building into an issue for GoPay?" },
    { key: "q-us-or-category", workspace: "fintech-id", q: "Which complaints are about GoPay only, and which hit every brand?" },
    { key: "q-complaint-topics", workspace: "fintech-id", q: "What are people complaining about most about GoPay in the last 30 days?", uses_any: ["recipe:complaints-by-topic", "query_metrics", "comment-themes"] },
    { key: "q-vs-competitors", workspace: "fintech-id", q: "How does GoPay's sentiment compare with OVO and DANA this month?", uses_any: ["recipe:sentiment-by-brand", "query_metrics", "sentiment"] },
    { key: "q-when-started", workspace: "fintech-id", q: "When did the negative comments about GoPay start rising?", uses_any: ["recipe:negative-by-day", "query_metrics", "sentiment"] },
    { key: "q-who-drives", workspace: "fintech-id", q: "Who is driving the negative conversation about GoPay?" },
    { key: "q-holding", workspace: "fintech-id", q: "Draft a holding statement on the biggest negative issue this week" },
    { key: "q-profile-spike", workspace: "maudy-ayunda", q: "Was there a spike in negative comments about Maudy recently, and what was it about?" },
  ],
  brand_kol: [
    { key: "q-who-winning", workspace: "beauty-id", q: "Which brand is winning on TikTok in the last 30 days?" },
    { key: "q-creators", workspace: "beauty-id", q: "Find nano creators who posted about Skintific but never for its competitors" },
    { key: "q-campaigns", workspace: "beauty-id", q: "What campaigns are the top brands running this month?" },
    { key: "q-fintech-sov", workspace: "fintech-id", q: "What is each brand's share of voice in September?" },
    { key: "q-top-content", workspace: "beauty-id", q: "Show me the top content with a shopping cart in the last 30 days" },
  ],
  social: [
    { key: "q-best-posts", workspace: "fintech-id", q: "Which of GoPay's posts did best this month, and why?" },
    { key: "q-formats", workspace: "fintech-id", q: "Which formats and posting times work for GoPay?" },
    { key: "q-vs-competitors", workspace: "fintech-id", q: "How do GoPay's own accounts compare with the competitors'?" },
    { key: "q-weekly", workspace: "fintech-id", q: "How has GoPay's posting changed week by week?", uses_any: ["recipe:own-posts-by-week", "query_metrics"] },
    { key: "q-calendar", workspace: "fintech-id", q: "Draft next week's content calendar from what worked" },
  ],
};

/** the cases Fair starts every role with; `pnpm role tests seed` adds any that are missing */
export function seedCases(role: RoleId): TestCase[] {
  return [
    ...GUARDS.map((check) => ({ key: `guard-${check}`, role, kind: "guard" as const, spec: { kind: "guard" as const, check }, source: "fair", active: true })),
    ...TEST_WORKSPACES[role].flatMap((ws) => (["dashboard", "recipes"] as const).map((check) => ({ key: `screen-${check}-${ws}`, role, kind: "screen" as const, spec: { kind: "screen" as const, workspace: ws, check }, source: "fair", active: true }))),
    ...QUESTIONS[role].map((q) => ({ key: q.key, role, kind: "question" as const, spec: { kind: "question" as const, workspace: q.workspace, q: q.q, expect: { uses_any: q.uses_any, asks_at_most: 1, cites: true } }, source: "fair", active: true })),
  ];
}

export async function seedTestCases(role: RoleId, by = "seed"): Promise<number> {
  let n = 0;
  for (const c of seedCases(role)) {
    const rows = (await sql.query("insert into test_cases (role, key, kind, spec, source, created_by) values ($1, $2, $3, $4::jsonb, $5, $6) on conflict (role, key) do nothing returning id", [c.role, c.key, c.kind, toJson(c.spec), c.source, by])) as unknown[];
    n += rows.length;
  }
  return n;
}

export async function listCases(role: RoleId): Promise<TestCase[]> {
  return (await sql.query("select key, role, kind, spec, source, active from test_cases where role = $1 order by kind, key", [role])) as TestCase[];
}

export async function addCase(c: Omit<TestCase, "active">, by: string): Promise<void> {
  await sql.query("insert into test_cases (role, key, kind, spec, source, created_by) values ($1, $2, $3, $4::jsonb, $5, $6) on conflict (role, key) do update set spec = excluded.spec, kind = excluded.kind, active = true", [c.role, c.key, c.kind, toJson(c.spec), c.source, by]);
}

// ------------------------------------------------------------------ checks

/** a voice may never ask CeMO to compute, invent, or name its machinery */
const VOICE_FORBIDDEN = /\b(run_skill|run_recipe|query_metrics|SQL|calculate|compute|estimate the|make up|invent (a|the) (number|figure))\b/i;

async function guard(check: GuardCheck, spec: RoleModel): Promise<{ status: TestStatus; detail: Record<string, unknown> }> {
  switch (check) {
    case "resolves": {
      const r = resolve(spec, null, null);
      const problems = [
        ...(r.role.nav.includes("dashboard") ? [] : ["the sidebar has no Dashboard"]),
        ...(r.role.nav.includes("chats") ? [] : ["the sidebar has no Chats"]),
        ...(r.role.nav.length === spec.nav.length ? [] : ["the sidebar names a place the app no longer has"]),
        ...((spec.skill_order ?? []).length === (r.role.skill_order ?? []).length ? [] : ["the skill order names an unknown layer"]),
      ];
      return problems.length ? { status: "fail", detail: { problems } } : { status: "pass", detail: {} };
    }
    case "recipes": {
      const all = await fairRecipes();
      const problems = (spec.recipes ?? []).flatMap((k) => {
        const r = all.get(k);
        if (!r) return [`${k}: no such recipe`];
        return [...validateRecipe(r).map((e) => `${k}: ${e}`), ...(r.roles.includes(spec.id) ? [] : [`${k} is not built for this role`])];
      });
      return problems.length ? { status: "fail", detail: { problems } } : { status: "pass", detail: { recipes: spec.recipes?.length ?? 0 } };
    }
    case "templates": {
      // a template Fair adopted from a client lives in the version itself (template_defs)
      const unknown = spec.deck_templates.filter((t) => !DECK_TEMPLATE_KEYS.includes(t) && !(spec.template_defs ?? []).some((d) => d.key === t));
      return unknown.length ? { status: "fail", detail: { problems: unknown.map((t) => `deck template ${t} does not exist`) } } : { status: "pass", detail: {} };
    }
    case "thresholds": {
      const problems: string[] = [];
      for (const [path, p] of Object.entries(POLICIES)) {
        const [head, leaf] = path.split(".");
        if (!leaf || head === "prefs") continue;
        const block = (spec as Record<string, unknown>)[head] as Record<string, unknown> | undefined;
        if (block && block[leaf] !== undefined && p.check(block[leaf], spec) === undefined) problems.push(`${path} = ${String(block[leaf])} is outside its guard rails`);
      }
      return problems.length ? { status: "fail", detail: { problems } } : { status: "pass", detail: {} };
    }
    case "voice": {
      const problems = [
        ...(VOICE_FORBIDDEN.test(spec.voice) ? ["the voice asks CeMO to compute or names its tools"] : []),
        ...(spec.house_rules?.length ? ["house rules belong to a company, not to Fair's role"] : []),
        ...((spec.suggested ?? []).some((q) => q.length > 200) ? ["a suggested question is longer than 200 characters"] : []),
      ];
      return problems.length ? { status: "fail", detail: { problems } } : { status: "pass", detail: {} };
    }
  }
}

async function screen(check: "dashboard" | "recipes", ws: string, spec: RoleModel): Promise<{ status: TestStatus; detail: Record<string, unknown> }> {
  if (check === "recipes") {
    const list = await recipesFor(spec.recipes);
    if (!list.length) return { status: "pass", detail: { note: "no recipes" } };
    const out: Record<string, unknown> = {};
    let failed = false;
    for (const r of list) {
      const res = await runRecipe(r, {}, ws);
      out[r.key] = { status: res.status, rows: res.rows.length, message: res.message };
      if (res.status !== "ok" || res.rows.some((row) => !(row.evidence_ids as unknown[] | undefined)?.length)) failed = true;
    }
    return { status: failed ? "fail" : "pass", detail: out };
  }
  if (spec.id === "pr") {
    const { prDashboard } = await import("../reputation/dashboard");
    const { getWorkspace } = await import("../workspace/store");
    // a one-person profile keeps its crisis view (Pulse); the reputation dashboard is checked on panels
    if ((await getWorkspace(ws))?.kind === "profile") return { status: "skip", detail: { note: "profiles open on Pulse" } };
    const d = await prDashboard(ws, {}, spec);
    if (!d) return { status: "fail", detail: { problems: ["the dashboard has no data"] } };
    const problems = [...(d.status ? [] : ["no status"]), ...(d.kpis.comments.now == null ? ["no comment count"] : []), ...(d.brands.length ? [] : ["no brands"])];
    return problems.length ? { status: "fail", detail: { problems } } : { status: "pass", detail: { level: d.status.level, issues: d.issues.length, mentions: d.kpis.mentions.now } };
  }
  if (spec.id === "social") {
    const { socialDashboard } = await import("../social/dashboard");
    const d = await socialDashboard(ws, {}, spec);
    if (!d) return { status: "fail", detail: { problems: ["the dashboard has no data"] } };
    const problems = [...(d.accounts.length ? [] : ["no own accounts"]), ...(d.kpis.posts.now ? [] : ["no own posts in the window"])];
    return problems.length ? { status: "fail", detail: { problems } } : { status: "pass", detail: { posts: d.kpis.posts.now, accounts: d.accounts.length } };
  }
  const { dashboardData } = await import("../dashboard/data");
  const d = await dashboardData(ws, {});
  const problems = [...(d.rankings.length ? [] : ["no brand rankings"]), ...(d.kpis ? [] : ["no headline numbers"])];
  return problems.length ? { status: "fail", detail: { problems } } : { status: "pass", detail: { brands: d.rankings.length } };
}

async function question(t: Extract<TestSpec, { kind: "question" }>, spec: RoleModel): Promise<{ status: TestStatus; detail: Record<string, unknown> }> {
  if (!hasModelCredentials()) return { status: "skip", detail: { note: "the model is not configured here" } };
  const { runChatTurn } = await import("../chat/loop");
  const used: string[] = [];
  let text = "";
  let asks = 0;
  let miss = 0;
  let conversation: string | null = null;
  let error = "";
  await runChatTurn({ workspaceId: t.workspace, role: spec.id, roleSpec: spec, conversationId: null, userText: t.q, userId: null }, (e) => {
    if (e.type === "conversation") conversation = e.id;
    if (e.type === "text") text += e.text;
    if (e.type === "tool_result") used.push(e.tool.name === "run_skill" ? String(e.tool.skill ?? "") : e.tool.name === "run_recipe" ? `recipe:${String((e.tool.input as { recipe?: string })?.recipe ?? "")}` : e.tool.name);
    if (e.type === "ask") asks++;
    if (e.type === "done") miss = e.evidence_miss;
    if (e.type === "error") error = e.message;
  });
  // the test's conversation is not anyone's chat
  if (conversation) await sql.query("delete from conversations where id = $1", [conversation]).catch(() => undefined);
  const { scrubMechanism } = await import("../chat/leak");
  const leaks = scrubMechanism(text, []).leaks;
  const problems = [
    ...(error ? [`error: ${error}`] : []),
    ...(t.expect.uses_any?.length && !asks && !used.some((u) => t.expect.uses_any!.includes(u)) ? [`expected one of ${t.expect.uses_any.join(", ")}; used ${used.join(", ") || "nothing"}`] : []),
    ...(asks > (t.expect.asks_at_most ?? 1) ? [`asked ${asks} questions back`] : []),
    ...(leaks.length ? [`named its machinery: ${leaks.join(", ")}`] : []),
    ...(t.expect.cites !== false && miss > 0 ? [`${miss} numbers without evidence`] : []),
    ...(!text.trim() && !asks ? ["no answer"] : []),
  ];
  return { status: problems.length ? "fail" : "pass", detail: { used, asks, evidence_miss: miss, answer: text.slice(0, 600), problems } };
}

// ------------------------------------------------------------------ runner

/**
 * Run a role spec's test set and store the results as one batch. `kinds` narrows it (the
 * nightly run skips questions; the Lab runs only what a change touches while drafting).
 */
export async function runTests(spec: RoleModel, opts: { kinds?: TestKind[]; keys?: string[]; store?: boolean } = {}): Promise<TestSummary> {
  const batch = randomUUID();
  const cases = (await listCases(spec.id)).filter((c) => c.active && (!opts.kinds || opts.kinds.includes(c.kind)) && (!opts.keys || opts.keys.includes(c.key)));
  const results: TestResult[] = [];
  for (const c of cases) {
    const ws = c.spec.kind === "guard" ? null : c.spec.workspace;
    let r: { status: TestStatus; detail: Record<string, unknown> };
    try {
      r = c.spec.kind === "guard" ? await guard(c.spec.check, spec) : c.spec.kind === "screen" ? await screen(c.spec.check, c.spec.workspace, spec) : await question(c.spec, spec);
    } catch (e) {
      r = { status: "error", detail: { error: (e as Error).message } };
    }
    results.push({ key: c.key, kind: c.kind, workspace: ws, ...r });
  }
  const summary: TestSummary = {
    batch, role: spec.id, version: spec.version, at: new Date().toISOString(),
    pass: results.filter((r) => r.status === "pass").length, fail: results.filter((r) => r.status === "fail").length,
    skip: results.filter((r) => r.status === "skip").length, error: results.filter((r) => r.status === "error").length, results,
  };
  if (opts.store !== false) {
    for (const r of results) {
      await sql.query("insert into test_runs (batch, role, role_version, case_key, workspace_id, status, detail) values ($1, $2, $3, $4, $5, $6, $7::jsonb)", [batch, spec.id, spec.version, r.key, r.workspace, r.status, toJson(r.detail)]);
    }
  }
  return summary;
}

/** the latest batch for a role version */
export async function latestResults(role: RoleId, version: string): Promise<{ batch: string; at: string; results: { case_key: string; status: TestStatus; workspace_id: string | null; detail: Record<string, unknown> }[] } | null> {
  const b = (await sql.query("select batch, max(created_at) as at from test_runs where role = $1 and role_version = $2 group by batch order by at desc limit 1", [role, version])) as { batch: string; at: string }[];
  if (!b[0]) return null;
  const results = (await sql.query("select case_key, status, workspace_id, detail from test_runs where batch = $1 order by case_key", [b[0].batch])) as never;
  return { ...b[0], results };
}

/** a proposal needs every guard and screen to pass, and no question to fail (skipped questions are allowed until the model runs here) */
export function passes(s: Pick<TestSummary, "results">): boolean {
  return s.results.every((r) => r.status === "pass" || (r.status === "skip"));
}

/** the newest result of every case for a version, run after `since` (the draft's last edit) */
export async function caseResults(role: RoleId, version: string, since: string): Promise<Map<string, { status: TestStatus; detail: Record<string, unknown>; at: string; workspace_id: string | null }>> {
  const rows = (await sql.query(
    "select distinct on (case_key) case_key, status, detail, created_at as at, workspace_id from test_runs where role = $1 and role_version = $2 and created_at >= $3 order by case_key, created_at desc",
    [role, version, since],
  )) as { case_key: string; status: TestStatus; detail: Record<string, unknown>; at: string; workspace_id: string | null }[];
  return new Map(rows.map((r) => [r.case_key, r]));
}

/** Can this draft be proposed? Every active case has run since its last edit, and none failed. */
export async function readiness(role: RoleId, version: string, since: string): Promise<{ ready: boolean; missing: string[]; failing: string[]; pass: number; skip: number; total: number }> {
  const [cases, results] = await Promise.all([listCases(role), caseResults(role, version, since)]);
  const active = cases.filter((c) => c.active);
  const missing = active.filter((c) => !results.has(c.key)).map((c) => c.key);
  const failing = active.filter((c) => ["fail", "error"].includes(results.get(c.key)?.status ?? "")).map((c) => c.key);
  const pass = active.filter((c) => results.get(c.key)?.status === "pass").length;
  const skip = active.filter((c) => results.get(c.key)?.status === "skip").length;
  return { ready: !missing.length && !failing.length, missing, failing, pass, skip, total: active.length };
}
