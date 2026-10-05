/**
 * The Role Lab's AI (CMS plan, "Role Lab: improving a role with AI"). A role owner talks
 * to it about one draft; it reads the draft, the role's signals and Fair's recipes, edits
 * the draft, writes new recipes, adds and runs tests, and writes the release note. It
 * proposes, it never releases: proposing and releasing stay with people (role owners,
 * then Refal or Rafli). Every number it reads is counted in SQL; recipes go through the
 * whitelisted builder; its tokens are recorded under purpose "role_lab".
 */
import { kindCounts } from "../learning/views";
import { latestInsights } from "../learning/insights";
import type Anthropic from "@anthropic-ai/sdk";
import { sql } from "../db/client";
import { toJson } from "../db/json";
import { anthropicClient, describeModelError } from "../chat/client";
import { hasModelCredentials, modelId } from "../chat/loop";
import { COMMENT_GROUP_BY, COMMENT_METRICS, ENTITIES, FILTERS, GROUP_BY, METRICS } from "../query/builder";
import { fairRecipes, saveFairRecipe } from "../recipes/store";
import { runRecipe } from "../recipes/run";
import { RECIPE_PARAMS, validateRecipe, type RecipeSpec } from "../recipes/spec";
import { ROLES, type RoleId } from "./model";
import { POLICIES } from "./policy";
import { DRAFT_FIELDS, draftSpec, fairVersion, updateDraft, type DraftPatch, type Who } from "./store";
import { diffRoles } from "./diff";
import { addCase, listCases, runTests, TEST_WORKSPACES } from "./tests";

export type LabMessage = { role: "user" | "assistant"; text: string; actions?: string[]; at: string };

const MAX_ROUNDS = 10;

const TOOLS: Anthropic.Tool[] = [
  { name: "read_draft", description: "The draft's editable fields, what it changes against the current release, and its test cases.", input_schema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "read_signals", description: "How teams use this role across workspaces in the last 30 days: changes clients made to their version (which fields, how often), the analyses CeMO ran, and the latest test results. Counts only; no client text.", input_schema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "list_recipes", description: "Fair's recipes (ready-made analyses) and the query builder's whitelist a new recipe must stay inside.", input_schema: { type: "object", properties: {}, additionalProperties: false } },
  {
    name: "edit_draft",
    description: `Change the draft. Only these fields: ${DRAFT_FIELDS.join(", ")}. Give only the fields that change; lists replace the whole list. Thresholds must keep their guard rails.`,
    input_schema: { type: "object", properties: { patch: { type: "object", description: "field -> new value" } }, required: ["patch"], additionalProperties: false },
  },
  {
    name: "write_recipe",
    description: "Add a new recipe to Fair's library (a new key; existing recipes are never changed, since released roles use them). It is validated, tried on a test workspace, then saved. Add its key to the draft's recipes with edit_draft to offer it.",
    input_schema: { type: "object", properties: { recipe: { type: "object", description: "A RecipeSpec: key, title, description, activity, examples, roles, query {entity, filters?, group_by?, metrics, order_by?, limit?}, params, present, caveat?" } }, required: ["recipe"], additionalProperties: false },
  },
  {
    name: "add_test",
    description: "Add a golden question to this role's test set: a real question a team would ask, the test workspace, and the analyses that should answer it (recipe:<key>, a skill name, or query_metrics).",
    input_schema: { type: "object", properties: { key: { type: "string" }, q: { type: "string" }, workspace: { type: "string" }, uses_any: { type: "array", items: { type: "string" } } }, required: ["key", "q", "workspace"], additionalProperties: false },
  },
  {
    name: "run_tests",
    description: "Run the draft's guards and screens (fast). To run one golden question, pass its key in keys (each takes a chat turn).",
    input_schema: { type: "object", properties: { keys: { type: "array", items: { type: "string" } } }, additionalProperties: false },
  },
  { name: "write_release_note", description: "Set the draft's release note: what changed and why, in two or three plain sentences.", input_schema: { type: "object", properties: { note: { type: "string" } }, required: ["note"], additionalProperties: false } },
];

function system(role: RoleId, version: string): string {
  const r = ROLES[role];
  return [
    `You are the Role Lab for Fair Intelligence. You work with a Fair role owner on ${r.codename} ${version}, a draft of the ${r.label} role (${r.description}).`,
    "A role is how the product behaves for one kind of team: CeMO's voice and first screen, the suggested questions, the analyses (recipes) and deck templates it offers, the order of the composer, and its thresholds. Clients each run their own version on top; a release never touches what a client built.",
    "Work like a careful product engineer: read the draft and the signals first, make the smallest change that does what the owner asked, say what you changed in plain words, and run the tests after a change. Never invent usage numbers: quote only what read_signals returned. Recipes count in SQL through the whitelisted builder; you never write SQL.",
    "You cannot release or propose; the owner proposes, and Refal or Rafli release. If something needs code (a new chart, a new kind of analysis the builder cannot express, a dashboard layout), say so and write it up as a code request in your answer instead of forcing it.",
    "Answer in the owner's language (Indonesian or English), briefly. End with what to check next.",
  ].join("\n\n");
}

async function tool(name: string, input: Record<string, unknown>, role: RoleId, version: string, who: Who, actions: string[]): Promise<string> {
  switch (name) {
    case "read_draft": {
      const spec = await draftSpec(role, version);
      if (!spec) return "The draft is gone.";
      const current = (await fairVersion(role)) ?? ROLES[role];
      const fields = Object.fromEntries(DRAFT_FIELDS.map((f) => [f, (spec as Record<string, unknown>)[f] ?? null]));
      const cases = await listCases(role);
      return JSON.stringify({ version, status: spec._status, current: current.version, fields, changes: diffRoles(current, spec), tests: cases.map((c) => ({ key: c.key, kind: c.kind, ...(c.spec.kind === "question" ? { q: c.spec.q, workspace: c.spec.workspace } : {}) })), test_workspaces: TEST_WORKSPACES[role] });
    }
    case "read_signals": {
      const [changes, runs, events, tests] = await Promise.all([
        sql.query("select k as field, count(*)::int as companies from (select distinct on (workspace_id) workspace_id, overrides from company_versions where role = $1 order by workspace_id, version desc) c, jsonb_object_keys(c.overrides) k group by 1 order by 2 desc", [role]),
        sql.query("select skill, count(*)::int as runs from skill_runs where created_at > now() - interval '30 days' group by 1 order by 2 desc limit 15"),
        kindCounts({ role }).then((k) => k.map((x) => ({ signal: x.label, count: x.n, workspaces: x.workspaces }))),
        sql.query("select distinct on (case_key) case_key, status from test_runs where role = $1 and role_version = $2 order by case_key, created_at desc", [role, version]),
      ]);
      const insights = (await latestInsights(role)).map((i) => ({ insight: i.sentence, workspaces: i.workspaces, since: i.first_day }));
      return JSON.stringify({ insights, client_changes: changes, analyses_run_last_30_days_all_roles: runs, role_signals_last_30_days: events, latest_tests: tests, note: "Insights carry three workspaces or more; signals below that are thin. Quote counts as given and say when they are thin rather than generalising." });
    }
    case "list_recipes": {
      const all = [...(await fairRecipes()).values()];
      return JSON.stringify({
        recipes: all.map((r) => ({ key: r.key, title: r.title, description: r.description, roles: r.roles, params: r.params, query: r.query })),
        builder: { entities: ENTITIES, posts: { group_by: GROUP_BY, metrics: METRICS, filters: Object.keys(FILTERS) }, comments: { group_by: COMMENT_GROUP_BY, metrics: COMMENT_METRICS, filters: ["brand_id", "platform", "source", "sentiment", "topic", "purchase_intent", "min_likes"] }, params: RECIPE_PARAMS },
      });
    }
    case "edit_draft": {
      const patch = (input.patch ?? {}) as DraftPatch;
      const bad: string[] = [];
      for (const block of ["alert", "watch"] as const) {
        const v = patch[block] as Record<string, unknown> | undefined;
        if (v) for (const [k, n] of Object.entries(v)) if (POLICIES[`${block}.${k}`] && POLICIES[`${block}.${k}`].check(n, ROLES[role]) === undefined) bad.push(`${block}.${k}=${String(n)} is outside its guard rails`);
      }
      if (patch.recipes) {
        const all = await fairRecipes();
        for (const k of patch.recipes) if (!all.has(k)) bad.push(`recipe ${k} does not exist`);
      }
      if (bad.length) return `Not saved: ${bad.join("; ")}.`;
      const r = await updateDraft(role, version, patch, who);
      if (!r.ok) return `Not saved: ${r.error}`;
      actions.push(`Edited ${Object.keys(patch).join(", ")}`);
      return `Saved ${Object.keys(patch).join(", ")}. Tests must run again.`;
    }
    case "write_recipe": {
      const spec = input.recipe as RecipeSpec;
      const errors = validateRecipe(spec ?? {});
      if (errors.length) return `Not saved: ${errors.join(" ")}`;
      if ((await fairRecipes()).has(spec.key)) return `Not saved: ${spec.key} exists and released roles may use it. Use a new key.`;
      const ws = TEST_WORKSPACES[role][0];
      const tried = await runRecipe(spec, {}, ws);
      if (tried.status !== "ok") return `Not saved: it failed on ${ws}: ${tried.message}`;
      const saved = await saveFairRecipe(spec, who.email);
      if (!saved.ok) return `Not saved: ${saved.errors.join(" ")}`;
      actions.push(`Wrote recipe ${spec.title}`);
      return `Saved recipe ${spec.key}. On ${ws} it returned ${tried.rows.length} rows (${tried.window.from} to ${tried.window.to}). Add it to the draft's recipes to offer it.`;
    }
    case "add_test": {
      const key = String(input.key ?? "").replace(/[^a-z0-9-]/gi, "-").toLowerCase().slice(0, 40);
      const ws = String(input.workspace ?? "");
      if (!key || !String(input.q ?? "").trim()) return "Not added: a key and a question are required.";
      if (!TEST_WORKSPACES[role].includes(ws)) return `Not added: the test workspaces for this role are ${TEST_WORKSPACES[role].join(", ")}.`;
      await addCase({ key: key.startsWith("q-") ? key : `q-${key}`, role, kind: "question", spec: { kind: "question", workspace: ws, q: String(input.q), expect: { uses_any: (input.uses_any as string[] | undefined)?.length ? (input.uses_any as string[]) : undefined, asks_at_most: 1, cites: true } }, source: "lab" }, who.email);
      actions.push(`Added test "${String(input.q).slice(0, 60)}"`);
      return "Added to the test set.";
    }
    case "run_tests": {
      const spec = await draftSpec(role, version);
      if (!spec) return "The draft is gone.";
      const keys = (input.keys as string[] | undefined)?.slice(0, 3);
      const s = await runTests(spec, keys?.length ? { keys } : { kinds: ["guard", "screen"] });
      actions.push(`Ran ${s.results.length} tests: ${s.pass} pass, ${s.fail + s.error} fail, ${s.skip} skipped`);
      return JSON.stringify({ pass: s.pass, fail: s.fail, skip: s.skip, error: s.error, results: s.results.map((r) => ({ key: r.key, status: r.status, detail: r.detail })) }).slice(0, 12000);
    }
    case "write_release_note": {
      const note = String(input.note ?? "").trim().slice(0, 1000);
      if (!note) return "Not saved: empty note.";
      await sql.query("update role_versions set release_note = $3 where role = $1 and version = $2 and status in ('draft','proposed')", [role, version, note]);
      actions.push("Wrote the release note");
      return "Saved the release note.";
    }
    default:
      return `Unknown tool ${name}.`;
  }
}

/** The session for this draft and owner, created on first use. */
export async function labSession(role: RoleId, version: string, owner: string): Promise<{ id: string; messages: LabMessage[]; tokens: number }> {
  const rows = (await sql.query("select id, messages, tokens from lab_sessions where role = $1 and draft_version = $2 and owner = $3 order by updated_at desc limit 1", [role, version, owner])) as { id: string; messages: LabMessage[]; tokens: number }[];
  if (rows[0]) return rows[0];
  const created = (await sql.query("insert into lab_sessions (role, draft_version, owner) values ($1, $2, $3) returning id, messages, tokens", [role, version, owner])) as { id: string; messages: LabMessage[]; tokens: number }[];
  return created[0];
}

/** One turn with the Lab: the owner's message, the AI's tool rounds, its answer and what it changed. */
export async function labTurn(role: RoleId, version: string, who: Who, text: string): Promise<{ ok: true; reply: string; actions: string[] } | { ok: false; error: string }> {
  if (!hasModelCredentials()) return { ok: false, error: "The model is not configured here (ANTHROPIC_API_KEY). Edit the draft with the form meanwhile." };
  const spec = await draftSpec(role, version);
  if (!spec || !["draft", "proposed"].includes(spec._status)) return { ok: false, error: "The Lab works on drafts." };
  const session = await labSession(role, version, who.email);
  const history: Anthropic.MessageParam[] = session.messages.slice(-12).map((m) => ({ role: m.role, content: m.text }));
  const messages: Anthropic.MessageParam[] = [...history, { role: "user", content: text }];
  const client = anthropicClient({ workspace: null, purpose: "role_lab", ref: session.id });
  const actions: string[] = [];
  let tokens = 0;
  let reply = "";
  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const res = await client.messages.create({ model: modelId(), max_tokens: 8000, system: system(role, version), tools: TOOLS, messages });
      tokens += res.usage.input_tokens + res.usage.output_tokens;
      reply = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
      const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (res.stop_reason !== "tool_use" || !uses.length) break;
      messages.push({ role: "assistant", content: res.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const u of uses) results.push({ type: "tool_result", tool_use_id: u.id, content: await tool(u.name, (u.input ?? {}) as Record<string, unknown>, role, version, who, actions).catch((e) => `Failed: ${(e as Error).message}`) });
      messages.push({ role: "user", content: results });
    }
  } catch (e) {
    return { ok: false, error: describeModelError(e) };
  }
  const now = new Date().toISOString();
  const kept: LabMessage[] = [...session.messages, { role: "user" as const, text, at: now }, { role: "assistant" as const, text: reply || "(no answer)", actions, at: now }].slice(-40);
  await sql.query("update lab_sessions set messages = $2::jsonb, tokens = tokens + $3, updated_at = now() where id = $1", [session.id, toJson(kept), tokens]);
  return { ok: true, reply, actions };
}
