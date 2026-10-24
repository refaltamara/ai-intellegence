import type { Evidence } from "@/skills/types";
import { fmtNum, PF } from "./format";

/** The posts and aggregates behind a number: platform, what it is (linked when it has a url), a quote or its reference, up to four metrics. */
export function EvidenceList({ items, title }: { items: Evidence[]; title?: string }) {
  if (!items.length) return null;
  return (
    <div className="overflow-hidden rounded-2xl border border-card-border bg-white">
      {title && <h4 className="border-b border-card-border bg-gray-50 px-4 py-2.5 text-xs font-semibold text-gray-700">{title}</h4>}
      <ul className="divide-y divide-gray-100">
        {items.map((e) => {
          const pf = e.type === "post" ? (PF[(e.label.split(" · ")[2] ?? "").toLowerCase()] ?? PF.aggregate) : (PF[e.type] ?? PF.aggregate);
          const metrics = Object.entries(e.metrics ?? {}).filter(([, v]) => v != null).slice(0, 4);
          return (
            <li key={e.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
              <span className="mt-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-[10px] font-bold text-white" style={{ background: pf.color }}>{pf.label}</span>
              <div className="min-w-0 text-sm text-gray-800">
                <b className="font-semibold text-gray-900">{e.id}</b>
                <span className="text-gray-400"> · </span>
                {e.url ? <a href={e.url} target="_blank" rel="noreferrer" className="text-brand-palette-700 underline-offset-2 hover:underline">{e.label}</a> : e.label}
                {e.sample_text ? <small className="mt-0.5 block text-xs italic text-gray-500">&ldquo;{e.sample_text}&rdquo;</small> : <small className="mt-0.5 block text-xs text-gray-500">{e.ref}</small>}
              </div>
              {metrics.length > 0 && (
                <div className="col-start-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-600 sm:col-start-3 sm:flex-col sm:items-end sm:text-right">
                  {metrics.map(([k, v]) => <span key={k} className="whitespace-nowrap"><b className="font-semibold tabular-nums text-gray-900">{fmtNum(v)}</b> {k.replace(/_/g, " ")}</span>)}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
