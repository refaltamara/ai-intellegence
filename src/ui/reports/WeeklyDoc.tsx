/** A Weekly Competitor Pulse in Reports: the downloads first, then the three-line summary, the movers and the actions. */
import type { WeeklyBlocks } from "@/competitor/scheduled";
import type { ReportFileMeta } from "@/reports/files";
import { cn } from "../cn";
import { IconDownload } from "../kit/icons";
import { DocCard, MUTED } from "./docParts";

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function WeeklyDoc({ blocks: b, files }: { blocks: WeeklyBlocks; files: ReportFileMeta[] }) {
  return (
    <>
      {files.length === 0 ? (
        <p className={cn(MUTED, "rounded-3xl border border-card-border bg-white p-5")}>No files were kept for this report.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {files.map((f) => (
            <a key={f.id} href={`/api/reports/files/${f.id}`} className="flex min-h-16 items-center gap-3 rounded-3xl border border-card-border bg-white p-4 transition-shadow hover:shadow-md">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-palette-100 text-brand-palette-700"><IconDownload size={22} /></span>
              <span className="flex min-w-0 flex-col">
                <b className="text-sm font-semibold text-gray-900">{f.format === "pptx" ? "PowerPoint" : "PDF"}</b>
                <span className="truncate text-xs text-gray-500" title={f.filename}>{f.filename} · {kb(f.bytes)}</span>
              </span>
            </a>
          ))}
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        {b.summary.map((s) => (
          <div key={s.label} className="flex flex-col gap-1 rounded-3xl border border-card-border bg-white p-5">
            <span className="text-sm text-gray-500">{s.label}</span>
            <b className="text-3xl font-bold tabular-nums text-gray-900">{s.stat}</b>
            <small className="text-xs text-gray-500">{s.stat_label}</small>
            <p className="mt-2 text-sm leading-relaxed text-gray-700">{s.text}</p>
          </div>
        ))}
      </div>
      <DocCard title={b.movers_title}>
        {b.movers.length === 0 ? <p className={MUTED}>A quiet week: no watchlist brand moved outside its own normal range.</p> : (
          <ul className="flex list-none flex-col divide-y divide-card-border">
            {b.movers.map((m) => (
              <li key={m.name + m.platform} className="py-3 text-sm text-gray-700 first:pt-0 last:pb-0">
                <b className="font-semibold text-gray-900">{m.name}</b> · {m.platform}: {m.measure.toLowerCase()}{" "}
                <span className={cn("font-semibold tabular-nums", m.direction === "up" ? "text-green-700" : "text-red-700")}>{m.direction === "up" ? "▲" : "▼"} {m.value}</span>{" "}
                <span className="text-gray-500">(last week {m.previous})</span>
                {m.why && <p className="mt-1 max-w-3xl leading-relaxed text-gray-600">{m.why}</p>}
              </li>
            ))}
          </ul>
        )}
      </DocCard>
      <DocCard title={`What ${b.client} should do this week`}>
        <ol className="flex list-none flex-col gap-4">
          {b.actions.map((a, i) => (
            <li key={a.title} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-palette-100 text-xs font-bold tabular-nums text-brand-palette-800">{i + 1}</span>
              <div className="flex min-w-0 flex-col gap-1">
                <b className="text-sm font-semibold text-gray-900">{a.title}</b>
                <p className="max-w-3xl text-sm leading-relaxed text-gray-700">{a.detail}</p>
                <small className="text-xs text-gray-500">{a.brands.join(", ")} · based on {a.based_on}</small>
              </div>
            </li>
          ))}
        </ol>
        {b.portfolio_note && <p className={MUTED}>{b.client}: {b.portfolio_note}</p>}
      </DocCard>
    </>
  );
}
