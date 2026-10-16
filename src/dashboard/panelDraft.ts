/**
 * "What do you want to see here?" on the Dashboard (Refal, 16 Oct 2026): a Builder writes what they want ("TikTok
 * affiliate performance, week on week"); CeMO turns it into one panel, a query over the whitelisted builder and a
 * chart from the fixed set (src/dashboard/panelSpec.ts). It is checked (one more try when it does not check out),
 * run over the Dashboard's own filters and shown before anyone adds it. Changing a panel is the same with the
 * panel's current spec in front of CeMO. CeMO only names the query and the chart: numbers are counted in SQL.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { Actor } from "../auth/can";
import { anthropicClient, describeModelError, toolAnswer } from "../chat/client";
import { hasModelCredentials, modelId } from "../chat/loop";
import { FILTER_SCHEMA } from "../chat/tools";
import { CREDIT_PRICES } from "../config/credits";
import { canSpend, charge } from "../credits/ledger";
import { ROLE_VIEWS } from "../definitions/catalog";
import { dataBrief } from "../decks/slideDraft";
import { by, signal } from "../learning/signals";
import { COMMENT_GROUP_BY, COMMENT_METRICS, GROUP_BY, METRICS } from "../query/builder";
import type { RoleId } from "../roles/model";
import { CHARTS, validatePanel, type PanelSpec } from "./panelSpec";
import { runPanel, type PanelData, type PanelScope } from "./panels";

const TOOL: Anthropic.Tool = {
  name: "draft_panel",
  description: "One Dashboard panel: what to count, how to group it, which rows count, the chart, and how far back it looks.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "the panel's title, plain, up to 60 characters (\"TikTok affiliates, week on week\")" },
      description: { type: "string", description: "one line: what the panel shows" },
      chart: { type: "string", enum: [...CHARTS], description: "line: over time; stacked: over time split by one more group; bar: a ranking or a comparison; share: one whole split in parts; number: one figure; table: detail" },
      width: { type: "string", enum: ["full", "half"], description: "half for a number, a share or a short ranking; full for anything over time or a table" },
      span: {
        type: "object",
        properties: { n: { type: "integer" }, unit: { type: "string", enum: ["day", "week", "month"] } },
        required: ["n", "unit"],
        additionalProperties: false,
        description: "only for a panel over time: how many days (up to 120), weeks (up to 52) or months (up to 24) back from the Dashboard's last day; leave out to use the Dashboard's period",
      },
      query: {
        type: "object",
        properties: {
          entity: { type: "string", enum: ["posts", "comments"], description: "posts: the posts themselves (views, creators, carts); comments: what people say under them" },
          metrics: { type: "array", items: { type: "string", enum: [...new Set([...METRICS, ...COMMENT_METRICS])] }, description: "one to four" },
          group_by: { type: "array", items: { type: "string", enum: [...new Set([...GROUP_BY, ...COMMENT_GROUP_BY])] }, description: "at most two: the time first for a panel over time" },
          filters: FILTER_SCHEMA,
          order_by: { type: "string", description: "a metric or a group, with asc or desc (over time: the time asc)" },
          limit: { type: "integer" },
          change: { type: "boolean", description: "over time only: each period's change from the one before (week on week, month on month)" },
        },
        required: ["entity", "metrics"],
        additionalProperties: false,
      },
    },
    required: ["title", "description", "chart", "width", "query"],
    additionalProperties: false,
  },
};

const SYSTEM = [
  "You turn what a person wants on their team's Dashboard into one panel over the team's social listening data. Call draft_panel once.",
  "The Dashboard's period, platform and brands apply to every panel on their own: set a brand or platform filter only when the ask fixes it (\"TikTok affiliates\": platform tiktok and has_cart true). Never set date filters.",
  "Over time: group by day, week or month (in that place first), order by it ascending, chart line (or stacked when they split it by one more group), and give a span (for example 12 weeks, 6 months, 30 days). Week on week or month on month: set change true.",
  "A ranking: chart bar, ordered by the metric, limit 10 to 15. One whole split in parts (sentiment, platform, creator tier): chart share. One figure: chart number with no group_by. Detail: table.",
  "Comments for what people say; posts for the posts, views, creators and carts. Pick metrics that answer the ask and nothing else.",
].join("\n");

const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 36) || "panel";

export type PanelDraft = { spec: PanelSpec; preview: PanelData };

export async function draftPanel(ws: string, role: RoleId, text: string, actor: Actor, o: { scope: PanelScope; current?: PanelSpec | null }): Promise<{ ok: true; draft: PanelDraft } | { ok: false; error: string }> {
  const ask = text.trim().slice(0, 500);
  if (ask.length < 6) return { ok: false, error: "Say in a sentence what the panel should show." };
  if (!hasModelCredentials()) return { ok: false, error: "CeMO is not available on this server." };
  const spend = await canSpend(ws, CREDIT_PRICES.creation);
  if (!spend.ok) return { ok: false, error: spend.message };
  const client = anthropicClient({ workspace: ws, purpose: "panel_draft" });
  const call = (req: Anthropic.MessageCreateParamsNonStreaming) => client.messages.create(req);
  const asked = o.current
    ? `The panel as it is now: ${JSON.stringify({ title: o.current.title, chart: o.current.chart, width: o.current.width, span: o.current.span, query: o.current.query })}\n\nChange it as they ask, keeping what they do not mention: ${ask}`
    : `The panel they want: ${ask}`;
  let messages: Anthropic.MessageParam[] = [{ role: "user", content: `${await dataBrief(ws)}\nThe Dashboard now shows ${o.scope.from} to ${o.scope.to}${o.scope.platform !== "all" ? `, ${o.scope.platform}` : ""}${o.scope.brands.length ? `, brands ${o.scope.brands.join(", ")}` : ""}.\n\n${asked}` }];
  let spec: PanelSpec | null = null;
  let errors: string[] = [];
  try {
    for (let attempt = 0; attempt < 2 && !spec; attempt++) {
      const { use, messages: sent, res } = await toolAnswer(call, { model: modelId(), max_tokens: 4000, system: SYSTEM, tools: [TOOL], messages }, TOOL.name);
      const d = (use?.input ?? {}) as Partial<PanelSpec>;
      const title = String(d.title ?? "").trim().slice(0, 60) || ask.slice(0, 60);
      const p: PanelSpec = {
        key: o.current?.key ?? `pn-${slug(title)}-${Math.random().toString(36).slice(2, 6)}`,
        title,
        description: String(d.description ?? ask).trim().slice(0, 240) || ask.slice(0, 240),
        chart: d.chart as PanelSpec["chart"],
        width: d.width === "half" ? "half" : "full",
        query: { ...(d.query ?? { entity: "posts", metrics: ["count_posts"] }), limit: Math.min(200, Number(d.query?.limit ?? 50) || 50) },
        ...(d.span ? { span: d.span } : {}),
      };
      errors = validatePanel(p);
      if (!errors.length) { spec = p; break; }
      if (!use) break;
      messages = [...sent, { role: "assistant", content: res.content }, { role: "user", content: [{ type: "tool_result", tool_use_id: use.id, content: `That does not check out: ${errors.join(" ")} Call draft_panel again, fixed.`, is_error: true }] }];
    }
  } catch (e) {
    return { ok: false, error: `CeMO could not draft it: ${describeModelError(e).slice(0, 200)}` };
  }
  if (!spec) return { ok: false, error: `CeMO's draft did not check out: ${errors.join(" ") || "no draft came back"}` };
  const preview = await runPanel(spec, ws, o.scope, { views: ROLE_VIEWS[role] });
  await charge({ ws, email: actor.email, staff: actor.staff.length > 0, kind: "creation", credits: CREDIT_PRICES.creation, ref: spec.key, note: `Dashboard panel: ${spec.title}` });
  await signal(by(actor, ws, role), "dashboard.panel_drafted", { chart: spec.chart, status: preview.status, change: !!spec.query.change });
  if (preview.status === "error") return { ok: false, error: `The draft did not run: ${preview.message ?? "unknown error"}` };
  return { ok: true, draft: { spec, preview } };
}
