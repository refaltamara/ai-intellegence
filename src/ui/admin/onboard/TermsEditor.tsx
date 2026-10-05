"use client";
/**
 * Relevance terms per brand (CMS plan, "Relevance"): counts and never lists, a live preview
 * of the share of the brand's posts that would count by platform with the posts that would
 * flip each way, and Apply, which recomputes the brand's posts and refreshes the views.
 */
import { useEffect, useRef, useState } from "react";
import type { TermsPreview } from "@/onboard/terms";
import { useOnboard } from "./useOnboard";

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "–");
const n = (x: number | null) => (x == null ? "–" : x >= 1e6 ? `${(x / 1e6).toFixed(1)}M` : x >= 1e3 ? `${(x / 1e3).toFixed(1)}K` : String(x));

export function TermsEditor({ ws, brands }: { ws: string; brands: { id: string; name: string; terms: string[]; never: string[] }[] }) {
  const { busy, error, call, runJob } = useOnboard(ws);
  const [brand, setBrand] = useState(brands[0]?.id ?? "");
  const b = brands.find((x) => x.id === brand);
  const [terms, setTerms] = useState(b?.terms.join(", ") ?? "");
  const [never, setNever] = useState(b?.never.join(", ") ?? "");
  const [p, setP] = useState<TermsPreview | null>(null);
  const [msg, setMsg] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const list = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);
  useEffect(() => { const x = brands.find((y) => y.id === brand); setTerms(x?.terms.join(", ") ?? ""); setNever(x?.never.join(", ") ?? ""); setMsg(""); }, [brand, brands]);
  useEffect(() => {
    if (!brand) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await fetch("/api/admin/onboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "preview", workspace_id: ws, brand_id: brand, terms: list(terms), never: list(never) }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok) setP(j.preview);
    }, 400);
  }, [brand, terms, never, ws]);
  async function apply() {
    const j = await call("terms", { brand_id: brand, terms: list(terms), never: list(never), apply: true }, { refresh: false });
    if (!j?.job_id) return;
    setMsg("Applying…");
    await runJob(String(j.job_id), (x) => setMsg(x.error ? x.error : x.status === "done" ? `Applied: ${x.note ?? ""}` : "Applying…"));
  }
  const changed = p ? p.total.now !== p.total.after || p.to_counting.length > 0 || p.to_not.length > 0 : false;
  return (
    <div className="terms">
      <div className="row">
        <label className="wf"><span>Brand</span><select value={brand} onChange={(e) => setBrand(e.target.value)}>{brands.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="wf grow"><span>Counts (a term at the start of a word; CAPITALS only in capitals)</span><input value={terms} onChange={(e) => setTerms(e.target.value)} /></label>
        <label className="wf grow"><span>Never counts</span><input value={never} onChange={(e) => setNever(e.target.value)} placeholder="go pay attention" /></label>
      </div>
      {p && (
        <>
          <div className="tablewrap people"><table>
            <thead><tr><th>Platform</th><th className="num">Posts</th><th className="num">Count now</th><th className="num">Would count</th></tr></thead>
            <tbody>{p.by_platform.map((x) => <tr key={x.platform}><td>{x.platform}</td><td className="num">{x.posts.toLocaleString("en-US")}</td><td className="num">{x.now.toLocaleString("en-US")} <small className="muted">{pct(x.now, x.posts)}</small></td><td className={`num ${x.after !== x.now ? "chg" : ""}`}>{x.after.toLocaleString("en-US")} <small className="muted">{pct(x.after, x.posts)}</small></td></tr>)}
              <tr className="tot"><td>All</td><td className="num">{p.total.posts.toLocaleString("en-US")}</td><td className="num">{p.total.now.toLocaleString("en-US")} <small className="muted">{n(p.total.views_now)} views</small></td><td className="num">{p.total.after.toLocaleString("en-US")} <small className="muted">{n(p.total.views_after)} views</small></td></tr>
            </tbody></table></div>
          <div className="flips">
            <div><h4>Would start counting ({p.to_counting.length}{p.to_counting.length === 10 ? "+" : ""})</h4>{p.to_counting.map((f) => <p key={f.url}><a href={f.url} target="_blank" rel="noreferrer">{f.platform} · {f.handle ? `@${f.handle}` : "?"} · {n(f.views)} views</a> {f.caption}</p>)}{!p.to_counting.length && <p className="muted">None.</p>}</div>
            <div><h4>Would stop counting ({p.to_not.length}{p.to_not.length === 10 ? "+" : ""})</h4>{p.to_not.map((f) => <p key={f.url}><a href={f.url} target="_blank" rel="noreferrer">{f.platform} · {f.handle ? `@${f.handle}` : "?"} · {n(f.views)} views</a> {f.caption}</p>)}{!p.to_not.length && <p className="muted">None.</p>}</div>
          </div>
        </>
      )}
      <div className="row end">
        {error && <span className="err">{error}</span>}
        {msg && <span className="muted">{msg}</span>}
        <button className="btn sm" disabled={!!busy} onClick={() => call("terms", { brand_id: brand, terms: list(terms), never: list(never) })}>Save without applying</button>
        <button className="btn pri sm" disabled={!!busy || !changed} onClick={apply}>Save and apply</button>
      </div>
    </div>
  );
}
