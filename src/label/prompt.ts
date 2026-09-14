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
export type Sentiment = (typeof SENTIMENTS)[number];

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

export type Label = { id: string; sentiment: Sentiment; confidence: number };

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
            sentiment: { type: "string", enum: [...SENTIMENTS] },
            confidence: { type: "number", description: "0 to 1" },
          },
          required: ["id", "sentiment"],
        },
      },
    },
    required: ["labels"],
  },
};

export const LABEL_POSTS_TOOL: Anthropic.Tool = { ...LABEL_COMMENTS_TOOL, name: "label_posts", description: "Return one stance label per post id." };

export function commentSystem(subject: string): string {
  return [
    `You label social media comments about ${subject}, an Indonesian public figure, for ${subject}'s own team. Comments mix Indonesian, English, slang, and sarcasm.`,
    "",
    "Label what each comment says about the subject, not the commenter's mood:",
    `- positive: supports, defends, praises, thanks, or expresses warmth toward ${subject}; pushes back on people attacking them.`,
    `- negative: criticises, mocks, attacks, or expresses disappointment or anger at ${subject}; agrees with a post that attacks them; sarcasm aimed at them.`,
    "- neutral: questions, factual remarks, off-topic chatter, spam, tags, or comments whose target is unclear. Anger at the government, the news, or the platform is neutral unless it blames the subject.",
    "",
    `Under posts by other accounts about ${subject}, judge the comment by its view of ${subject}, not of the post's author.`,
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

export function stanceSystem(subject: string): string {
  return [
    `You label social media posts by other accounts that mention ${subject}, an Indonesian public figure, for ${subject}'s own team. Posts mix Indonesian, English, slang and sarcasm.`,
    "",
    `Label the post's stance toward ${subject}:`,
    `- positive: supports, defends, praises, or sympathises with ${subject}.`,
    `- negative: criticises, mocks, attacks, or calls for consequences against ${subject}; sarcasm aimed at them.`,
    "- neutral: reports news or quotes without taking a side, asks a question, or is about something else.",
    "",
    "Label every post listed; use the exact ids given. Confidence is 0 to 1 for how sure you are.",
  ].join("\n");
}

export function stanceBatchPrompt(posts: PostForLabel[]): string {
  const lines = posts.map((p) => `[${p.id}] ${p.platform} @${p.handle ?? "unknown"}: ${clip(p.caption, CAPTION_MAX)}`);
  return `${lines.join("\n\n")}\n\nLabel all ${posts.length} posts with label_posts.`;
}

/** Keep only well-formed labels for ids we asked about; one per id. */
export function parseLabels(input: unknown, wanted: Iterable<string>): { labels: Label[]; missing: string[] } {
  const ids = new Set(wanted);
  const out = new Map<string, Label>();
  const raw = (input as { labels?: unknown })?.labels;
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const { id, sentiment, confidence } = item as { id?: unknown; sentiment?: unknown; confidence?: unknown };
      const sid = String(id ?? "");
      const s = String(sentiment ?? "").toLowerCase() as Sentiment;
      if (!ids.has(sid) || !SENTIMENTS.includes(s) || out.has(sid)) continue;
      const c = typeof confidence === "number" && Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.5;
      out.set(sid, { id: sid, sentiment: s, confidence: Math.round(c * 100) / 100 });
    }
  }
  const missing = [...ids].filter((i) => !out.has(i));
  return { labels: [...out.values()], missing };
}
