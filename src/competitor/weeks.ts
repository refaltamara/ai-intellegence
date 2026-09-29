/** Week arithmetic for the weekly report: weeks run Monday to Sunday in the workspace's time zone. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "2026-06-22" (a Monday) or "2026-W26" → the Monday that starts the week */
export function weekStart(raw: string): string {
  const iso = /^(\d{4})-W(\d{2})$/.exec(raw);
  if (iso) {
    const jan4 = new Date(Date.UTC(Number(iso[1]), 0, 4));
    const dow = jan4.getUTCDay() || 7;
    jan4.setUTCDate(jan4.getUTCDate() - dow + 1 + (Number(iso[2]) - 1) * 7);
    return jan4.toISOString().slice(0, 10);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error(`week must be YYYY-MM-DD (a Monday) or YYYY-Www, got ${raw}`);
  const d = new Date(raw + "T00:00:00Z");
  if (d.getUTCDay() !== 1) throw new Error(`${raw} is not a Monday`);
  return raw;
}

export function isoWeek(monday: string): string {
  const d = new Date(monday + "T00:00:00Z");
  const thursday = new Date(d);
  thursday.setUTCDate(d.getUTCDate() + 3);
  const year = thursday.getUTCFullYear();
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const week = Math.floor((thursday.getTime() - jan1.getTime()) / 86400000 / 7) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** "22–28 Jun 2026", "29 Jun – 5 Jul 2026" */
export function weekLabel(monday: string): string {
  const a = new Date(monday + "T00:00:00Z");
  const b = new Date(addDays(monday, 6) + "T00:00:00Z");
  const am = MONTHS[a.getUTCMonth()];
  const bm = MONTHS[b.getUTCMonth()];
  return am === bm ? `${a.getUTCDate()}–${b.getUTCDate()} ${bm} ${b.getUTCFullYear()}` : `${a.getUTCDate()} ${am} – ${b.getUTCDate()} ${bm} ${b.getUTCFullYear()}`;
}

/** "22 Jun" */
export function shortDay(iso: string): string {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
