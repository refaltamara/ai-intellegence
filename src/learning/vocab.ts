/**
 * The words signals are made of, computed inside the workspace before anything is stored
 * (CMS plan, "The learning loop"): a coarse intent for an analysis, and a creation's shape
 * (what kind of thing it is, never its title or wording). Pure, so client code and the
 * tests can use it.
 */
export const CREATION_KINDS_LIST = ["skill", "deck_template", "rule", "fact", "term", "extension"] as const;

export const INTENTS = ["issue_check", "competitor_comparison", "content", "creators", "audience", "campaigns", "own_accounts", "data_question", "other"] as const;
export type Intent = (typeof INTENTS)[number];

export const INTENT_LABEL: Record<Intent, string> = {
  issue_check: "issue check",
  competitor_comparison: "competitor comparison",
  content: "content",
  creators: "creators",
  audience: "audience",
  campaigns: "campaigns",
  own_accounts: "own accounts",
  data_question: "a number",
  other: "other",
};

/** Fair's skills by the question they answer (skills.registry.json names) */
const SKILL_INTENT: Record<string, Intent> = {
  discovery: "creators", mercenaries: "creators", loyalists: "creators", affiliates: "creators", breakout: "creators", "funnel-mix": "creators", overlap: "creators",
  velocity: "content", forecast: "content", waves: "content", "top-content": "content", hashtags: "content", themes: "content", products: "content",
  campaigns: "campaigns", launch: "campaigns",
  compare: "competitor_comparison", "brand-strategy": "competitor_comparison", "hashtag-overlap": "competitor_comparison",
  sentiment: "issue_check", "comment-themes": "issue_check", drivers: "issue_check", seeding: "issue_check", narrative: "issue_check",
  objections: "audience", questions: "audience", dupes: "audience", claims: "audience", whitespace: "audience",
  audience: "audience", switchers: "audience", superfans: "audience",
};

export const skillIntent = (skill: string): Intent => SKILL_INTENT[skill] ?? "other";

type Query = { entity?: string; group_by?: string[]; metrics?: string[]; filters?: Record<string, unknown> };

/** A query's intent from its shape: negative comments are an issue check, by brand a comparison, own posts own accounts. */
export function queryIntent(q: Query | null | undefined): Intent {
  if (!q) return "data_question";
  const f = q.filters ?? {};
  const metrics = q.metrics ?? [];
  const neg = JSON.stringify(f.sentiment ?? "").includes("negative") || metrics.some((m) => /negative/.test(m));
  if (q.entity === "comments" && neg) return "issue_check";
  if (f.source === "owned" || JSON.stringify(f.source ?? "") === '["owned"]') return "own_accounts";
  if ((q.group_by ?? []).includes("brand_id")) return "competitor_comparison";
  if ((q.group_by ?? []).some((g) => /creator/.test(g))) return "creators";
  if (q.entity === "comments") return "audience";
  if (q.entity === "posts") return "content";
  return "data_question";
}

/** a client-named dimension (an extension's key) travels as "ext", never its name */
const dim = (g: string) => (g.startsWith("ext_") ? "ext" : g.replace(/[^a-z0-9_]/g, ""));

/**
 * A creation's shape: what kind of thing it is, for roll-ups across clients. A skill is its
 * query's entity, grouping and first metric; a template the Fair template it started from;
 * a house rule its category; an extension its target and source. Never a title or text.
 */
export function creationShape(kind: string, spec: Record<string, unknown>): string {
  switch (kind) {
    case "skill": {
      const q = (spec.query ?? {}) as Query;
      const groups = (q.group_by ?? []).map(dim).filter(Boolean);
      return `skill.${q.entity ?? "posts"}.${groups.length ? groups.join("-") : "total"}.${dim(q.metrics?.[0] ?? "count")}`.slice(0, 64);
    }
    case "deck_template": {
      const from = typeof spec.from === "string" && /^[a-z0-9-]{1,40}$/.test(spec.from) ? spec.from : "scratch";
      return `deck.${from}`;
    }
    case "rule": return `rule.${ruleCategory(String(spec.text ?? ""))}`;
    case "fact": return "fact";
    case "term": return "term";
    case "extension": {
      const t = /^[a-z_]{1,20}$/.test(String(spec.target ?? "")) ? spec.target : "rows";
      const s = /^[a-z_]{1,20}$/.test(String(spec.source ?? "")) ? spec.source : "unknown";
      return `extension.${t}.${s}`;
    }
    default: return kind;
  }
}

/**
 * A house rule's category, the only part of it that leaves the workspace (CMS plan, "The
 * boundary"): drafting (how CeMO writes), naming (what things are called), review (who
 * must check), data (what counts), or other.
 */
export function ruleCategory(text: string): "drafting" | "naming" | "review" | "data" | "other" {
  const t = text.toLowerCase();
  if (/\b(review|approve|legal|compliance|sign[- ]off|cek|periksa|setuju)\b/.test(t)) return "review";
  if (/\b(call|name|say|term|refer|sebut|istilah|panggil|nama)\b/.test(t)) return "naming";
  if (/\b(draft|write|caption|statement|tone|reply|holding|tulis|nada|balas|jawab)\b/.test(t)) return "drafting";
  if (/\b(count|exclude|include|competitor|brand|hitung|kompetitor)\b/.test(t)) return "data";
  return "other";
}
