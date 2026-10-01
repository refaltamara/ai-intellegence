/**
 * Product categories a caption names, for the weekly report's "what creators
 * put in front of the camera" (DECISIONS, 1 Oct 2026). Same form as the theme
 * lexicon (src/config/themes.ts): whole words over the 'simple' full-text form
 * of the caption, `:*` for a prefix, `<->` for a phrase. A post can name several
 * categories; posts that name none are counted as such. Add variants here, not in SQL.
 */
export type Category = { key: string; label: string; terms: string[] };

export const CATEGORIES: readonly Category[] = [
  { key: "lip", label: "Lip", terms: ["lip", "lips", "lipstick:*", "lipstik", "lipcream:*", "liptint:*", "lipgloss", "lipbalm", "lipserum", "lipstain", "lipmatte", "lipliner", "lipmousse", "lipoil", "bibir", "gloss"] },
  { key: "cushion", label: "Cushion", terms: ["cushion:*", "kusyen"] },
  { key: "foundation", label: "Foundation", terms: ["foundation:*", "alas <-> bedak"] },
  { key: "skin_tint", label: "Skin tint", terms: ["skintint:*", "skin <-> tint", "skin <-> tints"] },
  { key: "powder", label: "Powder", terms: ["bedak", "powder:*", "twc", "two <-> way <-> cake", "loose <-> powder", "compact <-> powder"] },
  { key: "concealer", label: "Concealer", terms: ["concealer:*"] },
  { key: "blush", label: "Blush", terms: ["blush:*", "blushon", "blush <-> on", "perona <-> pipi"] },
  { key: "eye", label: "Eyes", terms: ["mascara:*", "eyeliner:*", "eyeshadow:*", "eye <-> shadow", "eyebrow:*", "alis", "maskara"] },
  { key: "setting", label: "Primer & setting", terms: ["primer:*", "setting <-> spray", "setting <-> mist", "settingspray", "fixing <-> spray"] },
  { key: "sunscreen", label: "Sunscreen", terms: ["sunscreen:*", "sunblock", "spf", "tabir <-> surya", "sunserum", "sun <-> serum"] },
  { key: "serum", label: "Serum", terms: ["serum:*", "ampoule:*", "essence"] },
  { key: "moisturizer", label: "Moisturizer", terms: ["moisturizer:*", "moisturiser:*", "pelembab", "pelembap", "day <-> cream", "night <-> cream", "gel <-> cream"] },
  { key: "cleanser", label: "Cleanser", terms: ["facial <-> wash", "facewash", "face <-> wash", "cleanser:*", "sabun <-> muka", "micellar", "cleansing", "facial <-> foam"] },
  { key: "toner", label: "Toner", terms: ["toner:*", "exfoliating <-> toner"] },
  { key: "mask", label: "Mask", terms: ["masker", "mask", "sheetmask", "sheet <-> mask", "clay <-> mask"] },
  { key: "body", label: "Body care", terms: ["body <-> lotion", "body <-> serum", "body <-> wash", "bodywash", "lotion", "handbody", "body <-> scrub"] },
  { key: "hair", label: "Hair", terms: ["shampoo:*", "sampo", "conditioner:*", "hair <-> serum", "hair <-> oil", "hair <-> tonic", "rambut"] },
  { key: "fragrance", label: "Fragrance", terms: ["parfum:*", "perfume:*", "edp", "body <-> mist", "bodymist", "cologne"] },
];

export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label]));

/** tsquery text for a category: OR of its terms. */
export function categoryQuery(c: Category): string {
  return c.terms.map((t) => (t.includes(" ") ? `(${t})` : t)).join(" | ");
}

/** Caption patterns for commerce timing: a double date ("6.6", "12.12") and payday. */
export const DOUBLE_DATE_RE = "\\m([1-9]|1[0-2])\\.\\1\\M";
export const PAYDAY_RE = "\\m(payday|gajian|gajiann)\\M";
/** An account that reposts cut clips with a brand tagged ("clipper"): its handle or a clipping-community tag. */
export const CLIPPER_HANDLE_RE = "clip";
export const CLIPPER_TAG_RE = "clipper|clipping|klipper";
