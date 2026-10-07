/**
 * Sentiment and stance labelling for profile workspaces (DECISIONS "Sentiment
 * labels"): pure prompt building and answer validation, no I/O. The runner in
 * ./run.ts feeds batches through here; /api/cron/label drives the runner.
 *
 * Three classes only. Comments carry `sentiment` (what the comment says about the
 * subject); earned posts carry `stance` (what the post says about the subject).
 * The subject's own posts and replies are never labelled.
 */
import type Anthropic from "@anthropic-ai/sdk";

export const SENTIMENTS = ["positive", "neutral", "negative"] as const;
/** what the model may answer for a comment: the three classes plus "not about the subject at all" */
export const COMMENT_CLASSES = [...SENTIMENTS, "off_topic"] as const;
export type Sentiment = (typeof SENTIMENTS)[number];
export type CommentClass = (typeof COMMENT_CLASSES)[number];

export type CommentForLabel = {
  id: string;
  text: string;
  platform: string;
  likes: number | null;
  post_url: string;
  post_caption: string | null;
  post_source: "owned" | "earned";
  post_handle: string | null;
};

export type PostForLabel = { id: string; platform: string; handle: string | null; caption: string; url: string };

export type Label = { id: string; sentiment: CommentClass; confidence: number; topic?: string; voice?: string };

/** A topic the labeller may put a row under (the workspace's `topics` rows); the catch-all takes what fits nowhere else. */
export type LabelTopic = { id: string; label: string; definition: string | null; catch_all: boolean };

/**
 * What the labeller knows about a workspace (settings.label; DECISIONS 7 Oct 2026). Without it the
 * prompts are the original ones: an Indonesian public figure, Indonesian and English, sentiment only.
 */
export type LabelContext = {
  subject: string;
  /** one line on who or what the subject is ("Kahf, an Indonesian men's grooming brand ...") */
  about?: string;
  /** what happened, so the model reads replies in context; facts only, written by Fair */
  context?: string;
  /** the languages the posts and comments are in */
  languages?: string;
  topics?: LabelTopic[];
  /** the communities an author may speak as ("Malaysian", "Indonesian"); "unclear" is always allowed */
  voices?: string[];
  /** how to tell the voices apart (everyday words, flags), written by Fair for the case */
  voice_hint?: string;
  /** posts that are not about the subject or the case are set aside (relevant = false) rather than called neutral */
  post_off_topic?: boolean;
};

const ctxOf = (c: LabelContext | string): LabelContext => (typeof c === "string" ? { subject: c } : c);
const POST_CLASSES = [...SENTIMENTS, "off_topic"] as const;

/** The label tool for comments or posts, with topic and voice fields when the workspace has them. */
export function labelTool(kind: "comments" | "posts", c: LabelContext | string): Anthropic.Tool {
  const ctx = ctxOf(c);
  const base = kind === "comments" ? LABEL_COMMENTS_TOOL : LABEL_POSTS_TOOL;
  if (!ctx.topics?.length && !ctx.voices?.length && !(kind === "posts" && ctx.post_off_topic)) return base;
  const props: Record<string, unknown> = {
    id: { type: "string" },
    sentiment: { type: "string", enum: kind === "comments" ? [...COMMENT_CLASSES] : ctx.post_off_topic ? [...POST_CLASSES] : [...SENTIMENTS] },
    confidence: { type: "number", description: "0 to 1" },
  };
  const required = ["id", "sentiment"];
  if (ctx.topics?.length) { props.topic = { type: "string", enum: ctx.topics.map((t) => t.id) }; required.push("topic"); }
  if (ctx.voices?.length) { props.voice = { type: "string", enum: [...ctx.voices, "unclear"] }; required.push("voice"); }
  return { ...base, input_schema: { type: "object", properties: { labels: { type: "array", items: { type: "object", properties: props, required } } }, required: ["labels"] } };
}

/** The lines every system prompt gains from the workspace: what happened, the topics, the voices. */
function contextLines(ctx: LabelContext, what: "comment" | "post"): string[] {
  const out: string[] = [];
  if (ctx.context) out.push("", "What happened:", ctx.context);
  if (ctx.topics?.length) {
    out.push("", `Also put each ${what} under exactly one topic (use the topic id):`);
    for (const t of ctx.topics) out.push(`- ${t.id}: ${t.label}${t.definition ? `: ${t.definition}` : ""}${t.catch_all ? " (anything that fits no other topic, including off-topic)" : ""}`);
  }
  if (ctx.voices?.length) {
    out.push("", `Also say which community the author speaks as: ${ctx.voices.join(", ")}, or unclear. ${ctx.voice_hint ?? "Judge from the language, the flag or country they name, and how they refer to the countries involved."} Use unclear when you cannot tell; never guess from a name alone.`);
  }
  return out;
}

const who = (ctx: LabelContext) => ctx.about ?? `${ctx.subject}, an Indonesian public figure,`;
const langs = (ctx: LabelContext) => ctx.languages ?? "Indonesian, English, slang, and sarcasm";

const CAPTION_MAX = 700;
const TEXT_MAX = 600;

export const LABEL_COMMENTS_TOOL: Anthropic.Tool = {
  name: "label_comments",
  description: "Return one label per comment id.",
  input_schema: {
    type: "object",
    properties: {
      labels: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            sentiment: { type: "string", enum: [...COMMENT_CLASSES] },
            confidence: { type: "number", description: "0 to 1" },
          },
          required: ["id", "sentiment"],
        },
      },
    },
    required: ["labels"],
  },
};

export const LABEL_POSTS_TOOL: Anthropic.Tool = {
  name: "label_posts",
  description: "Return one stance label per post id.",
  input_schema: {
    type: "object",
    properties: {
      labels: {
        type: "array",
        items: {
          type: "object",
          properties: { id: { type: "string" }, sentiment: { type: "string", enum: [...SENTIMENTS] }, confidence: { type: "number", description: "0 to 1" } },
          required: ["id", "sentiment"],
        },
      },
    },
    required: ["labels"],
  },
};

export function commentSystem(c: LabelContext | string): string {
  const ctx = ctxOf(c);
  const subject = ctx.subject;
  return [
    ctx.about ? `You label social media comments about ${who(ctx)}, for ${subject}'s own team. Comments mix ${langs(ctx)}.` : `You label social media comments about ${subject}, an Indonesian public figure, for ${subject}'s own team. Comments mix Indonesian, English, slang, and sarcasm.`,
    "",
    "Label what each comment says about the subject, not the commenter's mood:",
    `- positive: supports, defends, praises, thanks, or expresses warmth toward ${subject}; pushes back on people attacking them.`,
    `- negative: criticises, mocks, attacks, or expresses disappointment or anger at ${subject}; agrees with a post that attacks them; sarcasm aimed at them.`,
    `- neutral: questions, factual remarks, tags, or comments that are about ${subject} or the controversy but take no side. Anger at the government, the news, or the platform is neutral unless it blames ${subject}.`,
    `- off_topic: the comment is not about ${subject} or the controversy at all. A viral post collects unrelated replies: advertising and selling, links to someone's own content, greetings, chatter between two other people, comments about a different subject entirely. These are set aside and counted separately, so use this class rather than forcing a sentiment.`,
    "",
    `Under posts by other accounts about ${subject}, judge the comment by its view of ${subject}, not of the post's author.`,
    ...contextLines(ctx, "comment"),
    "",
    "Label every comment listed; use the exact ids given. Confidence is 0 to 1 for how sure you are.",
  ].join("\n");
}

/** Clip by code point, never inside an emoji: a half surrogate pair makes the request body invalid JSON. */
export function clip(s: string | null | undefined, n: number): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim().replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
  const cps = Array.from(t);
  return cps.length > n ? cps.slice(0, n - 1).join("") + "…" : t;
}

/** One user turn for a batch: post context blocks, each followed by its comments. */
export function commentBatchPrompt(subject: string, comments: CommentForLabel[]): string {
  const byPost = new Map<string, CommentForLabel[]>();
  for (const c of comments) {
    const arr = byPost.get(c.post_url) ?? [];
    arr.push(c);
    byPost.set(c.post_url, arr);
  }
  const parts: string[] = [];
  let k = 0;
  for (const [url, cs] of byPost) {
    k += 1;
    const first = cs[0];
    const who = first.post_source === "owned" ? `${subject}'s own ${first.platform} post` : `${first.platform} post by @${first.post_handle ?? "unknown"} about ${subject}`;
    parts.push(`## Post ${k}: ${who}\nurl: ${url}\ncaption: ${clip(first.post_caption, CAPTION_MAX) || "(none)"}\n\nComments:`);
    for (const c of cs) parts.push(`[${c.id}]${c.likes ? ` (${c.likes} likes)` : ""} ${clip(c.text, TEXT_MAX)}`);
    parts.push("");
  }
  parts.push(`Label all ${comments.length} comments with label_comments.`);
  return parts.join("\n");
}

export function stanceSystem(c: LabelContext | string): string {
  const ctx = ctxOf(c);
  const subject = ctx.subject;
  return [
    ctx.about ? `You label social media posts by other accounts about ${who(ctx)}, for ${subject}'s own team. Posts mix ${langs(ctx)}.` : `You label social media posts by other accounts that mention ${subject}, an Indonesian public figure, for ${subject}'s own team. Posts mix Indonesian, English, slang and sarcasm.`,
    "",
    `Label the post's stance toward ${subject}:`,
    `- positive: supports, defends, praises, or sympathises with ${subject}.`,
    `- negative: criticises, mocks, attacks, or calls for consequences against ${subject}; sarcasm aimed at them.`,
    ctx.post_off_topic
      ? `- neutral: about ${subject} or the controversy but takes no side: reports news, quotes, asks a question.\n- off_topic: not about ${subject} or the controversy at all (another brand's promotion, an event, an unrelated personal post). These are set aside, so use this rather than neutral.`
      : "- neutral: reports news or quotes without taking a side, asks a question, or is about something else.",
    ...contextLines(ctx, "post"),
    "",
    "Label every post listed; use the exact ids given. Confidence is 0 to 1 for how sure you are.",
  ].join("\n");
}

export function stanceBatchPrompt(posts: PostForLabel[]): string {
  const lines = posts.map((p) => `[${p.id}] ${p.platform} @${p.handle ?? "unknown"}: ${clip(p.caption, CAPTION_MAX)}`);
  return `${lines.join("\n\n")}\n\nLabel all ${posts.length} posts with label_posts.`;
}

/** Keep only well-formed labels for ids we asked about; one per id. */
export function parseLabels(input: unknown, wanted: Iterable<string>, allow: readonly string[] = COMMENT_CLASSES, extra: { topics?: string[]; voices?: string[] } = {}): { labels: Label[]; missing: string[] } {
  const ids = new Set(wanted);
  const out = new Map<string, Label>();
  const raw = (input as { labels?: unknown })?.labels;
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const { id, sentiment, confidence, topic, voice } = item as { id?: unknown; sentiment?: unknown; confidence?: unknown; topic?: unknown; voice?: unknown };
      const sid = String(id ?? "");
      const s = String(sentiment ?? "").toLowerCase().replace(/[\s-]/g, "_") as Sentiment;
      if (!ids.has(sid) || !allow.includes(s) || out.has(sid)) continue;
      const c = typeof confidence === "number" && Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.5;
      const label: Label = { id: sid, sentiment: s, confidence: Math.round(c * 100) / 100 };
      // a topic or voice outside the workspace's list is dropped, not the label: sentiment still counts
      if (extra.topics?.includes(String(topic))) label.topic = String(topic);
      if (extra.voices && [...extra.voices, "unclear"].includes(String(voice))) label.voice = String(voice);
      out.set(sid, label);
    }
  }
  const missing = [...ids].filter((i) => !out.has(i));
  return { labels: [...out.values()], missing };
}
