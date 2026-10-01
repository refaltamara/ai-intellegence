/**
 * Caption reading (DECISIONS, 2 Oct 2026): what a post is about, read from its
 * caption by the model, so a deck can say "Wardah launched the Colorfit Skintint
 * on 24 Jun" or "Luxcrime pushed Liquid Blush through the blush-blindness look"
 * without a person reading the posts. Pure: the prompt, the tool and the answer
 * check. The runner (./run.ts) feeds batches through here.
 *
 * The model only names and classifies; it never counts. Every number on a slide
 * is still a count of posts, creators and views in SQL over these tags.
 */
import type Anthropic from "@anthropic-ai/sdk";

/** What the post is part of. "none" when it is an ordinary post. */
export const EVENTS = ["launch", "relaunch", "sale_event", "collab", "giveaway", "offline_event", "seasonal", "challenge", "none"] as const;
/** The offer in the caption, if any. */
export const OFFERS = ["discount", "bundle", "free_gift", "voucher", "flash_sale", "live_shopping", "cashback", "giveaway", "none"] as const;
/** What the post does to hold attention. */
export const HOOKS = ["review", "tutorial", "routine", "transformation", "comparison", "problem_solution", "haul_unboxing", "trend", "reply", "hard_sell", "lifestyle", "other"] as const;

export type EventType = (typeof EVENTS)[number];
export type Offer = (typeof OFFERS)[number];
export type Hook = (typeof HOOKS)[number];

export const EVENT_NAME: Record<EventType, string> = {
  launch: "Launch", relaunch: "Relaunch", sale_event: "Sale event", collab: "Collab", giveaway: "Giveaway",
  offline_event: "Offline event", seasonal: "Seasonal", challenge: "Challenge", none: "None",
};
export const OFFER_NAME: Record<Offer, string> = {
  discount: "discount", bundle: "bundle", free_gift: "free gift", voucher: "voucher", flash_sale: "flash sale",
  live_shopping: "live shopping", cashback: "cashback", giveaway: "giveaway", none: "none",
};
export const HOOK_NAME: Record<Hook, string> = {
  review: "review", tutorial: "tutorial", routine: "routine / GRWM", transformation: "before / after", comparison: "comparison",
  problem_solution: "problem → solution", haul_unboxing: "haul / unboxing", trend: "trend / POV", reply: "reply to a comment",
  hard_sell: "hard sell", lifestyle: "lifestyle", other: "other",
};

export type PostForReading = {
  /** the batch's own short id ("p1"), mapped back to (platform, url) by the runner */
  ref: string;
  platform: string;
  url: string;
  brands: string[];
  source: string;
  handle: string | null;
  format: string | null;
  cart_product: string | null;
  caption: string;
};

export type CaptionTags = {
  ref: string;
  product: string | null;
  event: EventType;
  event_name: string | null;
  offer: Offer;
  hook: Hook;
  angle: string | null;
};

const CAPTION_MAX = 600;

export const READ_CAPTIONS_TOOL: Anthropic.Tool = {
  name: "read_captions",
  description: "Return what each post is about, one entry per post ref.",
  input_schema: {
    type: "object",
    properties: {
      posts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            ref: { type: "string" },
            product: { type: ["string", "null"], description: "The product the post is about, without the brand name, as the line is known (\"Colorfit Skintint\", \"Liquid Blush\", \"Serum PDRN\"). Null when no specific product." },
            event: { type: "string", enum: [...EVENTS] },
            event_name: { type: ["string", "null"], description: "Short, recognisable name of the campaign or event (\"Colorfit Skintint launch\", \"9.9 sale\", \"For You Beauty Festival\", \"makeup class Blitar\"). Null when event is none." },
            offer: { type: "string", enum: [...OFFERS] },
            hook: { type: "string", enum: [...HOOKS] },
            angle: { type: ["string", "null"], description: "The post's specific idea in at most six English words (\"PDRN Korean skincare trend\", \"cheap full makeup bundle\", \"skintint launch reveal\"). Null when the caption says nothing beyond tags." },
          },
          required: ["ref", "product", "event", "event_name", "offer", "hook", "angle"],
        },
      },
    },
    required: ["posts"],
  },
};

export function captionSystem(): string {
  return `You read social media captions about Indonesian beauty brands (TikTok and Instagram; captions mix Bahasa Indonesia, English and hashtags) and say what each post is about, so a marketing team can see which products, campaigns, offers and angles brands are running. You never count or estimate numbers.

For each post:
- product: the product it is about, without the brand name, in the name the line is sold under, Title Case, at most four words. Use the cart product or hashtags when the caption is thin ("#G2GLipSerum" → "Lip Serum"). Null if the post is not about one product (a full routine, a brand-wide promo).
- event: launch (a new product or shade, "new", "finally", "launching"), relaunch (new formula or packaging of a known product), sale_event (double dates like 9.9, payday, mega sale, brand day, live sale), collab (with a celebrity, artist, character or another brand), giveaway, offline_event (class, workshop, store or mall event, pop-up), seasonal (Ramadan, Lebaran, back to school, holidays), challenge (a branded hashtag challenge or UGC campaign creators join), or none.
- event_name: a short name another post about the same event would share ("Colorfit Skintint launch", "9.9 sale", "Ramadan collection"). Use the brand's campaign hashtag when there is one, made readable. Null when event is none.
- offer: the strongest offer named (discount, bundle, free_gift, voucher, flash_sale, live_shopping, cashback, giveaway) or none.
- hook: what the post does to hold attention: review, tutorial, routine (GRWM, daily routine), transformation (before/after, results), comparison, problem_solution (acne, dull skin → the product), haul_unboxing, trend (POV, meme, sound, challenge), reply (answers a comment, "Membalas @…"), hard_sell (price and buy now), lifestyle, other.
- angle: the specific idea in at most six English words, concrete enough to brief a creator ("blush blindness look", "PDRN Korean skincare trend", "full makeup under 450K"). Null when the caption is only tags.

Judge from the caption, the hashtags and the cart product only. When unsure, prefer none / null over a guess. Answer for every ref through the tool.`;
}

function clean(caption: string): string {
  return caption
    .replace(/\\u[0-9a-fA-F]{4}/g, " ") // escaped emoji pairs that came through the export as text
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CAPTION_MAX);
}

export function captionBatchPrompt(rows: PostForReading[]): string {
  return rows
    .map((r) => [
      `ref=${r.ref} · ${r.platform} · ${r.source === "owned" ? "brand account" : r.handle ? `creator @${r.handle}` : "creator"} · brand: ${r.brands.join(", ")}${r.format && r.format !== "other" ? ` · format: ${r.format}` : ""}${r.cart_product ? ` · cart: ${r.cart_product}` : ""}`,
      `caption: ${clean(r.caption)}`,
    ].join("\n"))
    .join("\n\n");
}

const short = (v: unknown, words: number, chars: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").replace(/^["'“”]+|["'“”.]+$/g, "").trim();
  if (!t || /^(none|null|n\/a|-)$/i.test(t)) return null;
  return t.split(" ").slice(0, words).join(" ").slice(0, chars);
};

/** Check the model's answer: known refs, known classes, short names. Refs it left out come back as missing. */
export function parseTags(input: unknown, refs: string[]): { tags: CaptionTags[]; missing: string[] } {
  const want = new Set(refs);
  const got = new Map<string, CaptionTags>();
  const list = (input as { posts?: unknown })?.posts;
  for (const x of Array.isArray(list) ? list : []) {
    const o = (x ?? {}) as Record<string, unknown>;
    const ref = String(o.ref ?? "");
    if (!want.has(ref) || got.has(ref)) continue;
    const event = (EVENTS as readonly string[]).includes(String(o.event)) ? (o.event as EventType) : "none";
    got.set(ref, {
      ref,
      product: short(o.product, 4, 60),
      event,
      event_name: event === "none" ? null : short(o.event_name, 6, 60),
      offer: (OFFERS as readonly string[]).includes(String(o.offer)) ? (o.offer as Offer) : "none",
      hook: (HOOKS as readonly string[]).includes(String(o.hook)) ? (o.hook as Hook) : "other",
      angle: short(o.angle, 6, 60),
    });
  }
  return { tags: [...got.values()], missing: refs.filter((r) => !got.has(r)) };
}
