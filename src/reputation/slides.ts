/**
 * The PR deck slide library (DECISIONS, 3 Oct 2026): pure, so the deck form and the
 * spec can use it without the deck builder. Drawn in src/reputation/deck.ts.
 */
export type RepSlide = "summary" | "timeline" | "chronology" | "pace" | "motion" | "issues" | "issue_detail" | "exposure" | "narratives" | "anger" | "moving" | "competitive" | "voices" | "service";
export const REP_SLIDES: { kind: RepSlide; title: string; description: string }[] = [
  { kind: "summary", title: "Reputation summary", description: "Status, the headline numbers against the period before, and what happened, what it means, what to do next." },
  { kind: "timeline", title: "Status, day by day", description: "The status ladder and the negative share for every day up to the period's end." },
  { kind: "chronology", title: "How it spread (chronology)", description: "The case in dated steps: the first posts, the first boycott calls, when partner brands were named, our own posts, who took over, the busiest hour." },
  { kind: "pace", title: "Posts and comments per hour", description: "How fast it moved: posts and comments per hour (per day for longer periods), and how much of it was negative." },
  { kind: "motion", title: "Who is talking, over time", description: "Each side's posts and comments per hour (Malaysian, Indonesian, …) and how negative each was." },
  { kind: "issues", title: "Issues building", description: "The topics carrying the negative talk, and whether each is ours alone or the whole category's." },
  { kind: "issue_detail", title: "Issue deep-dives", description: "One slide per issue: how it moved day by day, where, the posts and the words." },
  { kind: "exposure", title: "Sister brands and boycott calls", description: "The partner brands named beside us, and the calls to boycott, in posts and comments." },
  { kind: "narratives", title: "Narratives", description: "What people say, by topic: share of the conversation, how it leans, in their words." },
  { kind: "anger", title: "Where the anger is", description: "Comments under our own posts against comments everywhere else, and how each of our posts was received." },
  { kind: "moving", title: "Most commented posts, still moving", description: "The posts that drew the most comments, and how many they still took in the last 24 and 6 hours." },
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
