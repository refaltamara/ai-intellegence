/**
 * What a deck is (Decks, DECISIONS 2 Oct 2026): the brands it watches, an
 * optional client, the grain (week or month), the platforms, the slides, and
 * the findings pinned from Chats. The spec becomes the same contract the weekly
 * report runs on (src/competitor/contract.ts), so every number comes from the
 * same facts. Pure: checked against the workspace's brands by the caller.
 */
import type { WeeklyContract } from "../competitor/contract";
import { GRAINS, type DeckGrain, type Grain } from "../competitor/period";
import { cleanSlides, type SlideKind } from "../competitor/slides";
import type { Platform } from "../competitor/types";
import { cleanRepSlides, type RepSpec } from "../reputation/slides";
import { cleanSocialSlides, type SocialSpec } from "../social/slides";

/** Every platform a deck can cover; a deck covers the ones its workspace holds (none picked = all of them). */
export const DECK_PLATFORMS: Platform[] = ["tiktok", "instagram", "threads", "x", "youtube"];

/** An analysis pinned from Chats: the skill and the settings it ran with; each version runs it again over the deck's period. */
/** skill: a skill name, or "recipe:<key>" for one of Fair's or the team's recipes (src/recipes/) */
export type FindingSpec = { key: string; skill: string; params: Record<string, unknown>; question: string; title: string };

export type DeckSpec = {
  /** the title on the slides ("Monthly Competitor Review") */
  title: string;
  /** week or month; a PR deck may also go day by day */
  grain: DeckGrain;
  platforms: Platform[];
  client: { name: string; brands: { name: string; brand_ids: string[] }[] } | null;
  watchlist: { name: string; short?: string; group: "core" | "when_relevant"; brand_ids: string[] }[];
  slides: SlideKind[];
  findings?: FindingSpec[];
  /** a PR deck (DECISIONS 3 Oct 2026): one brand's reputation; the watchlist, client and slides above stay empty */
  rep?: RepSpec;
  /** a Social Media deck (DECISIONS 3 Oct 2026): one brand's own accounts; the watchlist, client and slides above stay empty */
  social?: SocialSpec;
};

/** A brand's name as a slide prints it: "Officialhanasui" (the panel's account-style name) reads "Hanasui". */
export function brandLabel(name: string): string {
  const t = name.replace(/^official[\s_-]*/i, "").replace(/[\s_-]*official$/i, "").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : name;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const ids = (v: unknown, known: Set<string>) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && known.has(x)))].slice(0, 12) : []);

/** A spec from what the page sends: known brands only, a watchlist of at least one brand, known slides, the summary first. */
export function cleanSpec(input: unknown, known: Set<string>): DeckSpec | { error: string } {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const grain: Grain = GRAINS.includes(o.grain as Grain) ? (o.grain as Grain) : "week";
  if (o.social && typeof o.social === "object") {
    const r = o.social as Record<string, unknown>;
    const focus = str(r.focus, 80);
    if (!known.has(focus)) return { error: "pick the brand this deck is about" };
    const platform = typeof r.platform === "string" && /^[a-z]{1,12}$/.test(r.platform) ? r.platform : "all";
    return { title: str(o.title, 60) || "Content Review", grain, platforms: [], client: null, watchlist: [], slides: ["summary"], social: { focus, platform, slides: cleanSocialSlides(r.slides) } };
  }
  if (o.rep && typeof o.rep === "object") {
    const r = o.rep as Record<string, unknown>;
    const focus = str(r.focus, 80);
    if (!known.has(focus)) return { error: "pick the brand this deck is about" };
    const platform = typeof r.platform === "string" && /^[a-z]{1,12}$/.test(r.platform) ? r.platform : "all";
    // a PR deck may go day by day (a case moves by the hour); the others keep weeks and months
    return { title: str(o.title, 60) || "Reputation Report", grain: o.grain === "day" ? "day" : grain, platforms: [], client: null, watchlist: [], slides: ["summary"], rep: { focus, platform, slides: cleanRepSlides(r.slides) } };
  }
  const platforms = Array.isArray(o.platforms) ? DECK_PLATFORMS.filter((p) => (o.platforms as unknown[]).includes(p)) : [];
  const watchlist = (Array.isArray(o.watchlist) ? o.watchlist : [])
    .map((w) => {
      const x = (w && typeof w === "object" ? w : {}) as Record<string, unknown>;
      const brand_ids = ids(x.brand_ids, known);
      const name = str(x.name, 60) || brand_ids[0] || "";
      return { name, ...(str(x.short, 20) ? { short: str(x.short, 20) } : {}), group: x.group === "when_relevant" ? ("when_relevant" as const) : ("core" as const), brand_ids };
    })
    .filter((w) => w.name && w.brand_ids.length)
    .slice(0, 12);
  if (!watchlist.length) return { error: "pick at least one brand to watch" };
  const seen = new Set<string>();
  for (const w of watchlist) {
    const k = w.name.toLowerCase();
    if (seen.has(k)) return { error: `${w.name} is in the watchlist twice` };
    seen.add(k);
  }
  const c = (o.client && typeof o.client === "object" ? o.client : null) as Record<string, unknown> | null;
  const clientBrands = c && Array.isArray(c.brands)
    ? (c.brands as unknown[]).map((b) => { const x = (b && typeof b === "object" ? b : {}) as Record<string, unknown>; const brand_ids = ids(x.brand_ids, known); return { name: str(x.name, 60) || brand_ids[0] || "", brand_ids }; }).filter((b) => b.name && b.brand_ids.length).slice(0, 12)
    : [];
  const client = c && str(c.name, 60) && clientBrands.length ? { name: str(c.name, 60), brands: clientBrands } : null;
  if (client) {
    const watched = new Set(watchlist.flatMap((w) => w.brand_ids));
    const both = clientBrands.flatMap((b) => b.brand_ids).filter((id) => watched.has(id));
    if (both.length) return { error: `${both.join(", ")} cannot be both the client's and a watched brand` };
  }
  const findings = (Array.isArray(o.findings) ? o.findings : [])
    .map((f, i) => {
      const x = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
      return { key: str(x.key, 20) || `f${i + 1}`, skill: str(x.skill, 60), params: (x.params && typeof x.params === "object" ? x.params : {}) as Record<string, unknown>, question: str(x.question, 300), title: str(x.title, 80) || "Finding" };
    })
    // a skill, or one of the team's analyses written as a recipe ("recipe:<key>", src/recipes/)
    .filter((f) => /^[a-z][a-z-]*$/.test(f.skill) || /^recipe:[a-z0-9][a-z0-9-]{2,48}$/.test(f.skill))
    .slice(0, 6);
  return {
    title: str(o.title, 60) || "Deck",
    grain,
    // empty = every platform the workspace holds, read when a version is made
    platforms,
    client,
    watchlist,
    slides: cleanSlides(o.slides),
    ...(findings.length ? { findings } : {}),
  };
}

/** The contract the facts run on. */
export function specContract(spec: DeckSpec, workspaceId: string): WeeklyContract {
  return {
    title: spec.title,
    workspace: workspaceId,
    client: spec.client,
    watchlist: spec.watchlist,
    platforms: spec.platforms,
    grain: spec.grain === "day" ? "week" : spec.grain,
    slides: spec.slides,
  };
}
