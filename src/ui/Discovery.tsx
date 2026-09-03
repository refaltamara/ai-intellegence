"use client";
/** /discovery result screen (PRD §5.6, §8): parsed filter chips, run line, table, actions. */
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { Evidence, SkillResult } from "@/skills/types";
import { EvidenceList } from "./Evidence";
import { fmtDate, fmtNum } from "./format";
import { MultiSelect } from "./MultiSelect";

const TIERS = ["nano", "micro", "mid", "macro", "mega"];
const TIER_LABEL: Record<string, string> = { nano: "Nano · ≤10K", micro: "Micro · 10K–50K", mid: "Mid · 50K–500K", macro: "Macro · 500K–1M", mega: "Mega · 1M+" };
const RANK_LABEL: Record<string, string> = { views: "Views (total in window)", avg_views: "Avg views per post", comment_rate: "Comment rate", er_pct: "Engagement rate", views_per_1k: "Views per 1k followers", median_views: "Median views" };
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-03" -> "Mar 2026" */
export function monthLabel(m: string): string {
  const [y, mm] = m.split("-").map(Number);
  return `${MONTH_NAMES[(mm ?? 1) - 1]} ${y}`;
}
/** Selected months (YYYY-MM) -> one contiguous {from,to}; months between the first and last are included. */
export function monthsToWindow(months: string[]): { from: string; to: string } | null {
  if (!months.length) return null;
  const sorted = [...months].sort();
  const [ly, lm] = sorted[sorted.length - 1].split("-").map(Number);
  const lastDay = new Date(Date.UTC(ly, lm, 0)).getUTCDate();
  return { from: `${sorted[0]}-01`, to: `${sorted[sorted.length - 1]}-${String(lastDay).padStart(2, "0")}` };
}
function monthsBetween(months: string[]): number {
  if (months.length < 2) return 0;
  const sorted = [...months].sort();
  const idx = (m: string) => { const [y, mm] = m.split("-").map(Number); return y * 12 + mm; };
  return idx(sorted[sorted.length - 1]) - idx(sorted[0]) + 1 - sorted.length;
}

type Form = { platform: string; tiers: string[]; used_by: string[]; exclude_used_by: string[]; rank_by: string; months: string[]; min_followers: string; max_followers: string; limit: string };

export function Discovery({ brands, months }: { brands: { id: string; name: string; hint?: string }[]; months: string[] }) {
  const sp = useSearchParams();
  const router = useRouter();
  const runId = sp.get("run");
  const [result, setResult] = useState<SkillResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [form, setForm] = useState<Form>({ platform: "tiktok", tiers: [], used_by: [], exclude_used_by: [], rank_by: "views", months: months.slice(-3), min_followers: "", max_followers: "", limit: "50" });
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const toggleIn = (k: "tiers" | "months", v: string) => set(k, form[k].includes(v) ? form[k].filter((x) => x !== v) : [...form[k], v]);
  const gap = monthsBetween(form.months);
  const minF = Number(form.min_followers), maxF = Number(form.max_followers);
  const followersInvalid = form.min_followers !== "" && form.max_followers !== "" && minF > maxF;
  const [toast, setToast] = useState("");
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2200); };

  useEffect(() => {
    if (!runId) return;
    setLoading(true);
    fetch(`/api/runs/${runId}`).then(async (r) => {
      if (!r.ok) throw new Error(`run not found (${r.status})`);
      const j = await r.json();
      if (j.skill !== "discovery") throw new Error(`run ${runId} is a /${j.skill} run, not /discovery`);
      setResult(j.result as SkillResult);
    }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [runId]);

  async function run() {
    if (followersInvalid) { setError("Min followers is above max followers."); return; }
    setLoading(true); setError("");
    const window = monthsToWindow(form.months) ?? { last_n_days: 90 };
    const params: Record<string, unknown> = { platform: form.platform, rank_by: form.rank_by, limit: Number(form.limit) || 50, window };
    if (form.tiers.length) params.tiers = form.tiers;
    if (form.used_by.length) params.used_by = form.used_by;
    if (form.exclude_used_by.length) params.exclude_used_by = form.exclude_used_by;
    if (form.min_followers !== "" && Number.isFinite(minF)) params.min_followers = minF;
    if (form.max_followers !== "" && Number.isFinite(maxF)) params.max_followers = maxF;
    const r = await fetch("/api/skills/discovery/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ params }) });
    const j = (await r.json()) as SkillResult;
    setLoading(false);
    if (j.status !== "ok") { setError(j.message ?? j.status); setResult(j); return; }
    if (j.run_id) router.push(`/skills/discovery?run=${j.run_id}`); else setResult(j);
  }

  function exportCsv() {
    if (!result) return;
    const cols = ["creator_handle", "platform", "followers", "tier", "posts", "brand_count", "used_by", "last_brand_post_at", "views", "avg_views", "median_views", "comment_rate_pct", "er_pct", "views_per_1k", "for_you"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [cols.join(","), ...result.rows.map((r) => cols.map((c) => esc(c === "used_by" ? ((r.used_by as any[]) ?? []).map((u) => `${u.brand}×${u.posts}`).join("; ") : r[c])).join(","))];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `discovery-${runId ?? "run"}.csv`; a.click();
  }

  const p = (result?.params_resolved ?? {}) as Record<string, any>;
  const s = (result?.summary ?? {}) as Record<string, any>;
  const evidence: Record<string, Evidence> = Object.fromEntries((result?.evidence ?? []).map((e) => [e.id, e]));
  const brandName = (id: string) => brands.find((b) => b.id === id)?.name ?? id;
  const chips = result ? [
    ["Platform", p.platform === "all" ? "All" : String(p.platform)],
    ["Tier", (p.tiers as string[] | undefined)?.length ? (p.tiers as string[]).map((t) => TIER_LABEL[t] ?? t).join(", ") : "Any"],
    ["Used by", (p.used_by as string[] | undefined)?.length ? (p.used_by as string[]).map(brandName).join(", ") : "Any tracked brand"],
    ["Window", `${p.window?.from} to ${p.window?.to}`],
    ["Exclude", (p.exclude_used_by as string[] | undefined)?.length ? (p.exclude_used_by as string[]).map(brandName).join(", ") : "Nothing (no client brand)"],
    ["Followers", p.min_followers != null || p.max_followers != null ? `${p.min_followers != null ? fmtNum(p.min_followers) : "0"} – ${p.max_followers != null ? fmtNum(p.max_followers) : "any"}` : "Any"],
    ["Rank by", RANK_LABEL[String(p.rank_by ?? "views")] ?? String(p.rank_by).replace(/_/g, " ")],
  ] : [];

  return (
    <section className="screen">
      <div className="topbar">
        <div><h1><span className="slash">/</span>discovery</h1><span className="meta">Creators layer</span></div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn sm" onClick={() => showToast("Shortlists arrive with Agents (M3)")}>Save shortlist</button>
          <button className="btn sm" onClick={exportCsv} disabled={!result?.rows?.length}>Export CSV</button>
          <button className="btn pri sm" disabled={!runId || !result} onClick={async () => {
            const r = await fetch("/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from_skill_run_id: runId }) });
            const j = await r.json();
            if (j.error) { showToast(j.error); return; }
            showToast(`Agent "${j.agent.name}" created`); setTimeout(() => router.push("/agents"), 900);
          }}>Run this weekly</button>
        </div>
      </div>
      <div className="wrap wide">
        {!runId && (
          <div className="form">
            <label>Platform<select value={form.platform} onChange={(e) => set("platform", e.target.value)}><option value="tiktok">TikTok</option><option value="instagram">Instagram</option><option value="all">All</option></select></label>
            <label>Rank by<select value={form.rank_by} onChange={(e) => set("rank_by", e.target.value)}>{Object.entries(RANK_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label>Followers<div className="pair"><input inputMode="numeric" value={form.min_followers} onChange={(e) => set("min_followers", e.target.value.replace(/[^\d]/g, ""))} placeholder="min" /><input inputMode="numeric" value={form.max_followers} onChange={(e) => set("max_followers", e.target.value.replace(/[^\d]/g, ""))} placeholder="max" /></div>{followersInvalid && <span className="hint" style={{ color: "var(--amber)" }}>min is above max</span>}</label>
            <label>Limit<input inputMode="numeric" value={form.limit} onChange={(e) => set("limit", e.target.value.replace(/[^\d]/g, ""))} /></label>
            <label className="wide">Tiers <span className="hint">{form.tiers.length ? `${form.tiers.length} selected` : "none selected = any tier"}</span>
              <div className="tog">{TIERS.map((t) => <button type="button" key={t} className={form.tiers.includes(t) ? "on" : ""} onClick={() => toggleIn("tiers", t)}>{TIER_LABEL[t]}</button>)}</div>
            </label>
            <label className="wide">Months <span className="hint">{form.months.length === 0 ? "none selected = last 90 days of data" : gap > 0 ? `${gap} month${gap > 1 ? "s" : ""} in between included too (one continuous window)` : `${form.months.length} selected`}</span>
              <div className="tog">{months.map((m) => <button type="button" key={m} className={form.months.includes(m) ? "on" : ""} onClick={() => toggleIn("months", m)}>{monthLabel(m)}</button>)}
                <button type="button" onClick={() => set("months", form.months.length === months.length ? [] : [...months])} style={{ borderStyle: "dashed" }}>{form.months.length === months.length ? "Clear" : "All"}</button></div>
            </label>
            <label className="wide">Used by brands <span className="hint">creator must have posted for any of these; empty = any tracked brand</span>
              <MultiSelect options={brands} value={form.used_by} onChange={(v) => set("used_by", v)} placeholder="Search a brand…" />
            </label>
            <label className="wide">Exclude used by <span className="hint">creator must not have posted for these</span>
              <MultiSelect options={brands} value={form.exclude_used_by} onChange={(v) => set("exclude_used_by", v)} placeholder="Search a brand…" />
            </label>
            <div className="actions"><button className="btn pri" onClick={run} disabled={loading || followersInvalid}>{loading ? "Running…" : "Run /discovery"}</button></div>
          </div>
        )}
        {error && <div className="errbox" style={{ marginBottom: 16 }}>{error}</div>}
        {loading && runId && <div className="status">Loading run…</div>}
        {result && result.status === "ok" && (
          <>
            <div className="query">
              <div className="q-text"><span className="slash">/</span>discovery &nbsp;{s.matched?.toLocaleString?.() ?? s.matched} creators matched · ranked by {(RANK_LABEL[String(s.rank_by ?? "")] ?? String(s.rank_by ?? "").replace(/_pct$/, "").replace(/_/g, " ")).toLowerCase()}</div>
              <div className="q-parsed">{chips.map(([k, v]) => <span className="f" key={k}><small>{k}</small>{v}</span>)}</div>
            </div>
            <div className="runinfo">
              <div><b>Matched {fmtNum(s.matched)}</b> of {fmtNum(s.of_total_creators)} creators in the database, returning the top {result.rows.length}. Ranked by {(RANK_LABEL[String(s.rank_by ?? "")] ?? String(s.rank_by ?? "").replace(/_/g, " ")).toLowerCase()}{s.min_views ? `, among creators with at least ${fmtNum(s.min_views)} views in the window` : ""}. {result.meta.caveats[0]}</div>
              <div className="fresh"><span className="pill live">Data through {fmtDate(result.meta.freshness)}</span><span className="pill">{result.meta.duration_ms} ms · run {String(runId ?? "").slice(0, 8)}</span></div>
            </div>
            <div className="tablewrap">
              <table>
                <thead><tr><th>#</th><th>Creator</th><th className="num">Followers</th><th>Used by</th><th>Last brand post</th><th className="num">Views</th><th className="num">Avg views</th><th className="num">Comment rate</th><th className="num">ER</th><th className="num">Views / 1k</th><th>For you</th></tr></thead>
                <tbody>
                  {result.rows.map((r, i) => (
                    <tr key={String(r.creator_id)} onClick={() => setOpenRow(openRow === r.creator_id ? null : String(r.creator_id))}>
                      <td className="rank">{i + 1}</td>
                      <td><div className="cr"><div className="pf" style={{ background: r.platform === "tiktok" ? "#0F1B2D" : "#E1306C" }}>{String(r.creator_handle).slice(0, 2).toUpperCase()}</div><div><b>@{String(r.creator_handle)}</b><small>{String(r.platform)} · {String(r.tier ?? "tier unknown")}</small></div></div></td>
                      <td className="num">{fmtNum(r.followers)}</td>
                      <td><div className="used">{((r.used_by as any[]) ?? []).slice(0, 4).map((u) => <span key={u.brand}>{brandName(u.brand)}<i>×{u.posts}</i></span>)}</div></td>
                      <td>{fmtDate(r.last_brand_post_at)}</td>
                      <td className="num"><b>{fmtNum(r.views)}</b></td>
                      <td className="num">{fmtNum(r.avg_views)}</td>
                      <td className="num">{fmtNum(r.comment_rate_pct)}%</td>
                      <td className="num">{fmtNum(r.er_pct)}%</td>
                      <td className="num">{fmtNum(r.views_per_1k)}</td>
                      <td><span className="never">{String(r.for_you ?? "never")}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="more"><span>Click a creator to see the posts behind the numbers</span><span>{result.meta.matched > result.rows.length ? `${fmtNum(result.meta.matched - result.rows.length)} more matched; raise the limit to see them` : "All matches shown"}</span></div>
            </div>
            {openRow && (() => {
              const row = result.rows.find((r) => r.creator_id === openRow);
              const ids = ((row?.evidence_ids as string[]) ?? []);
              return <div style={{ marginTop: 12 }}><EvidenceList items={ids.map((id) => evidence[id]).filter(Boolean)} title={`Evidence · @${String(row?.creator_handle)}`} /></div>;
            })()}
          </>
        )}
        {result && result.status !== "ok" && !error && <div className="unavail">{result.message}</div>}
        {!runId && !result && !loading && <div className="empty">Set filters and run, or type <b>/discovery …</b> in Ask and it opens here.</div>}
      </div>
      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </section>
  );
}
