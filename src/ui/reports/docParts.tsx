/**
 * Pieces the report documents share: the section card and the table in DESIGN.md 6.2, which shows a
 * report's rows the way it stored them (which columns to show is each document's own choice).
 */
import type { ReactNode } from "react";
import { cn } from "../cn";
import { CARD, SectionTitle } from "../decks/formParts";
import { fmtDate, fmtNum } from "../format";

export function DocCard({ title, hint, children, className }: { title?: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn(CARD, className)}>
      {title && <SectionTitle title={title} hint={hint} />}
      {children}
    </section>
  );
}

export const LINK = "font-semibold text-brand-palette-700 underline-offset-2 hover:text-brand-palette-800 hover:underline";
export const MUTED = "text-sm text-gray-500";

const TH = "px-3 py-2.5 text-left text-sm font-semibold text-gray-900 whitespace-nowrap";
const TD = "px-3 py-2.5 text-sm text-gray-700";
const DATE_COL = /(_at|posted|last_post|first_post|week_from|week_to)$/;

type Row = Record<string, unknown>;

/** one cell as text: a link for a url, a date for a timestamp, grouped digits for a number */
function cell(c: string, v: unknown): ReactNode {
  if (c === "url" && typeof v === "string") return <a className={LINK} href={v} target="_blank" rel="noreferrer">open</a>;
  if (DATE_COL.test(c) && typeof v === "string") return fmtDate(v);
  if (typeof v === "number") return fmtNum(v);
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v ?? "–");
}

/** rows as the 6.2 table; `bar` draws that column as a share bar (its values are percentages) */
export function DataTable({ rows, cols, bar }: { rows: Row[]; cols: string[]; bar?: string }) {
  const first = rows[0] ?? {};
  const num = (c: string) => typeof first[c] === "number" && c !== bar;
  const barMax = bar ? Math.max(1, ...rows.map((r) => Number(r[bar]) || 0)) : 1;
  return (
    <div className="overflow-x-auto rounded-2xl border border-card-border bg-white">
      <table className="w-full border-collapse">
        <thead className="border-0 border-b border-card-border bg-white">
          <tr>{cols.map((c) => <th key={c} className={cn(TH, num(c) && "text-right")}>{c.replace(/_/g, " ")}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-card-border transition-colors last:border-b-0 even:bg-gray-50/60 hover:bg-brand-palette-50">
              {cols.map((c) => (
                <td key={c} className={cn(TD, num(c) && "text-right tabular-nums whitespace-nowrap")}>
                  {c === bar ? (
                    <span className="flex items-center gap-2">
                      <span className="block h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-gray-100">
                        <span className="block h-full rounded-full bg-brand-palette-600" style={{ width: `${((Number(r[c]) || 0) / barMax) * 100}%` }} />
                      </span>
                      <span className="tabular-nums">{fmtNum(r[c])}%</span>
                    </span>
                  ) : cell(c, r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
