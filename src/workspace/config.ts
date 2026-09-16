/**
 * A workspace is a subject (DECISIONS, 14 Sep): a category panel of brands, one
 * artist, one executive. The data is the same three things underneath, contents,
 * comments, sentiment; what changes is the product name on screen, the persona in
 * the prompt, the words used for the people posting, and the questions offered
 * on an empty screen. Everything here is pure: defaults per kind, overridable per
 * workspace through `workspaces.settings`.
 */
export type WorkspaceKind = "category" | "profile";

export type WorkspaceSettings = {
  product_name?: string;
  tagline?: string;
  /** the small label under the product name and on the Data page, e.g. "Beauty · Indonesia" */
  category_label?: string;
  /** what the people posting are called: "creators" in a category, "accounts" around a profile */
  subject_noun?: string;
  /** the first sentence of the system prompt; {{name}} and {{subject}} are filled */
  persona?: string;
  hero_title?: string;
  hero_intro?: string;
  suggested?: string[];
  /** what a reputation problem costs: the subject's commercial partners, and the words a boycott uses */
  commercial?: CommercialSettings;
};

/** Partner brands are per subject and never guessed: an owner sets them, and Pulse counts only what is listed. */
export type Partner = { name: string; terms?: string[] };
export type CommercialSettings = { partners?: Partner[]; boycott_terms?: string[] };
export type Commercial = { partners: { name: string; terms: string[] }[]; boycott_terms: string[] };

export type WorkspaceRow = { id: string; name: string; category: string | null; client_brand_id: string | null; tz: string; kind: WorkspaceKind; settings: WorkspaceSettings | null };

export type WorkspaceConfig = {
  id: string;
  name: string;
  kind: WorkspaceKind;
  tz: string;
  client_brand_id: string | null;
  product_name: string;
  tagline: string;
  category_label: string;
  subject_noun: string;
  persona: string;
  hero_title: string;
  hero_intro: string;
  suggested: string[];
  commercial: Commercial;
};

const CATEGORY_DEFAULTS = {
  product_name: "CeMO",
  tagline: "Your CMO",
  subject_noun: "creators",
  persona: "You are CeMO — the CMO in the room for {{name}}. CeMO stands for Creator Intelligence for Market Monitoring.",
  hero_title: "What's happening in {{category}}?",
  hero_intro: "I've read every creator post about {{brands}} brands on TikTok and Instagram. Ask me anything about creators, competitors or campaigns; every number I give you shows its evidence, and I'll tell you when the data disagrees with you.",
  suggested: ["What were competitors doing last week?", "Which brand grew fastest this month?", "Which campaigns ran in the last 90 days with 20 or more creators?", "Find 50 nano creators competitors used on TikTok in the last 90 days"],
};

const PROFILE_DEFAULTS = {
  product_name: "Fair Intelligence",
  tagline: "Social intelligence",
  subject_noun: "accounts",
  persona: "You are the analyst behind Fair Intelligence, working with {{subject}}'s team. {{subject}} is the subject of this workspace: every post and comment here is about them, and you are on their side.",
  hero_title: "What are people saying about {{subject}}?",
  hero_intro: "I've read every post and comment about {{subject}} across {{platforms}}. Ask me what is being said, how it is moving, and who is driving it; every number I give you shows its evidence.",
  suggested: ["What are people saying about {{subject}} this week?", "Which posts drew the most negative comments?", "Who is driving the conversation about {{subject}}?", "How has sentiment moved over the last 30 days?"],
};

/** What a call to boycott looks like in the markets Fair covers; a workspace can replace the list. */
const BOYCOTT_TERMS = ["boikot", "boycott", "stop endorse", "cabut endorse", "putus kontrak"];

/** Fill {{name}}, {{subject}}, {{category}}, {{brands}}, {{platforms}} in a template. */
export function fillCopy(t: string, vars: { name: string; subject: string; category: string; brands?: number | string; platforms?: string }): string {
  return t
    .replace(/\{\{name\}\}/g, vars.name)
    .replace(/\{\{subject\}\}/g, vars.subject)
    .replace(/\{\{category\}\}/g, vars.category)
    .replace(/\{\{brands\}\}/g, String(vars.brands ?? ""))
    .replace(/\{\{platforms\}\}/g, vars.platforms ?? "TikTok and Instagram");
}

/** The workspace's effective configuration: settings over the defaults for its kind. */
export function workspaceConfig(row: WorkspaceRow, clientName: string | null = null): WorkspaceConfig {
  const kind: WorkspaceKind = row.kind === "profile" ? "profile" : "category";
  const d = kind === "profile" ? PROFILE_DEFAULTS : CATEGORY_DEFAULTS;
  const s = row.settings ?? {};
  const categoryLabel = s.category_label ?? (row.category ? `${row.category.charAt(0).toUpperCase()}${row.category.slice(1)} · Indonesia` : row.name);
  const subject = clientName ?? row.name;
  const vars = { name: row.name, subject, category: categoryLabel.replace(/\s*·.*$/, "").toLowerCase() === "beauty" ? "Indonesian beauty" : categoryLabel };
  return {
    id: row.id,
    name: row.name,
    kind,
    tz: row.tz,
    client_brand_id: row.client_brand_id,
    product_name: s.product_name ?? d.product_name,
    tagline: s.tagline ?? d.tagline,
    category_label: categoryLabel,
    subject_noun: s.subject_noun ?? d.subject_noun,
    persona: fillCopy(s.persona ?? d.persona, vars),
    hero_title: fillCopy(s.hero_title ?? d.hero_title, vars),
    hero_intro: s.hero_intro ?? d.hero_intro, // filled by the caller, which knows the counts
    suggested: (s.suggested?.length ? s.suggested : d.suggested).map((q) => fillCopy(q, vars)),
    commercial: {
      // A partner with no terms of its own is matched on its name, which is what an
      // owner typing "Oatside" into the Data page expects.
      partners: (s.commercial?.partners ?? []).filter((p) => p.name?.trim()).map((p) => ({ name: p.name.trim(), terms: (p.terms?.length ? p.terms : [p.name]).map((t) => t.trim()).filter(Boolean) })),
      boycott_terms: s.commercial?.boycott_terms?.length ? s.commercial.boycott_terms.map((t) => t.trim()).filter(Boolean) : BOYCOTT_TERMS,
    },
  };
}
