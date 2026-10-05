/**
 * The Social Media deck slide library (DECISIONS, 3 Oct 2026): pure, so the deck form and
 * the spec can use it without the deck builder. Drawn in src/social/deck.ts.
 */
export type SocialSlide = "summary" | "accounts" | "formats" | "best" | "competitors" | "community";
export const SOCIAL_SLIDES: { kind: SocialSlide; title: string; description: string }[] = [
  { kind: "summary", title: "Content summary", description: "The headline numbers against the period before, and what worked, what did not, what to post next." },
  { kind: "accounts", title: "Accounts", description: "Each own account: posts, typical post, views, engagement rate, comments, replies." },
  { kind: "formats", title: "Formats and timing", description: "Which formats earn more than their share, and which days and times work." },
  { kind: "best", title: "Best and weakest posts", description: "Against each account's usual: what to repeat and what to learn from." },
  { kind: "competitors", title: "Competitors' own channels", description: "Every brand's own accounts on the same measures, with their best post." },
  { kind: "community", title: "Community", description: "What people say under the posts, by topic, and the comments liked most." },
];
export const SOCIAL_SLIDE_KINDS = SOCIAL_SLIDES.map((s) => s.kind);

/** Known kinds only, in library order, the summary always first. */
export function cleanSocialSlides(input: unknown): SocialSlide[] {
  const want = new Set(Array.isArray(input) ? input.filter((x): x is SocialSlide => SOCIAL_SLIDE_KINDS.includes(x as SocialSlide)) : []);
  want.add("summary");
  return SOCIAL_SLIDE_KINDS.filter((k) => want.has(k));
}

export type SocialSpec = { focus: string; platform: string; slides: SocialSlide[] };
