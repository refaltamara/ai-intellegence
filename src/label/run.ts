/**
 * Labels unlabelled comments (sentiment) and earned posts (stance) in profile
 * workspaces, in batches, within a time budget. Runs on Vercel via
 * /api/cron/label; the sandbox and the loader never call the model.
 *
 * Idempotent: only rows with sentiment null and sentiment_source null are
 * picked up, so labels that came with an export ('listening') and the subject's
 * own replies ('subject') are left alone. A batch the model answers badly is
 * marked 'model_failed' so it is not retried forever; the response reports it.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { anthropicClient } from "../chat/client";
import { modelId } from "../chat/loop";
import { sql } from "../db/client";
import { getWorkspace } from "../workspace/store";
import { LABEL_COMMENTS_TOOL, LABEL_POSTS_TOOL, commentBatchPrompt, commentSystem, parseLabels, stanceBatchPrompt, stanceSystem, type CommentForLabel, type PostForLabel } from "./prompt";

export type LabelOutcome = {
  workspace: string;
  subject: string;
  comments_labelled: number;
  comments_failed: number;
  comments_remaining: number;
  posts_labelled: number;
  posts_failed: number;
  posts_remaining: number;
  calls: number;
  duration_ms: number;
  stopped: "done" | "budget" | "error";
  error?: string;
};

export type LabelOptions = { budgetMs?: number; batchSize?: number; client?: Anthropic };

const DEFAULT_BUDGET_MS = 240_000;
const DEFAULT_BATCH = 40;

export async function labelWorkspace(workspaceId: string, opts: LabelOptions = {}): Promise<LabelOutcome> {
  const started = Date.now();
  const budget = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  const batch = opts.batchSize ?? DEFAULT_BATCH;
  const cfg = await getWorkspace(workspaceId);
  const out: LabelOutcome = { workspace: workspaceId, subject: cfg?.name ?? workspaceId, comments_labelled: 0, comments_failed: 0, comments_remaining: 0, posts_labelled: 0, posts_failed: 0, posts_remaining: 0, calls: 0, duration_ms: 0, stopped: "done" };
  if (!cfg || cfg.kind !== "profile") return { ...out, duration_ms: Date.now() - started };
  const subject = (await clientName(workspaceId)) ?? cfg.name;
  out.subject = subject;
  const client = opts.client ?? anthropicClient();
  const inBudget = () => Date.now() - started < budget;

  try {
    // comments first: they are the headline number
    while (inBudget()) {
      const rows = (await sql.query(
        `select c.id, c.text, c.platform, c.likes, p.url as post_url, p.caption as post_caption, p.source as post_source, p.creator_handle as post_handle
         from comments c join posts p on p.id = c.post_id
         where c.workspace_id = $1 and c.sentiment is null and c.sentiment_source is null and c.text is not null
         order by p.id, c.likes desc nulls last, c.posted_at
         limit $2`,
        [workspaceId, batch],
      )) as CommentForLabel[];
      if (!rows.length) break;
      const res = await client.messages.create({
        model: modelId(),
        max_tokens: 4000,
        output_config: { effort: "low" },
        system: [{ type: "text", text: commentSystem(subject), cache_control: { type: "ephemeral" } }],
        tools: [LABEL_COMMENTS_TOOL],
        tool_choice: { type: "tool", name: LABEL_COMMENTS_TOOL.name },
        messages: [{ role: "user", content: commentBatchPrompt(subject, rows) }],
      });
      out.calls += 1;
      const use = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      const { labels, missing } = parseLabels(use?.input, rows.map((r) => r.id));
      if (labels.length) {
        await sql.query(
          `update comments c set sentiment = l.sentiment, sentiment_confidence = l.confidence, sentiment_source = 'model', classified_at = now()
           from jsonb_to_recordset($1::jsonb) as l(id uuid, sentiment text, confidence numeric) where c.id = l.id and c.workspace_id = $2`,
          [JSON.stringify(labels), workspaceId],
        );
        out.comments_labelled += labels.length;
      }
      if (missing.length) {
        await sql.query(`update comments set sentiment_source = 'model_failed', classified_at = now() where workspace_id = $1 and id = any($2::uuid[])`, [workspaceId, missing]);
        out.comments_failed += missing.length;
      }
    }
    // then stance on earned posts with a caption
    while (inBudget()) {
      const rows = (await sql.query(
        `select id, platform, creator_handle as handle, caption, url from posts
         where workspace_id = $1 and source = 'earned' and stance is null and stance_source is null and caption is not null and content_type is distinct from 'stub'
         order by views desc nulls last, posted_at limit $2`,
        [workspaceId, batch],
      )) as PostForLabel[];
      if (!rows.length) break;
      const res = await client.messages.create({
        model: modelId(),
        max_tokens: 4000,
        output_config: { effort: "low" },
        system: [{ type: "text", text: stanceSystem(subject), cache_control: { type: "ephemeral" } }],
        tools: [LABEL_POSTS_TOOL],
        tool_choice: { type: "tool", name: LABEL_POSTS_TOOL.name },
        messages: [{ role: "user", content: stanceBatchPrompt(rows) }],
      });
      out.calls += 1;
      const use = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      const { labels, missing } = parseLabels(use?.input, rows.map((r) => r.id));
      if (labels.length) {
        await sql.query(
          `update posts p set stance = l.sentiment, stance_source = 'model' from jsonb_to_recordset($1::jsonb) as l(id uuid, sentiment text) where p.id = l.id and p.workspace_id = $2`,
          [JSON.stringify(labels), workspaceId],
        );
        out.posts_labelled += labels.length;
      }
      if (missing.length) {
        await sql.query(`update posts set stance_source = 'model_failed' where workspace_id = $1 and id = any($2::uuid[])`, [workspaceId, missing]);
        out.posts_failed += missing.length;
      }
    }
  } catch (e) {
    out.stopped = "error";
    out.error = (e as Error).message;
  }
  const rem = (await sql.query(
    `select (select count(*) from comments where workspace_id = $1 and sentiment is null and sentiment_source is null and text is not null)::int as c,
            (select count(*) from posts where workspace_id = $1 and source = 'earned' and stance is null and stance_source is null and caption is not null and content_type is distinct from 'stub')::int as p`,
    [workspaceId],
  )) as { c: number; p: number }[];
  out.comments_remaining = rem[0]?.c ?? 0;
  out.posts_remaining = rem[0]?.p ?? 0;
  if (out.stopped === "done" && (out.comments_remaining || out.posts_remaining)) out.stopped = "budget";
  out.duration_ms = Date.now() - started;
  return out;
}

async function clientName(workspaceId: string): Promise<string | null> {
  const rows = (await sql.query("select b.name from workspaces w join brands b on b.id = w.client_brand_id where w.id = $1", [workspaceId])) as { name: string }[];
  return rows[0]?.name ?? null;
}

/** Label counts per workspace for the Data page and the cron response. */
export async function labelStatus(workspaceId: string): Promise<{ comments: number; labelled: number; failed: number; subject_replies: number; posts_earned: number; stances: number }> {
  const rows = (await sql.query(
    `select (select count(*) from comments where workspace_id = $1)::int as comments,
            (select count(*) from comments where workspace_id = $1 and sentiment is not null)::int as labelled,
            (select count(*) from comments where workspace_id = $1 and sentiment_source = 'model_failed')::int as failed,
            (select count(*) from comments where workspace_id = $1 and sentiment_source = 'subject')::int as subject_replies,
            (select count(*) from posts where workspace_id = $1 and source = 'earned' and content_type is distinct from 'stub')::int as posts_earned,
            (select count(*) from posts where workspace_id = $1 and stance is not null)::int as stances`,
    [workspaceId],
  )) as { comments: number; labelled: number; failed: number; subject_replies: number; posts_earned: number; stances: number }[];
  return rows[0];
}
