/**
 * Labels unlabelled comments (sentiment) and earned posts (stance) in profile
 * workspaces, in batches, within a time budget. Runs on Vercel via
 * /api/cron/label; the sandbox and the loader never call the model.
 *
 * Idempotent: only rows with sentiment null and sentiment_source null are
 * picked up, so labels that came with an export ('listening') and the subject's
 * own replies ('subject') are left alone. A row a batch came back without is
 * marked 'model_failed' and tried once more, but only when nothing new is
 * waiting; if it fails again it becomes 'model_failed_final' and is never picked
 * up again. Two attempts, then it stops costing anything.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { anthropicClient, toolAnswer } from "../chat/client";
import { modelId } from "../chat/loop";
import { sql } from "../db/client";
import { getWorkspace } from "../workspace/store";
import { COMMENT_CLASSES, SENTIMENTS, commentBatchPrompt, commentSystem, labelTool, parseLabels, stanceBatchPrompt, stanceSystem, type CommentForLabel, type LabelContext, type LabelTopic, type PostForLabel } from "./prompt";
import { toJson } from "../db/json";

export type LabelOutcome = {
  workspace: string;
  subject: string;
  comments_labelled: number;
  comments_failed: number;
  comments_retried: number;
  comments_remaining: number;
  posts_labelled: number;
  posts_failed: number;
  posts_retried: number;
  posts_remaining: number;
  calls: number;
  calls_failed: number;
  duration_ms: number;
  stopped: "done" | "budget" | "error";
  error?: string;
  last_error?: string;
};

export type LabelOptions = { budgetMs?: number; batchSize?: number; parallel?: number; client?: Anthropic };

const DEFAULT_BUDGET_MS = 240_000;
const DEFAULT_BATCH = 40;
// Eight calls in flight rather than four: a round is bounded by the slowest call,
// not by the work, so widening it roughly doubles what a ten-minute tick clears.
// Batches stay at 40 — a wider batch only widens the damage when one comes back bad.
const DEFAULT_PARALLEL = 8;

/** One labelling call, retried once after a pause when the API is busy (429, 529, overloaded). Other errors surface. */
async function callModel(client: Anthropic, req: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> {
  try {
    return await client.messages.create(req);
  } catch (e) {
    const status = (e as { status?: number }).status;
    const busy = status === 429 || status === 529 || /overloaded|rate/i.test((e as Error).message ?? "");
    if (!busy) throw e;
    await new Promise((r) => setTimeout(r, 15_000));
    return await client.messages.create(req);
  }
}

/**
 * The next comments to label: new ones first and, only when nothing new is
 * waiting, the rows a batch once came back without. That ordering matters —
 * fresh data never queues behind a retry — and a retry that fails again is
 * marked final, so a comment the model cannot answer costs two attempts rather
 * than a call every ten minutes forever.
 */
async function nextComments(workspaceId: string, limit: number): Promise<{ rows: CommentForLabel[]; retry: boolean }> {
  const pick = (where: string) =>
    `select c.id, c.text, c.platform, c.likes, p.url as post_url, p.caption as post_caption, p.source as post_source, p.creator_handle as post_handle
     from comments c join posts p on p.id = c.post_id
     where c.workspace_id = $1 and c.text is not null and c.sentiment is null and ${where}
     order by p.id, c.likes desc nulls last, c.posted_at
     limit $2`;
  const fresh = (await sql.query(pick("c.sentiment_source is null"), [workspaceId, limit])) as CommentForLabel[];
  if (fresh.length) return { rows: fresh, retry: false };
  return { rows: (await sql.query(pick("c.sentiment_source = 'model_failed'"), [workspaceId, limit])) as CommentForLabel[], retry: true };
}

/** The same rule for post stance. */
async function nextPosts(workspaceId: string, limit: number): Promise<{ rows: PostForLabel[]; retry: boolean }> {
  const pick = (where: string) =>
    `select id, platform, creator_handle as handle, caption, url from posts
     where workspace_id = $1 and source = 'earned' and stance is null and caption is not null and content_type is distinct from 'stub' and ${where}
     order by views desc nulls last, posted_at
     limit $2`;
  // 'awaiting_context': loaded before this labeller (with workspace context and topics) was deployed, held back from the old one
  const fresh = (await sql.query(pick("(stance_source is null or stance_source = 'awaiting_context')"), [workspaceId, limit])) as PostForLabel[];
  if (fresh.length) return { rows: fresh, retry: false };
  return { rows: (await sql.query(pick("stance_source = 'model_failed'"), [workspaceId, limit])) as PostForLabel[], retry: true };
}

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

export async function labelWorkspace(workspaceId: string, opts: LabelOptions = {}): Promise<LabelOutcome> {
  const started = Date.now();
  const budget = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  const batch = opts.batchSize ?? DEFAULT_BATCH;
  const parallel = Math.max(1, opts.parallel ?? DEFAULT_PARALLEL);
  const cfg = await getWorkspace(workspaceId);
  const out: LabelOutcome = { workspace: workspaceId, subject: cfg?.name ?? workspaceId, comments_labelled: 0, comments_failed: 0, comments_retried: 0, comments_remaining: 0, posts_labelled: 0, posts_failed: 0, posts_retried: 0, posts_remaining: 0, calls: 0, calls_failed: 0, duration_ms: 0, stopped: "done" };
  if (!cfg || cfg.kind !== "profile") return { ...out, duration_ms: Date.now() - started };
  const subject = (await clientName(workspaceId)) ?? cfg.name;
  out.subject = subject;
  const ctx = await labelContext(workspaceId, subject);
  const extra = { topics: ctx.topics?.map((t) => t.id), voices: ctx.voices };
  const commentTool = labelTool("comments", ctx);
  const postTool = labelTool("posts", ctx);
  const client = opts.client ?? anthropicClient({ workspace: workspaceId, purpose: "comment_labels" });
  const inBudget = () => Date.now() - started < budget;

  try {
    // comments first: they are the headline number. Several batches per round, in
    // parallel: one call of 40 comments takes about 40 s of output, so a serial
    // loop only clears ~200 comments per cron tick.
    while (inBudget()) {
      const { rows, retry } = await nextComments(workspaceId, batch * parallel);
      if (!rows.length) break;
      const batches = chunk(rows, batch);
      const results = await Promise.all(batches.map(async (b) => {
        try {
          const { use } = await toolAnswer((req) => callModel(client, req), {
            model: modelId(),
            max_tokens: 8000,
            output_config: { effort: "low" },
            system: [{ type: "text", text: commentSystem(ctx), cache_control: { type: "ephemeral" } }],
            tools: [commentTool],
            messages: [{ role: "user", content: commentBatchPrompt(subject, b) }],
          }, commentTool.name);
          return parseLabels(use?.input, b.map((r) => r.id), COMMENT_CLASSES, extra);
        } catch (e) {
          out.calls_failed += 1;
          out.last_error = (e as Error).message?.slice(0, 300);
          return { labels: [], missing: [] as string[], failed: true };
        }
      }));
      out.calls += batches.length;
      // a round where every call failed is a stalled API, not bad comments: stop and let the next tick retry
      if (results.every((r) => (r as { failed?: boolean }).failed)) { out.stopped = "error"; out.error = out.last_error; break; }
      const labels = results.flatMap((r) => r.labels);
      const missing = results.flatMap((r) => r.missing);
      if (labels.length) {
        await sql.query(
          `update comments c set sentiment = case when l.sentiment = 'off_topic' then 'neutral' else l.sentiment end,
                  off_topic = (l.sentiment = 'off_topic'),
                  sentiment_confidence = l.confidence, sentiment_source = 'model', classified_at = now(),
                  topic_id = coalesce(l.topic, c.topic_id), topic_confidence = case when l.topic is not null then l.confidence else c.topic_confidence end,
                  voice = coalesce(l.voice, c.voice)
           from jsonb_to_recordset($1::jsonb) as l(id uuid, sentiment text, confidence numeric, topic text, voice text) where c.id = l.id and c.workspace_id = $2`,
          [toJson(labels), workspaceId],
        );
        out.comments_labelled += labels.length;
      }
      if (missing.length) {
        await sql.query(`update comments set sentiment_source = $3, classified_at = now() where workspace_id = $1 and id = any($2::uuid[])`, [workspaceId, missing, retry ? "model_failed_final" : "model_failed"]);
        out.comments_failed += missing.length;
      }
      if (retry) out.comments_retried += rows.length;
    }
    // then stance on earned posts with a caption, the same way
    while (inBudget()) {
      const { rows, retry } = await nextPosts(workspaceId, batch * parallel);
      if (!rows.length) break;
      const batches = chunk(rows, batch);
      const results = await Promise.all(batches.map(async (b) => {
        try {
          const { use } = await toolAnswer((req) => callModel(client, req), {
            model: modelId(),
            max_tokens: 8000,
            output_config: { effort: "low" },
            system: [{ type: "text", text: stanceSystem(ctx), cache_control: { type: "ephemeral" } }],
            tools: [postTool],
            messages: [{ role: "user", content: stanceBatchPrompt(b) }],
          }, postTool.name);
          return parseLabels(use?.input, b.map((r) => r.id), ctx.post_off_topic ? [...SENTIMENTS, "off_topic"] : SENTIMENTS, extra);
        } catch (e) {
          out.calls_failed += 1;
          out.last_error = (e as Error).message?.slice(0, 300);
          return { labels: [], missing: [] as string[], failed: true };
        }
      }));
      out.calls += batches.length;
      if (results.every((r) => (r as { failed?: boolean }).failed)) { out.stopped = "error"; out.error = out.last_error; break; }
      const labels = results.flatMap((r) => r.labels);
      const missing = results.flatMap((r) => r.missing);
      if (labels.length) {
        await sql.query(
          // a post that is not about the subject or the case is set aside (relevant = false), as listening workspaces do
          `update posts p set stance = case when l.sentiment = 'off_topic' then null else l.sentiment end, stance_source = 'model',
                  relevant = case when l.sentiment = 'off_topic' then false else p.relevant end,
                  topic_id = coalesce(l.topic, p.topic_id), topic_confidence = case when l.topic is not null then l.confidence else p.topic_confidence end,
                  voice = coalesce(l.voice, p.voice)
           from jsonb_to_recordset($1::jsonb) as l(id uuid, sentiment text, confidence numeric, topic text, voice text) where p.id = l.id and p.workspace_id = $2`,
          [toJson(labels), workspaceId],
        );
        out.posts_labelled += labels.length;
      }
      if (missing.length) {
        await sql.query(`update posts set stance_source = $3 where workspace_id = $1 and id = any($2::uuid[])`, [workspaceId, missing, retry ? "model_failed_final" : "model_failed"]);
        out.posts_failed += missing.length;
      }
      if (retry) out.posts_retried += rows.length;
    }
  } catch (e) {
    out.stopped = "error";
    out.error = (e as Error).message;
  }
  const rem = (await sql.query(
    `select (select count(*) from comments where workspace_id = $1 and sentiment is null and coalesce(sentiment_source, '') in ('', 'model_failed') and text is not null)::int as c,
            (select count(*) from posts where workspace_id = $1 and source = 'earned' and stance is null and coalesce(stance_source, '') in ('', 'model_failed', 'awaiting_context') and caption is not null and content_type is distinct from 'stub')::int as p`,
    [workspaceId],
  )) as { c: number; p: number }[];
  out.comments_remaining = rem[0]?.c ?? 0;
  out.posts_remaining = rem[0]?.p ?? 0;
  if (out.stopped === "done" && (out.comments_remaining || out.posts_remaining)) out.stopped = "budget";
  out.duration_ms = Date.now() - started;
  // leave a trace on the Data page (data_loads) whenever the run did or tried anything
  if (out.calls > 0 || out.error) {
    await sql.query(
      `insert into data_loads (workspace_id, file, platform, kind, rows_in, rows_loaded, rows_rejected, report, finished_at)
       values ($1, $2, null, 'labels', $3, $4, $5, $6::jsonb, now())`,
      [workspaceId, `labelling ${out.stopped === "error" ? "(stopped on error)" : out.stopped === "budget" ? "(more to do)" : "(complete)"}`, out.comments_labelled + out.comments_failed + out.posts_labelled + out.posts_failed, out.comments_labelled + out.posts_labelled, out.comments_failed + out.posts_failed, toJson(out)],
    ).catch(() => undefined);
  }
  return out;
}

/**
 * The workspace's labelling context: settings.label (about, context, languages, voices, post_off_topic)
 * and its topics, the catch-all last. A workspace without settings.label keeps the original prompts.
 */
export async function labelContext(workspaceId: string, subject: string): Promise<LabelContext> {
  const rows = (await sql.query("select settings->'label' as label from workspaces where id = $1", [workspaceId])) as { label: Record<string, unknown> | null }[];
  const l = rows[0]?.label;
  if (!l || typeof l !== "object") return { subject };
  const str = (k: string) => (typeof l[k] === "string" && (l[k] as string).trim() ? (l[k] as string).trim() : undefined);
  const topics = l.topics === false ? [] : ((await sql.query(
    "select id, label, definition, is_catch_all as catch_all from topics where workspace_id = $1 order by is_catch_all, sort_order, label",
    [workspaceId],
  )) as LabelTopic[]);
  const voices = Array.isArray(l.voices) ? (l.voices as unknown[]).filter((v): v is string => typeof v === "string" && /^[\w' -]{2,30}$/.test(v)) : [];
  return {
    subject: str("subject") ?? subject,
    about: str("about"),
    context: str("context"),
    languages: str("languages"),
    topics: topics.length ? topics : undefined,
    voices: voices.length ? voices : undefined,
    voice_hint: str("voice_hint"),
    post_off_topic: l.post_off_topic === true,
  };
}

async function clientName(workspaceId: string): Promise<string | null> {
  const rows = (await sql.query("select b.name from workspaces w join brands b on b.id = w.client_brand_id where w.id = $1", [workspaceId])) as { name: string }[];
  return rows[0]?.name ?? null;
}

/** Label counts per workspace for the Data page and the cron response. */
export async function labelStatus(workspaceId: string): Promise<{ comments: number; labelled: number; off_topic: number; failed: number; failed_final: number; subject_replies: number; posts_earned: number; stances: number }> {
  const rows = (await sql.query(
    `select (select count(*) from comments where workspace_id = $1)::int as comments,
            (select count(*) from comments where workspace_id = $1 and sentiment is not null)::int as labelled,
            (select count(*) from comments where workspace_id = $1 and off_topic)::int as off_topic,
            (select count(*) from comments where workspace_id = $1 and sentiment_source = 'model_failed')::int as failed,
            (select count(*) from comments where workspace_id = $1 and sentiment_source = 'model_failed_final')::int as failed_final,
            (select count(*) from comments where workspace_id = $1 and sentiment_source = 'subject')::int as subject_replies,
            (select count(*) from posts where workspace_id = $1 and source = 'earned' and content_type is distinct from 'stub')::int as posts_earned,
            (select count(*) from posts where workspace_id = $1 and stance is not null)::int as stances`,
    [workspaceId],
  )) as { comments: number; labelled: number; off_topic: number; failed: number; failed_final: number; subject_replies: number; posts_earned: number; stances: number }[];
  return rows[0];
}
