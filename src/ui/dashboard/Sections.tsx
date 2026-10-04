/**
 * Lays out a Dashboard's sections in the order its role asks for (src/dashboard/sections.ts):
 * hidden ones left out with a small line that says so, two half-width sections side by side.
 */
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { rows, type Arranged } from "@/dashboard/sections";

export function Sections({ arranged, render, who, showHref }: { arranged: Arranged; render: Record<string, (title: string) => ReactNode>; who: string | null; showHref: string }) {
  const title = (k: string) => arranged.shown.find((x) => x.key === k)!.title;
  return (
    <>
      {rows(arranged.shown).map((row) =>
        row.length === 2 ? (
          <div className="two-eq" key={row.map((s) => s.key).join("+")}>
            {row.map((s) => <Fragment key={s.key}>{render[s.key]?.(title(s.key))}</Fragment>)}
          </div>
        ) : (
          <Fragment key={row[0].key}>{render[row[0].key]?.(title(row[0].key))}</Fragment>
        ),
      )}
      {arranged.hidden.length > 0 && (
        <p className="hiddennote">
          {arranged.hidden.map((s) => s.title).join(", ")} hidden{who ? ` for ${who}` : ""} · <Link href={showHref}>Show</Link>
        </p>
      )}
    </>
  );
}
