/**
 * What the connector offers: every analysis that can run in the connected
 * workspace (one tool each, straight from skills.registry.json), the whitelisted
 * metrics builder, and an overview of what the workspace holds. Numbers are
 * computed in SQL, as in the app; the client's model only phrases them.
 */
import { buildTools } from "../chat/tools";
import { MCP_LIMITS } from "../config/mcp";
import { sql } from "../db/client";
import { queryMetrics, type QueryMetricsInput } from "../query/builder";
import { availableSkills, runSkill } from "../skills/runner";
import type { Evidence } from "../skills/types";
import { getWorkspace } from "../workspace/store";

export type McpTool = { name: string; title?: string; description: string; inputSchema: Record<string, unknown>; annotations?: Record<string, unknown> };
export type ToolOutcome = { status: "ok" | "unavailable" | "error"; payload: Record<string, unknown>; error?: string };

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

/**
 * The analyses a connection offers. A PR team (one subject) gets the comment and post
 * analyses; the creator-market and brand-panel ones are built for a category of
 * competing brands and are not meaningful for one person, as the app's own PR
 * assistant is told (src/chat/loop.ts).
 */
const NOT_FOR_A_SUBJECT = new Set(["creators", "brands", "audience"]);

export async function connectorSkills(workspaceId: string) {
  const [skills, cfg] = await Promise.all([availableSkills(workspaceId), getWorkspace(workspaceId)]);
  return cfg?.kind === "profile" ? skills.filter((s) => !NOT_FOR_A_SUBJECT.has(s.layer)) : skills;
}

export async function listTools(workspaceId: string): Promise<McpTool[]> {
  const skills = await connectorSkills(workspaceId);
  const qm = buildTools().find((t) => t.name === "query_metrics") as { description?: string; input_schema: Record<string, unknown> } | undefined;
  const tools: McpTool[] = [
    {
      name: "workspace_overview",
      title: "What this workspace holds",
      description: "Start here. The team this connection acts for, the subject or brands tracked, the platforms and date range of the data, and how much is loaded. Takes no input.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: READ_ONLY,
    },
    ...skills.map((s) => ({
      name: s.name,
      title: s.title,
      description: `${s.description} Example: "${s.example}". Returns rows computed in the database with evidence (links to the posts or aggregates behind each number) and caveats.`,
      inputSchema: s.input_schema as Record<string, unknown>,
      annotations: READ_ONLY,
    })),
  ];
  if (qm) {
    tools.push({
      name: "query_metrics",
      title: "Custom metrics",
      description: (qm.description ?? "").replace("Use run_skill first when a skill exists.", "Use a named analysis first when one fits."),
      inputSchema: qm.input_schema,
      annotations: READ_ONLY,
    });
  }
  return tools;
}

/** Keeps one result inside the limits: rows first, then evidence, then a hard cut. */
function fit(payload: Record<string, unknown>): Record<string, unknown> {
  const rows = (payload.rows as unknown[] | undefined) ?? [];
  const evidence = (payload.evidence as unknown[] | undefined) ?? [];
  const out: Record<string, unknown> = { ...payload };
  if (rows.length > MCP_LIMITS.max_rows) {
    out.rows = rows.slice(0, MCP_LIMITS.max_rows);
    out.note = `Showing the first ${MCP_LIMITS.max_rows} of ${rows.length} rows. Narrow the question or open it in Fair Intelligence to see and export all of them.`;
  }
  if (evidence.length > MCP_LIMITS.max_evidence) out.evidence = evidence.slice(0, MCP_LIMITS.max_evidence);
  let text = JSON.stringify(out);
  while (text.length > MCP_LIMITS.max_result_chars && Array.isArray(out.rows) && (out.rows as unknown[]).length > 5) {
    out.rows = (out.rows as unknown[]).slice(0, Math.floor((out.rows as unknown[]).length / 2));
    out.note = `Showing ${(out.rows as unknown[]).length} of ${rows.length} rows to stay within the response size. Narrow the question for the rest.`;
    text = JSON.stringify(out);
  }
  return out;
}

const slimEvidence = (e: Evidence[]) => e.map((x) => ({ id: x.id, label: x.label, url: x.url, metrics: x.metrics }));

export async function callTool(workspaceId: string, userId: string, name: string, args: Record<string, unknown>): Promise<ToolOutcome> {
  if (name === "workspace_overview") return { status: "ok", payload: await overview(workspaceId) };
  if (name === "query_metrics") {
    const r = await queryMetrics(args as unknown as QueryMetricsInput, workspaceId);
    return { status: r.status, error: r.message, payload: fit({ status: r.status, message: r.message, rows: r.rows, evidence: slimEvidence(r.evidence), matched: r.meta.matched, caveats: r.meta.caveats }) };
  }
  const allowed = (await connectorSkills(workspaceId)).some((s) => s.name === name);
  if (!allowed) return { status: "error", error: `Unknown tool ${name}`, payload: { status: "error", message: `There is no analysis called ${name} in this workspace. List the tools again.` } };
  const r = await runSkill({ skill: name, workspace_id: workspaceId, params: args, actor: { user_id: userId, via: "api" } });
  return {
    status: r.status,
    error: r.status === "error" ? r.message : undefined,
    payload: fit({
      status: r.status,
      message: r.message,
      summary: r.summary,
      rows: r.rows,
      evidence: slimEvidence(r.evidence),
      matched: r.meta.matched,
      data_window: r.meta.data_window,
      data_as_of: r.meta.freshness,
      caveats: r.meta.caveats,
      params_used: r.params_resolved,
    }),
  };
}

async function overview(workspaceId: string): Promise<Record<string, unknown>> {
  const cfg = await getWorkspace(workspaceId);
  const [platforms, brands, comments] = await Promise.all([
    sql.query(
      `select platform, count(*)::int as posts, to_char(min(posted_at at time zone 'Asia/Jakarta'), 'YYYY-MM-DD') as first_post, to_char(max(posted_at at time zone 'Asia/Jakarta'), 'YYYY-MM-DD') as last_post
       from posts where workspace_id = $1 group by 1 order by 2 desc`,
      [workspaceId],
    ),
    sql.query("select id, name from brands where workspace_id = $1 order by name", [workspaceId]),
    sql.query("select count(*)::int as n, to_char(max(posted_at at time zone 'Asia/Jakarta'), 'YYYY-MM-DD HH24:MI') as last from comments where workspace_id = $1", [workspaceId]).catch(() => [{ n: 0, last: null }]),
  ]);
  const c = (comments as { n: number; last: string | null }[])[0];
  return {
    team: cfg?.team.label,
    workspace: cfg?.name,
    kind: cfg?.kind === "profile" ? "one subject (a person or brand), for reputation and PR" : "a category of competing brands, for brand and KOL marketing",
    subject_or_client: cfg?.client_brand_id ?? null,
    platforms,
    brands: cfg?.kind === "category" ? (brands as { id: string; name: string }[]).map((b) => b.name) : undefined,
    brand_count: (brands as unknown[]).length,
    comments: c?.n ? { count: c.n, latest: c.last } : "no comment text loaded",
    how_to_use: "Every number comes from these tools, computed in the database. Quote numbers as returned and cite their evidence (post links); do not derive new figures from them. Relative windows count back from the newest data, not from today.",
  };
}
