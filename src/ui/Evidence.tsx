import type { Evidence } from "@/skills/types";
import { fmtNum, PF } from "./format";

export function EvidenceList({ items, title }: { items: Evidence[]; title?: string }) {
  if (!items.length) return null;
  return (
    <div className="evidence on">
      {title && <h4>{title}</h4>}
      {items.map((e) => {
        const pf = e.type === "post" ? (PF[(e.label.split(" · ")[2] ?? "").toLowerCase()] ?? PF.aggregate) : (PF[e.type] ?? PF.aggregate);
        const metrics = Object.entries(e.metrics ?? {}).filter(([, v]) => v != null).slice(0, 4);
        return (
          <div className="post" key={e.id}>
            <div className="pf" style={{ background: pf.color }}>{pf.label}</div>
            <div className="t">
              <b>{e.id}</b> — {e.url ? <a href={e.url} target="_blank" rel="noreferrer">{e.label}</a> : e.label}
              {e.sample_text && <small>“{e.sample_text}”</small>}
              {!e.sample_text && <small>{e.ref}</small>}
            </div>
            <div className="n">{metrics.map(([k, v]) => <div key={k}>{fmtNum(v)} {k.replace(/_/g, " ")}</div>)}</div>
          </div>
        );
      })}
    </div>
  );
}
