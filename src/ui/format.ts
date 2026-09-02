export const fmtNum = (v: unknown): string => {
  if (v == null || v === "") return "–";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (Math.abs(n) >= 10_000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  return Number.isInteger(n) ? n.toLocaleString("en-US") : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
};
export const fmtDate = (v: unknown): string => {
  if (!v) return "–";
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });
};
export const PF: Record<string, { label: string; color: string }> = { tiktok: { label: "TT", color: "#0F1B2D" }, instagram: { label: "IG", color: "#E1306C" }, aggregate: { label: "Σ", color: "#1E5EFF" }, creator: { label: "@", color: "#7C5CFF" } };
