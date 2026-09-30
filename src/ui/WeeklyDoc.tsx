"use client";
/** A Weekly Competitor Pulse in the Library: the downloads first, then the three-line summary, the movers and the actions. */
import { useRouter } from "next/navigation";
import type { WeeklyBlocks } from "@/competitor/scheduled";
import type { ReportFileMeta } from "@/reports/files";

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function WeeklyDoc({ report, files }: { report: { id: string; title: string; created_at: string; blocks: WeeklyBlocks }; files: ReportFileMeta[] }) {
  const router = useRouter();
  const b = report.blocks;
  return (
    <article className="doc weeklydoc">
      <header>
        <div>
          <h2>{b.title}: {b.week.label}</h2>
          <p>Prepared for {b.client} · against {b.previous_week} · data through {b.data_as_of} · made {new Date(report.created_at).toLocaleString("en-GB", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} WIB</p>
        </div>
        {b.narrative_by === "fallback" && <span className="pill" title={b.narrative_problems.join("\n") || "The model was not available"}>plain wording</span>}
      </header>
      <section className="wfiles">
        {files.length === 0 && <span className="muted">No files were kept for this report.</span>}
        {files.map((f) => (
          <a key={f.id} className={`wfile ${f.format}`} href={`/api/reports/files/${f.id}`}>
            <b>{f.format === "pptx" ? "PowerPoint" : "PDF"}</b>
            <span>{f.filename} · {kb(f.bytes)}</span>
          </a>
        ))}
      </section>
      <section>
        <div className="wsummary">
          {b.summary.map((s) => (
            <div key={s.label}><span className="l">{s.label}</span><b>{s.stat}</b><small>{s.stat_label}</small><p>{s.text}</p></div>
          ))}
        </div>
      </section>
      <section>
        <h4>{b.movers_title}</h4>
        {b.movers.length === 0 ? <p className="muted">A quiet week: no watchlist brand moved outside its own normal range.</p> : (
          <ul className="wmovers">
            {b.movers.map((m) => (
              <li key={m.name + m.platform}><b>{m.name}</b> · {m.platform}: {m.measure.toLowerCase()} <span className={m.direction === "up" ? "up" : "down"}>{m.direction === "up" ? "▲" : "▼"} {m.value}</span> <span className="muted">(last week {m.previous})</span>{m.why && <p>{m.why}</p>}</li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h4>What {b.client} should do this week</h4>
        <ol className="wactions-list">
          {b.actions.map((a) => <li key={a.title}><b>{a.title}</b><p>{a.detail}</p><small>{a.brands.join(", ")} · based on {a.based_on}</small></li>)}
        </ol>
        {b.portfolio_note && <p className="muted" style={{ marginTop: 10 }}>{b.client}: {b.portfolio_note}</p>}
      </section>
      <section style={{ display: "flex", gap: 8 }}>
        <button className="btn sm ghost" onClick={async () => { if (!confirm("Delete this report and its files?")) return; await fetch(`/api/reports/${report.id}`, { method: "DELETE" }); router.push("/reports"); router.refresh(); }}>Delete</button>
      </section>
    </article>
  );
}
