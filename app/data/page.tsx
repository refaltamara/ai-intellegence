import { registry } from "@/skills/registry";
import { workspaceStats } from "@/ui/stats";
import { SkillDb } from "@/skills/db";
import { loadContext } from "@/skills/params";
import { fmtNum } from "@/ui/format";

export const dynamic = "force-dynamic";

export default async function DataPage() {
  const s = await workspaceStats();
  const ctx = await loadContext(new SkillDb());
  const pct = (a: number, b: number) => Math.round((a / b) * 100);
  return (
    <section className="screen">
      <div className="topbar"><div><h1>Data</h1><span className="meta">What every answer is built from</span></div><span className="pill live">Last load {s.last_load ?? "–"} WIB · data through {s.freshness}</span></div>
      <div className="wrap wide">
        <div className="cats"><span className="on">Beauty · Indonesia</span></div>
        <div className="stats">
          <div className="stat"><b>{s.brands}</b><span>brands tracked · {ctx.brands.filter((b) => b.tiktok_handle && b.instagram_handle).length} on both platforms</span></div>
          <div className="stat"><b>{fmtNum(s.creators)}</b><span>creators with brand history and performance</span></div>
          <div className="stat"><b>{fmtNum(s.posts)}</b><span>post rows · {fmtNum(s.unique_posts)} unique posts</span></div>
          <div className="stat"><b>{s.comments}</b><span>comments classified · Phase 2, not loaded</span></div>
        </div>
        <div className="layers">
          {s.per_platform.map((p) => (
            <div className="layer" key={p.platform}><h4>{p.platform === "tiktok" ? "TikTok" : "Instagram"}</h4><p>{fmtNum(p.posts)} posts from {fmtNum(p.creators)} creators, {p.first_month} to {p.last_month}. {p.platform === "tiktok" ? "Keyword capture plus owned accounts; shoppable-link flag recorded." : "Tag-based capture; no owned posts, no shares or saves."}</p><small>Powers {registry.skills.filter((k) => !k.platforms || k.platforms.includes(p.platform)).filter((k) => k.phase === 1).map((k) => "/" + k.name).join(", ")}</small></div>
          ))}
          <div className="layer"><h4>Comments, snapshots, Threads &amp; X</h4><p>Not loaded. Comment-layer, audience, velocity, forecast and narrative skills report themselves as unavailable until these land.</p><small>Phase 1b and Phase 2</small></div>
        </div>
        <h4 style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 10, fontWeight: 600 }}>Capture coverage per month</h4>
        <div className="tablewrap" style={{ marginBottom: 24 }}>
          <table>
            <thead><tr><th>Platform</th><th>Month</th><th className="num">Posts</th><th className="num">Days captured</th><th>Coverage</th></tr></thead>
            <tbody>{s.per_month.map((m) => <tr key={m.platform + m.month}><td>{m.platform}</td><td>{m.month}</td><td className="num">{fmtNum(m.posts)}</td><td className="num">{m.days_captured}/{m.days_in_month}</td><td><div className="bar" style={{ width: 120 }}><i style={{ width: `${pct(m.days_captured, m.days_in_month)}%`, background: pct(m.days_captured, m.days_in_month) < 100 ? "var(--amber)" : "var(--green)" }} /></div></td></tr>)}</tbody>
          </table>
        </div>
        <h4 style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 10, fontWeight: 600 }}>Recent loads</h4>
        <div className="tablewrap" style={{ marginBottom: 24 }}>
          <table>
            <thead><tr><th>File</th><th>Platform</th><th className="num">Rows in</th><th className="num">Loaded</th><th className="num">Rejected</th><th>Finished (WIB)</th></tr></thead>
            <tbody>{s.loads.map((l, i) => <tr key={i} style={{ cursor: "default" }}><td>{l.file}</td><td>{l.platform ?? "–"}</td><td className="num">{fmtNum(l.rows_in)}</td><td className="num">{fmtNum(l.rows_loaded)}</td><td className="num">{fmtNum(l.rows_rejected)}</td><td>{l.finished_at ?? "running"}</td></tr>)}</tbody>
          </table>
        </div>
        <h4 style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 10, fontWeight: 600 }}>Brands in this workspace</h4>
        <div className="grid-b">
          {ctx.brands.map((b) => <div className={`bchip ${b.is_client ? "me" : ""}`} key={b.id} title={b.id}>{b.name}<small>{b.tiktok_handle && b.instagram_handle ? "TikTok + IG" : b.tiktok_handle ? "TikTok" : "Instagram"}</small></div>)}
        </div>
      </div>
    </section>
  );
}
