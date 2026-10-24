/**
 * Lays out a Dashboard's sections in the order its role asks for (src/dashboard/sections.ts):
 * hidden ones left out with a small line that says so, two half-width sections side by side.
 * The team's own panels ("p:<key>") are drawn here too (src/ui/dashboard/PanelBuilder.tsx).
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { rows, type Arranged } from "@/dashboard/sections";
import type { PanelData, PanelScope } from "@/dashboard/panels";
import { SeenTile } from "./SeenTile";
import { PanelCard } from "./PanelBuilder";
import { TWO } from "./parts";

export function Sections({ arranged, render: own, who, showHref, panels = [], builder = false, scope }: { arranged: Arranged; render: Record<string, (title: string) => ReactNode>; who: string | null; showHref: string; panels?: PanelData[]; builder?: boolean; scope?: PanelScope }) {
  const title = (k: string) => arranged.shown.find((x) => x.key === k)!.title;
  const render: Record<string, (title: string) => ReactNode> = { ...own, ...Object.fromEntries(panels.map((p) => [p.id, (t: string) => <PanelCard d={p} title={t} builder={builder} scope={scope} />])) };
  return (
    <>
      {rows(arranged.shown).map((row) =>
        row.length === 2 ? (
          <div className={TWO} key={row.map((s) => s.key).join("+")}>
            {row.map((s) => <SeenTile key={s.key} tile={s.key}>{render[s.key]?.(title(s.key))}</SeenTile>)}
          </div>
        ) : (
          <SeenTile key={row[0].key} tile={row[0].key}>{render[row[0].key]?.(title(row[0].key))}</SeenTile>
        ),
      )}
      {arranged.hidden.length > 0 && (
        <p className="text-sm text-gray-500">
          {arranged.hidden.map((s) => s.title).join(", ")} hidden{who ? ` for ${who}` : ""} · <Link href={showHref} className="font-semibold text-brand-palette-700 underline-offset-2 hover:text-brand-palette-800 hover:underline">Show</Link>
        </p>
      )}
    </>
  );
}
