/**
 * Reads captions in category workspaces (DECISIONS, 2 Oct 2026), in batches,
 * within a time budget. Runs on Vercel via /api/cron/captions, only where the
 * workspace switched it on (`settings.captions.enabled`); the sandbox never
 * calls the model.
 *
 * Which posts: those that matter to a deck: views at or over the workspace's
 * floor (`settings.captions.min_views`, 10K by default) or posted by a brand
 * account, newest first. One read per url: an Instagram post tagging two brands
 * is read once and the tags go on both rows. Same retry rule as the sentiment
 * labeller: a post a batch came back without is tried once more when nothing
 * new is waiting, then left alone.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { anthropicClient } from "../chat/client";
import { modelId } from "../chat/loop";
import { sql } from "../db/client";
import { toJson } from "../db/json";
import { captionBatchPrompt, captionSystem, parseTags, READ_CAPTIONS_TOOL, type PostForReading } from "./prompt";

export type CaptionSettings = { enabled: boolean; min_views: number };
export const CAPTION_DEFAULTS: CaptionSettings = { enabled: false, min_views: 10_000 };

export type CaptionOutcome = {
  workspace: string;
  read: number;
  failed: number;
  retried: number;
  remaining: number;
  calls: number;
  calls_failed: number;
  duration_ms: number;
  stopped: "done" | "budget" | "error" | "off";
  error?: string;
};

export type CaptionOptions = { budgetMs?: number; batchSize?: number; parallel?: number; client?: Anthropic };

const DEFAULT_BUDGET_MS = 240_000;
const DEFAULT_BATCH = 40;
const DEFAULT_PARALLEL = 8;

/** The model that reads captions: its own setting when there is one, else the chat model. */
export const captionModel = () => process.env.ANTHROPIC_MODEL_CAPTIONS || modelId();

export async function captionSettings(workspaceId: string): Promise<CaptionSettings & { kind: string }> {
  const r = (await sql.query("select kind, settings->'captions' as c from workspaces where id = $1", [workspaceId])) as { kind: string; c: Partial<CaptionSettings> | null }[];
  const c = r[0]?.c ?? {};
  return { kind: r[0]?.kind ?? "category", enabled: c.enabled === true, min_views: Number.isFinite(Number(c.min_views)) && Number(c.min_views) >= 0 ? Number(c.min_views) : CAPTION_DEFAULTS.min_views };
}

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

/** The posts worth reading in a workspace ($1), with the views floor ($2); `a` is the table alias. */
const scope = (a: string) => `${a}.workspace_id = $1 and ${a}.caption is not null and length(btrim(${a}.caption)) >= 8 and ${a}.content_type is distinct from 'stub' and (${a}.views >= $2 or ${a}.source = 'owned')`;

/** The next posts to read, one per url: new ones first, the once-failed only when nothing new is waiting. */
async function nextPosts(workspaceId: string, minViews: number, limit: number): Promise<{ rows: Omit<PostForReading, "ref">[]; retry: boolean }> {
  const pick = (where: string) =>
    `select p.platform, p.url, array_agg(distinct b.name order by b.name) as brands, max(p.source) as source, max(p.creator_handle) as handle,
            max(p.content_format) as format, max(p.product_name) as cart_product, (array_agg(p.caption order by length(p.caption) desc))[1] as caption
     from posts p left join brands b on b.id = p.brand_id and b.workspace_id = p.workspace_id
     where ${scope("p")} and ${where}
     group by p.platform, p.url
     order by max(p.posted_at) desc, max(p.views) desc nulls last
     limit $3`;
  const fresh = (await sql.query(pick("p.cap_source is null"), [workspaceId, minViews, limit])) as Omit<PostForReading, "ref">[];
  if (fresh.length) return { rows: fresh, retry: false };
  return { rows: (await sql.query(pick("p.cap_source = 'model_failed'"), [workspaceId, minViews, limit])) as Omit<PostForReading, "ref">[], retry: true };
}

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

export async function readCaptions(workspaceId: string, opts: CaptionOptions = {}): Promise<CaptionOutcome> {
  const started = Date.now();
  const out: CaptionOutcome = { workspace: workspaceId, read: 0, failed: 0, retried: 0, remaining: 0, calls: 0, calls_failed: 0, duration_ms: 0, stopped: "done" };
  const s = await captionSettings(workspaceId);
  if (s.kind === "profile" || !s.enabled) return { ...out, stopped: "off", duration_ms: Date.now() - started };
  const budget = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  const batch = opts.batchSize ?? DEFAULT_BATCH;
  const parallel = Math.max(1, opts.parallel ?? DEFAULT_PARALLEL);
  const client = opts.client ?? anthropicClient();
  const inBudget = () => Date.now() - started < budget;
  let lastError: string | undefined;

  try {
    while (inBudget()) {
      const { rows, retry } = await nextPosts(workspaceId, s.min_views, batch * parallel);
      if (!rows.length) break;
      const batches = chunk(rows.map((r, i) => ({ ...r, ref: `p${i + 1}` })), batch);
      const results = await Promise.all(batches.map(async (b) => {
        try {
          const res = await callModel(client, {
            model: captionModel(),
            max_tokens: 6000,
            output_config: { effort: "low" },
            system: [{ type: "text", text: captionSystem(), cache_control: { type: "ephemeral" } }],
            tools: [READ_CAPTIONS_TOOL],
            tool_choice: { type: "tool", name: READ_CAPTIONS_TOOL.name },
            messages: [{ role: "user", content: captionBatchPrompt(b) }],
          });
          const use = res.content.find((x): x is Anthropic.ToolUseBlock => x.type === "tool_use");
          const { tags, missing } = parseTags(use?.input, b.map((r) => r.ref));
          const byRef = new Map(b.map((r) => [r.ref, r]));
          return { tags: tags.map((t) => ({ ...t, platform: byRef.get(t.ref)!.platform, url: byRef.get(t.ref)!.url })), missing: missing.map((ref) => byRef.get(ref)!), failed: false };
        } catch (e) {
          out.calls_failed += 1;
          lastError = (e as Error).message?.slice(0, 300);
          return { tags: [], missing: [], failed: true };
        }
      }));
      out.calls += batches.length;
      // a round where every call failed is a stalled API, not bad captions: stop and let the next tick retry
      if (results.every((r) => r.failed)) { out.stopped = "error"; out.error = lastError; break; }
      const tags = results.flatMap((r) => r.tags);
      const missing = results.flatMap((r) => r.missing);
      if (tags.length) {
        await sql.query(
          `update posts p set cap_product = l.product, cap_event = l.event, cap_event_name = l.event_name, cap_offer = l.offer, cap_hook = l.hook, cap_angle = l.angle,
                  cap_source = 'model', cap_read_at = now()
           from jsonb_to_recordset($1::jsonb) as l(platform text, url text, product text, event text, event_name text, offer text, hook text, angle text)
           where p.workspace_id = $2 and p.platform = l.platform and p.url = l.url`,
          [toJson(tags.map(({ ref: _r, ...t }) => t)), workspaceId],
        );
        out.read += tags.length;
      }
      if (missing.length) {
        await sql.query(
          `update posts p set cap_source = $3, cap_read_at = now()
           from jsonb_to_recordset($2::jsonb) as l(platform text, url text) where p.workspace_id = $1 and p.platform = l.platform and p.url = l.url`,
          [workspaceId, toJson(missing.map((m) => ({ platform: m.platform, url: m.url }))), retry ? "model_failed_final" : "model_failed"],
        );
        out.failed += missing.length;
      }
      if (retry) out.retried += rows.length;
    }
  } catch (e) {
    out.stopped = "error";
    out.error = (e as Error).message;
  }
  out.remaining = await remainingCaptions(workspaceId, s.min_views);
  if (out.stopped === "done" && out.remaining) out.stopped = "budget";
  out.duration_ms = Date.now() - started;
  if (out.calls > 0 || out.error) {
    await sql.query(
      `insert into data_loads (workspace_id, file, platform, kind, rows_in, rows_loaded, rows_rejected, report, finished_at)
       values ($1, $2, null, 'captions', $3, $4, $5, $6::jsonb, now())`,
      [workspaceId, `caption reading ${out.stopped === "error" ? "(stopped on error)" : out.stopped === "budget" ? "(more to do)" : "(complete)"}`, out.read + out.failed, out.read, out.failed, toJson(out)],
    ).catch(() => undefined);
  }
  return out;
}

/** Posts (by url) still waiting to be read. */
export async function remainingCaptions(workspaceId: string, minViews: number): Promise<number> {
  const r = (await sql.query(
    `select count(distinct (p.platform, p.url))::int as n from posts p where ${scope("p")} and coalesce(p.cap_source, '') in ('', 'model_failed')`,
    [workspaceId, minViews],
  )) as { n: number }[];
  return r[0]?.n ?? 0;
}

/** What the Data page shows: whether reading is on, how far it got. Counts are posts (by url). */
export async function captionStatus(workspaceId: string): Promise<CaptionSettings & { read: number; remaining: number; failed: number }> {
  const s = await captionSettings(workspaceId);
  const r = (await sql.query(
    `select count(distinct (platform, url)) filter (where cap_source = 'model')::int as read,
            count(distinct (platform, url)) filter (where cap_source = 'model_failed_final')::int as failed
     from posts where workspace_id = $1 and cap_source is not null`,
    [workspaceId],
  )) as { read: number; failed: number }[];
  return { enabled: s.enabled, min_views: s.min_views, read: r[0]?.read ?? 0, failed: r[0]?.failed ?? 0, remaining: await remainingCaptions(workspaceId, s.min_views) };
}
