/** The charts a Dashboard panel may be (src/dashboard/panelSpec.ts), with no other imports so client components may read them. */
export const CHARTS = ["line", "bar", "stacked", "table", "number", "share"] as const;
export type Chart = (typeof CHARTS)[number];

export const CHART_LABEL: Record<Chart, string> = { line: "Line over time", bar: "Bars", stacked: "Stacked bars", table: "Table", number: "One number", share: "Shares of a whole" };
