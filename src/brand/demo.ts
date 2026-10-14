/**
 * A presenter's brand for one day (Refal, 14 Oct 2026). Fair staff open /brand/bpa and, in that browser only, the app
 * goes by "BPA Listening": the sidebar, the tab title, the sign-in page, the account row and the badge on what came
 * with the role. /brand/fair puts it back, and the cookie lapses after a day on its own. Nothing else changes: the
 * data, the numbers, other people's screens, emails and the report files already made stay Fair's.
 * A brand can sit beside its own other apps: they open from a grid at the top right, as in an office suite.
 * Pure on purpose, so client components can read it; the request side is src/brand/current.ts.
 */
export const BRAND_COOKIE = "fi_brand";

/** one day, the length of a presentation's prep and the presentation */
export const BRAND_MAX_AGE = 24 * 60 * 60;

/** one of the brand's apps in the top-right grid; here: this app */
export type BrandApp = { key: string; name: string; href: string; here?: boolean };

export type DemoBrand = { key: string; name: string; short: string; apps?: BrandApp[] };

export const DEMO_BRANDS: Record<string, DemoBrand> = {
  bpa: {
    key: "bpa",
    name: "BPA Listening",
    short: "BPA",
    apps: [
      { key: "listening", name: "Listening", href: "/dashboard", here: true },
      { key: "affiliate", name: "Affiliate", href: "https://affiliate-bpa.com" },
    ],
  },
};

/** the brand a cookie value names, or null for Fair's own */
export function brandFrom(value: string | undefined | null): DemoBrand | null {
  return value && Object.prototype.hasOwnProperty.call(DEMO_BRANDS, value) ? DEMO_BRANDS[value] : null;
}

/** "Fair" on a badge marks what came with the role; under a presenter's brand it carries that brand's short name */
export const fairBadge = (brand: DemoBrand | null) => brand?.short ?? "Fair";

/** whether a badge is the role's own (styled as Fair's), whatever name the browser shows it under */
export const isFairBadge = (badge: string | undefined) => badge === "Fair" || Object.values(DEMO_BRANDS).some((b) => b.short === badge);
