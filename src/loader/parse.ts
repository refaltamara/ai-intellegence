/**
 * Reading a source's cells the way the loaders always have (etl/load.py, etl/load_profile.py, src/onboard/listening.ts),
 * so a load through the one loader (src/loader/) writes what the old loaders wrote, value for value.
 */
import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import { gunzipSync } from "node:zlib";

export type Row = Record<string, string | null>;

/** a CSV file's rows; empty cells are null; a .gz file is unzipped first */
export function readCsv(bytes: Buffer, name: string, opts: { lowerHeaders?: boolean } = {}): Row[] {
  const text = (name.endsWith(".gz") ? gunzipSync(bytes) : bytes).toString("utf8");
  const rows = parse(text, {
    columns: opts.lowerHeaders ? (h: string[]) => h.map((c) => String(c).trim().toLowerCase()) : true,
    skip_empty_lines: true, relax_column_count: true, relax_quotes: true, bom: true,
  }) as Record<string, string>[];
  return rows.map((r) => {
    const o: Row = {};
    for (const [k, v] of Object.entries(r)) if (k && !k.startsWith("unnamed")) o[k] = v === "" ? null : v;
    return o;
  });
}

export const str = (v: unknown): string | null => {
  if (v == null) return null;
  const t = String(v).trim();
  return t || null;
};

/** Python's round(): halves go to the even neighbour (2.5 → 2, 3.5 → 4) */
export function roundHalfEven(x: number): number {
  const f = Math.floor(x);
  const d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

/** etl/load.py to_int: a number in any form ("42600.0"), rounded as Python rounds; anything else null */
export function int(v: unknown): number | null {
  const t = str(v);
  if (t == null) return null;
  const f = Number(t);
  if (!Number.isFinite(f)) return null;
  return roundHalfEven(f);
}

export function num(v: unknown): number | null {
  const t = str(v);
  if (t == null) return null;
  const f = Number(t);
  return Number.isFinite(f) ? f : null;
}

/** Python's re `#([\w]+)` with re.UNICODE: letters, digits and the underscore in any script; each tag once, lowercased */
const HASHTAG = /#([\p{L}\p{N}_]+)/gu;
export function hashtags(caption: string | null): string[] | null {
  if (!caption) return null;
  const out: string[] = [];
  for (const m of caption.matchAll(HASHTAG)) {
    const h = m[1].toLowerCase();
    if (!out.includes(h)) out.push(h);
  }
  return out.length ? out : null;
}

export const handle = (v: unknown): string | null => {
  const t = str(v);
  const h = t ? t.replace(/^@+/, "").trim().toLowerCase() : null;
  return h || null;
};

export const authorHash = (platform: string, h: string | null) => createHash("sha256").update(`${platform}${h ?? ""}`).digest("hex");

// ------------------------------------------------------------------ time
/** minutes a zone is ahead of UTC at a moment (Asia/Jakarta: 420, all year) */
function offsetMinutes(at: Date, tz: string): number {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(at).reduce<Record<string, string>>((a, x) => ((a[x.type] = x.value), a), {});
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

/** a wall-clock time in `tz` as a moment (naive source times are local, DECISIONS) */
export function zoned(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string): Date {
  const guess = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  const off = offsetMinutes(guess, tz);
  const t = new Date(guess.getTime() - off * 60000);
  const off2 = offsetMinutes(t, tz);
  return off2 === off ? t : new Date(guess.getTime() - off2 * 60000);
}

/** "2026-04-11 10:20:30", "2026-04-11 9:05:00", "2026-04-11", with a "T" or not, read as local time in `tz` */
export function naiveLocal(v: unknown, tz: string): Date | null {
  const t = str(v);
  if (!t) return null;
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/.exec(t);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4] ?? "0", m[5] ?? "0", m[6] ?? "0"].map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  return zoned(y, mo, d, h, mi, s, tz);
}

const PARTS = (tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
/** the local day (YYYY-MM-DD) of a moment */
export const localDay = (d: Date, tz: string) => PARTS(tz).format(d);
/** the first of the local month (YYYY-MM-01) */
export const localMonth = (d: Date, tz: string) => PARTS(tz).format(d).slice(0, 7) + "-01";

// --------------------------------------------------------------- tallies
export type Drops = Record<string, { count: number; examples: string[] }>;
export function tally(limit = 5) {
  const d: Drops = {};
  return {
    d,
    add(reason: string, example: unknown) {
      const e = (d[reason] ??= { count: 0, examples: [] });
      e.count += 1;
      if (e.examples.length < limit) e.examples.push(String(example));
    },
    total: () => Object.values(d).reduce((a, x) => a + x.count, 0),
  };
}

export function countBy<T>(rows: T[], f: (r: T) => string | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = f(r);
    if (k != null) out[k] = (out[k] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
}
