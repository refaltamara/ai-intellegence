/**
 * The PR deck slide library (DECISIONS, 3 Oct 2026): pure, so the deck form and the
 * spec can use it without the deck builder. Drawn in src/reputation/deck.ts.
 */
export type RepSlide = "summary" | "timeline" | "issues" | "issue_detail" | "narratives" | "competitive" | "voices" | "service";
export const REP_SLIDES: { kind: RepSlide; title: string; description: string }[] = [
  { kind: "summary", title: "Reputation summary", description: "Status, the headline numbers against the period before, and what happened, what it means, what to do next." },
  { kind: "timeline", title: "Status, day by day", description: "The status ladder and the negative share for every day up to the period's end." },
  { kind: "issues", title: "Issues building", description: "The topics carrying the negative talk, and whether each is ours alone or the whole category's." },
  { kind: "issue_detail", title: "Issue deep-dives", description: "One slide per issue: how it moved day by day, where, the posts and the words." },
  { kind: "narratives", title: "Narratives", description: "What people say, by topic: share of the conversation, how it leans, in their words." },
  { kind: "competitive", title: "Competitive reputation", description: "Every brand on share of voice, negative share, CSAT and purchase intent." },
  { kind: "voices", title: "Amplifiers and own channels", description: "Who carried the conversation, and how our own posts were received." },
  { kind: "service", title: "For customer service", description: "Service complaints to hand over, in the customers' words." },
];
export const REP_SLIDE_KINDS = REP_SLIDES.map((s) => s.kind);

/** Known kinds only, in library order, the summary always first. */
export function cleanRepSlides(input: unknown): RepSlide[] {
  const want = new Set(Array.isArray(input) ? input.filter((x): x is RepSlide => REP_SLIDE_KINDS.includes(x as RepSlide)) : []);
  want.add("summary");
  return REP_SLIDE_KINDS.filter((k) => want.has(k));
}

export type RepSpec = { focus: string; platform: string; slides: RepSlide[] };
