/**
 * Is a listening post about its brand? (DECISIONS 3 Oct 2026; CMS plan, "Relevance".) Yes
 * when the brand posted it, it tags one of the brand's accounts, or its caption names the
 * brand: one of its terms or handles at the start of a word, case-insensitive, except a
 * term written in capitals ("DANA"), which matches only in capitals and as a whole word.
 * A "never" phrase ("go pay attention") is taken out of the caption first. The rule is
 * the same for every workspace; the terms are workspace data, edited in the CMS. Pure.
 * Same rule as etl/load_listening.py's term_matcher, so a reload gives the same posts.
 */
const escape = (t: string) => t.replace(/[.*+?^${}()|[\]\\\/-]/g, "\\$&");
const isCaps = (t: string) => t === t.toUpperCase() && t !== t.toLowerCase();

export type Matcher = { loose: RegExp | null; strict: RegExp | null; never: RegExp | null };

export function brandMatcher(terms: string[], never: string[] = []): Matcher {
  const clean = [...new Set(terms.map((t) => t.trim()).filter(Boolean))];
  const loose = [...new Set(clean.filter((t) => !isCaps(t)).map((t) => t.toLowerCase()))].sort((a, b) => b.length - a.length);
  const strict = [...new Set(clean.filter(isCaps))].sort((a, b) => b.length - a.length);
  const nv = [...new Set(never.map((t) => t.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  return {
    loose: loose.length ? new RegExp(`(?<![a-z0-9])(?:${loose.map(escape).join("|")})`, "i") : null,
    strict: strict.length ? new RegExp(`(?<![A-Za-z0-9])(?:${strict.map(escape).join("|")})(?![A-Za-z0-9])`) : null,
    never: nv.length ? new RegExp(nv.map(escape).join("|"), "gi") : null,
  };
}

/** does the caption name the brand? */
export function names(m: Matcher, caption: string | null): boolean {
  if (!caption) return false;
  const text = m.never ? caption.replace(m.never, " ") : caption;
  return !!(m.loose?.test(text) || m.strict?.test(text));
}

export function isRelevant(p: { owned: boolean; tagged: string[]; caption: string | null }, handles: Set<string>, m: Matcher): boolean {
  return p.owned || p.tagged.some((h) => handles.has(h.toLowerCase())) || names(m, p.caption);
}
