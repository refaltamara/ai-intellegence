/**
 * The brief (PRD-v2 §4.1, amended): CeMO speaks first. Keyed to the data state,
 * not the calendar: a new brief is written when the panel changes (a load), on
 * demand (rate-limited), or by the daily cron when the key has moved. It runs
 * three analyses with fixed parameters over the last seven days of data, gathers
 * what the watchers found this week, and asks the model to write the headline,
 * the body, one offer and up to two follow-ups. Never a number without evidence.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_WORKSPACE_ID } from "../config/thresholds";
import { sql } from "../db/client";
import { anthropicClient, describeModelError } from "../chat/client";
import { renumberEvidence, rewriteCitations } from "../chat/evidence";
import { buildSystem, hasModelCredentials, modelId } from "../chat/loop";
import { usableFollowups } from "../chat/stream";
import { whatChangedLines } from "../reports/render";
import type { Diff } from "../agents/diff";
import { impls } from "../skills/index";
import { SkillDb } from "../skills/db";
import { loadContext } from "../skills/params";
import { runSkill } from "../skills/runner";
import type { Evidence, SkillResult } from "../skills/types";
import { insertBrief, latestBrief, type BriefContent, type BriefItem, type BriefRow, type NoticedItem } from "./store";

const BRIEF_SYSTEM = readFileSync(path.join(process.cwd(), "src/brief/system.md"), "utf8");
const REFRESH_COOLDOWN_MS = 60 * 60 * 1000;

function addDays(iso: string, d: number): string {
  const x = new Date(iso + "T00:00:00Z");
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
}

/** The data state: newest post plus the last finished load. A new key means new data. */
export async function dataKey(workspaceId = DEFAULT_WORKSPACE_ID): Promise<string> {
  const [r] = (await sql.query(
    `select (select to_char(max(posted_at), 'YYYY-MM-DD"T"HH24:MI:SS') from posts where workspace_id = $1) as freshness,
            (select to_char(max(finished_at), 'YYYY-MM-DD"T"HH24:MI:SS') from data_loads where workspace_id = $1) as last_load`,
    [workspaceId],
  )) as { freshness: string | null; last_load: string | null }[];
  return `${r?.freshness ?? "none"}|${r?.last_load ?? "none"}`;
}

/** Return the brief for the current data state, writing one when the data moved or on demand. */
export async function ensureBrief(workspaceId = DEFAULT_WORKSPACE_ID, opts: { force?: boolean } = {}): Promise<{ brief: BriefRow; fresh: boolean; reason: string }> {
  const [key, latest] = await Promise.all([dataKey(workspaceId), latestBrief(workspaceId)]);
  if (latest && latest.data_key === key && !opts.force) return { brief: latest, fresh: false, reason: "data unchanged" };
  if (opts.force && latest && Date.now() - Date.parse(latest.generated_at) < REFRESH_COOLDOWN_MS) return { brief: latest, fresh: false, reason: "refreshed less than an hour ago" };
  const brief = await generateBrief(workspaceId, key);
  return { brief, fresh: true, reason: latest ? (latest.data_key === key ? "refreshed on demand" : "data changed") : "first brief" };
}

/** Agent runs in the last seven days that found something. */
export async function noticedThisWeek(workspaceId: string): Promise<NoticedItem[]> {
  const rows = (await sql.query(
    `select r.id, r.finished_at, r.diff, a.id as agent_id, a.name as agent_name, a.decision_id, d.name as decision_name
     from agent_runs r join agents a on a.id = r.agent_id left join decisions d on d.id = a.decision_id
     where a.workspace_id = $1 and r.finished_at > now() - interval '7 days' and r.diff is not null
     order by r.finished_at desc limit 20`,
    [workspaceId],
  )) as { id: string; finished_at: string; diff: Diff; agent_id: string; agent_name: string; decision_id: string | null; decision_name: string | null }[];
  return rows
    .map((r) => {
      const changes = r.diff.first_run ? 0 : r.diff.new.length + r.diff.gone.length + r.diff.changed.length;
      return { agent_id: r.agent_id, agent_name: r.agent_name, decision_id: r.decision_id, decision_name: r.decision_name, when: r.finished_at, changes, lines: whatChangedLines(r.diff, r.diff.diff_key).slice(0, 2) };
    })
    .filter((n) => n.changes > 0)
    .slice(0, 6);
}

const TOOL: Anthropic.Tool = {
  name: "write_brief",
  description: "Write the morning brief from the analyses provided. headline: the single most important change, one sentence, at most 140 characters, with an evidence id. body: one to three sentences with the numbers behind it, evidence ids inline. offer: one thing you would do next, phrased as a question the person can say yes to, with the prompt that would run it and the analysis it maps to; null when there is nothing worth doing. followups: up to two more, optional. quiet: true only when nothing moved beyond normal variance, in which case headline says so in one line and body may be empty.",
  input_schema: {
    type: "object",
    properties: {
      headline: { type: "string" },
      body: { type: "string" },
      offer: { anyOf: [{ type: "object", properties: { label: { type: "string" }, prompt: { type: "string" }, skill: { type: "string" }, params: { type: "object", additionalProperties: true } }, required: ["label", "prompt", "skill"], additionalProperties: false }, { type: "null" }] },
      followups: { type: "array", items: { type: "object", properties: { label: { type: "string" }, prompt: { type: "string" }, skill: { type: "string" }, params: { type: "object", additionalProperties: true } }, required: ["label", "prompt", "skill"], additionalProperties: false } },
      quiet: { type: "boolean" },
    },
    required: ["headline", "body", "offer", "followups", "quiet"],
    additionalProperties: false,
  },
  strict: false,
} as Anthropic.Tool;

export async function generateBrief(workspaceId: string, key: string): Promise<BriefRow> {
  const db = new SkillDb();
  const ctx = await loadContext(db, workspaceId);
  const to = ctx.asOf;
  const from = addDays(to, -6);
  const prior = { from: addDays(from, -7), to: addDays(from, -1) };
  const client = ctx.clientBrandId ? ctx.brands.find((b) => b.id === ctx.clientBrandId) ?? null : null;

  // the brands that mattered this week, client first when there is one
  const top = await db.q<{ brand_id: string }>(
    `select brand_id from posts where workspace_id = $1 and posted_at >= ($2::date::timestamp at time zone $4) and posted_at < (($3::date + 1)::timestamp at time zone $4)
     group by 1 order by count(*) desc limit 6`,
    [workspaceId, from, to, ctx.tz],
  );
  const brands = Array.from(new Set([...(client ? [client.id] : []), ...top.map((t) => t.brand_id)])).slice(0, 5);

  const actor = { user_id: "brief", via: "api" as const };
  const [compare, waves, breakout] = await Promise.all([
    runSkill({ skill: "compare", workspace_id: workspaceId, params: { brands, window: { from, to }, compare_prev: true }, actor }),
    runSkill({ skill: "waves", workspace_id: workspaceId, params: { window: { from, to }, lookback_days: 7, limit: 8 }, actor }),
    runSkill({ skill: "breakout", workspace_id: workspaceId, params: { window: { from, to }, limit: 5 }, actor }),
  ]);
  const noticed = await noticedThisWeek(workspaceId).catch(() => [] as NoticedItem[]);

  // one evidence sequence across the three results
  const counter = { n: 0 };
  const evidence: Evidence[] = [];
  const trimmed = [compare, waves, breakout].map((r) => {
    const re = renumberEvidence(r.evidence, r.rows, r.summary, counter);
    evidence.push(...re.evidence);
    return { skill: r.skill, status: r.status, params_resolved: r.params_resolved, summary: re.summary, rows: re.rows.slice(0, 40), rows_total: r.rows.length, evidence: re.evidence.map((e) => ({ id: e.id, label: e.label, metrics: e.metrics })), caveats: r.meta.caveats };
  });
  const known = new Set(evidence.map((e) => e.id));
  const base = { window: { from, to }, prior, client: client?.name ?? null, brands, noticed };

  const names = Object.fromEntries(ctx.brands.map((b) => [b.id, b.name]));
  let content: BriefContent;
  if (!hasModelCredentials()) {
    content = fallbackBrief(compare, base, names);
  } else {
    try {
      content = await writeWithModel(workspaceId, trimmed, noticed, base, known, ctx.tz);
    } catch (e) {
      console.error("brief generation failed:", describeModelError(e));
      content = fallbackBrief(compare, base, names);
    }
  }
  const cited = new Set<string>();
  for (const t of [content.headline, content.body]) for (const m of t.matchAll(/<ev id="(ev_\d+)"><\/ev>/g)) cited.add(m[1]);
  const kept = evidence.filter((e) => cited.has(e.id));
  return insertBrief({ workspaceId, dataKey: key, content, evidence: kept.length ? kept : evidence.slice(0, 12), quiet: content.quiet });
}

async function writeWithModel(workspaceId: string, results: unknown[], noticed: NoticedItem[], base: Pick<BriefContent, "window" | "prior" | "client" | "brands" | "noticed">, known: Set<string>, tz: string): Promise<BriefContent> {
  const client = anthropicClient();
  const system = await buildSystem(workspaceId);
  const dateHuman = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: tz });
  const suffix = BRIEF_SYSTEM.replace("{{date_human}}", dateHuman).replace("{{window}}", `${base.window.from} to ${base.window.to}`).replace("{{prior}}", `${base.prior.from} to ${base.prior.to}`).replace("{{available_skills}}", Object.keys(impls).join(", "));
  const res = await client.messages.create({
    model: modelId(),
    max_tokens: 900,
    output_config: { effort: "medium" },
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }, { type: "text", text: suffix }],
    tools: [TOOL],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: `Write the brief from these results:\n${JSON.stringify({ results, watchers_found: noticed })}` }],
  });
  const use = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!use) throw new Error("model did not call write_brief");
  const inp = use.input as { headline?: string; body?: string; offer?: BriefItem | null; followups?: BriefItem[]; quiet?: boolean };
  const h = rewriteCitations(String(inp.headline ?? "").trim(), known);
  const b = rewriteCitations(String(inp.body ?? "").trim(), known);
  const available = new Set(Object.keys(impls));
  const clean = (it: BriefItem | null | undefined): BriefItem | null => {
    if (!it || !it.label || !it.prompt) return null;
    const ok = !it.skill || it.skill === "query_metrics" || available.has(it.skill);
    return ok ? { label: String(it.label).slice(0, 80), prompt: String(it.prompt), ...(it.skill ? { skill: it.skill } : {}), ...(it.params && typeof it.params === "object" ? { params: it.params } : {}) } : null;
  };
  const followups = usableFollowups((inp.followups ?? []).map(clean).filter((x): x is BriefItem => !!x).map((f) => ({ ...f, skill: f.skill ?? "query_metrics" })), available).slice(0, 2);
  const quiet = !!inp.quiet || (!h.cited.length && !b.cited.length);
  if (!h.text) throw new Error("empty headline");
  return { ...base, headline: h.text, body: b.text, offer: clean(inp.offer), followups, quiet, generated_by: "model" };
}

/** Deterministic brief when the model is unavailable: reads the comparison rows directly. */
export function fallbackBrief(compare: SkillResult, base: Pick<BriefContent, "window" | "prior" | "client" | "brands" | "noticed">, names: Record<string, string> = {}): BriefContent {
  const rows = compare.status === "ok" ? compare.rows : [];
  const lead = rows[0] as Record<string, unknown> | undefined;
  const ev = compare.evidence[0]?.id;
  const chip = ev ? ` <ev id="${ev}"></ev>` : "";
  if (!lead) return { ...base, headline: `No posts between ${base.window.from} and ${base.window.to} yet.`, body: "", offer: null, followups: [], quiet: true, generated_by: "fallback" };
  const slug = String(lead.brand_id ?? "");
  const name = names[slug] ?? slug ?? "one brand";
  const views = typeof lead.views === "number" ? lead.views.toLocaleString("en-US") : null;
  return {
    ...base,
    headline: `${name} led the week of ${base.window.from} to ${base.window.to}${views ? ` with ${views} views` : ""}.${chip}`,
    body: `${base.brands.length} brands compared against the prior week; ${base.noticed.length ? `${base.noticed.length} watcher${base.noticed.length === 1 ? "" : "s"} found changes.` : "no watcher found a change."}`,
    offer: { label: `Want me to walk through ${name}'s week?`, prompt: `Tell me what ${name} did in the week of ${base.window.from} to ${base.window.to} and how it compares with the prior week`, skill: "brand-strategy" },
    followups: [],
    quiet: false,
    generated_by: "fallback",
  };
}
