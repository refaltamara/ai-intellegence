/**
 * Fair's first recipes, seeded into the recipes table (`pnpm recipe seed`). A role offers
 * a recipe only when its version lists it (`recipes` in the role spec); Chorus 1.1 is the
 * first to (CMS plan, phase 3).
 */
import type { RecipeSpec } from "./spec";

export const FAIR_RECIPES: RecipeSpec[] = [
  {
    key: "complaints-by-topic",
    title: "Complaints by topic",
    description: "Negative comments about a brand, by topic: how many, under how many posts, from how many people.",
    activity: "Counting complaints about {{brand}} by topic",
    examples: ["What are people complaining about most?", "Which topics carry GoPay's negative comments this month?"],
    roles: ["pr", "social"],
    query: { entity: "comments", filters: { sentiment: ["negative"] }, group_by: ["topic"], metrics: ["count_comments", "count_posts", "count_commenters"], order_by: "count_comments desc", limit: 20 },
    params: ["brand", "window", "platform"],
    present: "ranked",
    caveat: "Topics come with the listening data; a large \"Others\" means the taxonomy is missing a theme.",
  },
  {
    key: "sentiment-by-brand",
    title: "Sentiment by brand",
    description: "Every tracked brand side by side: comments, negative and positive share, and net sentiment.",
    activity: "Comparing what people say about each brand",
    examples: ["How does our sentiment compare with the competitors'?", "Which brand has the most negative comments?"],
    roles: ["pr", "brand_kol"],
    query: { entity: "comments", group_by: ["brand_id"], metrics: ["count_comments", "negative_pct", "positive_pct", "net_sentiment"], order_by: "count_comments desc", limit: 20 },
    params: ["window", "platform", "topic"],
    present: "table",
  },
  {
    key: "negative-by-day",
    title: "Negative share by day",
    description: "Comments about a brand day by day with the share that is negative: when a complaint started and how it moved.",
    activity: "Reading {{brand}}'s comments day by day",
    examples: ["When did the negative comments start?", "Show the negative share by day for the last two weeks"],
    roles: ["pr"],
    query: { entity: "comments", group_by: ["day"], metrics: ["count_comments", "negative_pct"], order_by: "day asc", limit: 120 },
    params: ["brand", "window", "platform", "topic"],
    present: "chart",
  },
  {
    key: "own-posts-by-week",
    title: "Own posts by week",
    description: "A brand's own posts week by week: how many, the engagement they drew and the views where reported.",
    activity: "Counting {{brand}}'s own posts by week",
    examples: ["How has our posting changed week by week?", "Did engagement on our own posts go up this month?"],
    roles: ["social"],
    query: { entity: "posts", filters: { source: "owned" }, group_by: ["week"], metrics: ["count_posts", "sum_engagements", "sum_views"], order_by: "week asc", limit: 60 },
    params: ["brand", "window", "platform"],
    present: "chart",
    caveat: "Views are only reported on video; photos and carousels count engagement only.",
  },
];
