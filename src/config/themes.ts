/**
 * Caption theme lexicon for /themes (DECISIONS: caption and hashtag skills).
 * Each theme is a tsquery over the 'simple' full-text form of the caption
 * (no stemming; mixed Indonesian and English), so terms are whole words and
 * `:*` marks a prefix. Add variants here, not in SQL. The query builder never
 * takes free text for these; only the theme keys are addressable.
 */
export type ThemeGroup = "claims" | "ingredients" | "concerns" | "commerce";

export type Theme = { key: string; group: ThemeGroup; label: string; terms: string[] };

export const THEMES: readonly Theme[] = [
  // what the post promises
  { key: "glowing", group: "claims", label: "Glowing / glow up", terms: ["glowing", "glow:*", "glowy", "bercahaya"] },
  { key: "brightening", group: "claims", label: "Brightening / cerah", terms: ["cerah", "mencerahkan", "bright:*", "whitening", "putih"] },
  { key: "glass_skin", group: "claims", label: "Glass skin", terms: ["glass <-> skin", "glasskin"] },
  { key: "long_lasting", group: "claims", label: "Long lasting / tahan lama", terms: ["tahan <-> lama", "longlasting", "long <-> lasting", "awet", "tahan:* <-> jam"] },
  { key: "waterproof", group: "claims", label: "Waterproof / transferproof", terms: ["waterproof", "transferproof", "smudgeproof", "sweatproof", "anti <-> air"] },
  { key: "hydrating", group: "claims", label: "Hydrating / lembap", terms: ["lembab", "lembap", "melembabkan", "melembapkan", "hydrat:*", "moistur:*"] },
  { key: "matte", group: "claims", label: "Matte finish", terms: ["matte", "matt"] },
  { key: "lightweight", group: "claims", label: "Lightweight / ringan", terms: ["ringan", "lightweight", "breathable", "nyaman"] },
  { key: "natural_look", group: "claims", label: "Natural / no-makeup look", terms: ["natural", "no <-> makeup", "nude", "soft <-> glam", "clean <-> girl"] },
  { key: "full_coverage", group: "claims", label: "Coverage", terms: ["coverage", "menutup", "full <-> coverage", "medium <-> coverage"] },
  // what is in the product
  { key: "niacinamide", group: "ingredients", label: "Niacinamide", terms: ["niacinamide", "niacin:*"] },
  { key: "retinol", group: "ingredients", label: "Retinol / retinal", terms: ["retinol", "retinal", "retinoid:*"] },
  { key: "ceramide", group: "ingredients", label: "Ceramide", terms: ["ceramide:*"] },
  { key: "hyaluronic", group: "ingredients", label: "Hyaluronic acid", terms: ["hyaluronic", "hyaluronate", "hyaluron:*", "ha"] },
  { key: "exfoliant", group: "ingredients", label: "AHA / BHA / PHA", terms: ["aha", "bha", "pha", "salicylic", "salicylate", "glycolic", "lactic", "exfoliat:*", "eksfoliasi"] },
  { key: "vitamin_c", group: "ingredients", label: "Vitamin C", terms: ["vitamin <-> c", "vit <-> c", "vitc", "ascorbic"] },
  { key: "centella", group: "ingredients", label: "Centella / cica", terms: ["centella", "cica", "asiatica"] },
  { key: "collagen", group: "ingredients", label: "Collagen / peptide", terms: ["collagen", "kolagen", "peptide:*", "peptida"] },
  { key: "spf", group: "ingredients", label: "SPF / sunscreen", terms: ["spf", "sunscreen", "sunblock", "tabir <-> surya", "pa"] },
  { key: "probiotic", group: "ingredients", label: "Probiotic / microbiome", terms: ["probiotic:*", "prebiotic:*", "microbiome"] },
  // what skin problem it addresses
  { key: "acne", group: "concerns", label: "Acne / jerawat", terms: ["jerawat", "berjerawat", "acne", "bruntusan", "beruntusan", "komedo", "blackhead:*", "pimple:*"] },
  { key: "oily", group: "concerns", label: "Oily skin", terms: ["berminyak", "oily", "minyak"] },
  { key: "dry", group: "concerns", label: "Dry skin", terms: ["kering", "dry", "dehidrasi"] },
  { key: "sensitive", group: "concerns", label: "Sensitive skin", terms: ["sensitif", "sensitive", "iritasi", "kemerahan", "redness"] },
  { key: "pores", group: "concerns", label: "Pores", terms: ["pori", "pores", "pore"] },
  { key: "dull", group: "concerns", label: "Dull skin / kusam", terms: ["kusam", "dull", "dullness"] },
  { key: "dark_spots", group: "concerns", label: "Dark spots / flek", terms: ["flek", "noda <-> hitam", "dark <-> spot:*", "hiperpigmentasi", "hyperpigmentation", "bekas <-> jerawat"] },
  { key: "aging", group: "concerns", label: "Anti-aging / wrinkles", terms: ["kerutan", "keriput", "aging", "wrinkle:*", "garis <-> halus", "fine <-> line:*", "kencang"] },
  { key: "barrier", group: "concerns", label: "Skin barrier", terms: ["barrier"] },
  { key: "scalp_hair", group: "concerns", label: "Scalp / hair fall", terms: ["ketombe", "rontok", "dandruff", "hairfall", "kulit <-> kepala"] },
  // how it sells
  { key: "promo", group: "commerce", label: "Promo / discount", terms: ["promo", "diskon", "discount", "flash <-> sale", "flashsale", "sale", "harga <-> spesial", "cashback", "voucher"] },
  { key: "free_shipping", group: "commerce", label: "Free shipping", terms: ["gratis <-> ongkir", "free <-> ongkir", "gratisongkir", "freeongkir"] },
  { key: "checkout", group: "commerce", label: "Checkout / keranjang", terms: ["checkout", "check <-> out", "keranjang", "keranjang <-> kuning", "link <-> di <-> bio", "klik <-> keranjang"] },
  { key: "racun", group: "commerce", label: "Racun / rekomendasi", terms: ["racun", "racunin", "rekomendasi", "recommend:*", "wajib <-> punya", "must <-> have"] },
  { key: "worth_it", group: "commerce", label: "Worth it / value", terms: ["worth <-> it", "worthit", "worth", "murah", "affordable", "terjangkau", "hemat"] },
  { key: "giveaway", group: "commerce", label: "Giveaway / gratis", terms: ["giveaway", "gratis", "free <-> gift", "hadiah"] },
  { key: "launch", group: "commerce", label: "New launch", terms: ["baru", "new", "launching", "launch", "terbaru", "newlaunch", "produk <-> baru"] },
];

export const THEME_KEYS = THEMES.map((t) => t.key);
export const THEME_GROUPS: ThemeGroup[] = ["claims", "ingredients", "concerns", "commerce"];

/** tsquery text for a theme: OR of its terms, phrases written with <-> as in Postgres. */
export function themeQuery(t: Theme): string {
  return t.terms.map((term) => (term.includes(" ") ? `(${term})` : term)).join(" | ");
}
