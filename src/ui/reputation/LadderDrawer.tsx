"use client";
/**
 * "Why this level?" on the PR status (CMS plan, The Builder): the rule in words, sliders to
 * try another threshold, and the last 90 days replayed under both. Every count comes from
 * the server (src/reputation/replay.ts); a Builder can apply the tried rule for everyone.
 */
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import type { Replay } from "@/reputation/replay";

const LABEL: Record<string, string> = { calm: "Calm", watch: "Watch", issue: "Issue", crisis: "Crisis", recovering: "Recovering" };
const dm = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

type Alert = { negative_multiple: number; min_comments: number; baseline_days: number; crisis_multiple?: number; crisis_min_negative?: number };

export function LadderDrawer({ brand, alert, builder }: { brand: string; alert: Alert; builder: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [a, setA] = useState<Alert>({ ...alert, crisis_multiple: alert.crisis_multiple ?? Math.round(alert.negative_multiple * 1.5 * 100) / 100, crisis_min_negative: alert.crisis_min_negative ?? alert.min_comments });
  const [r, setR] = useState<Replay | null>(null);
  // only what the person moved is tried and applied; the rest stays as the team has it
  const [touched, setTouched] = useState<(keyof Alert)[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!open) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const q = new URLSearchParams({ brand, ...Object.fromEntries(touched.map((k) => [k, String(a[k])])) });
      void fetch(`/api/builder/ladder?${q}`).then((x) => x.json()).then((j) => { if (!j.error) setR(j); });
    }, 250);
  }, [open, a, brand, touched]);
  async function apply() {
    if (!r) return;
    setBusy(true); setMsg("");
    const n = r.alert.next as Alert;
    const changes = Object.fromEntries(touched.map((k) => [`alert.${k}`, n[k] ?? null]));
    const res = await fetch("/api/builder/company", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "apply", changes, note: "Changed the status ladder from Why this level?" }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg(j.error ?? "That did not work."); return; }
    setOpen(false);
    router.refresh();
  }
  if (!open) return <button className="linkish why" onClick={() => setOpen(true)}>Why this level?</button>;
  const slider = (k: keyof Alert, lo: number, hi: number, step: number, label: string, unit = "") => (
    <label className="slide"><span>{label}</span><input type="range" min={lo} max={hi} step={step} value={a[k] ?? lo} onChange={(e) => { setA({ ...a, [k]: Number(e.target.value) }); setTouched((t) => (t.includes(k) ? t : [...t, k])); }} /><b>{a[k]}{unit}</b></label>
  );
  const changed = r ? JSON.stringify(r.alert.now) !== JSON.stringify(r.alert.next) : false;
  return createPortal(
    <div className="drawer" role="dialog" aria-label="Why this level?">
      <div className="drawer-in wide">
        <header><h3>Why this level?</h3><button className="x" onClick={() => setOpen(false)} aria-label="Close">×</button></header>
        <p className="muted">{r?.rule.now ?? "Reading the last 90 days…"}</p>
        <h4>Try another rule</h4>
        {slider("negative_multiple", 1.5, 4, 0.1, "Issue at", "×")}
        {slider("crisis_multiple", 2, 6, 0.1, "Crisis at", "×")}
        {slider("crisis_min_negative", 20, 500, 10, "Crisis needs", " negative")}
        {slider("min_comments", 20, 500, 10, "A day needs", " comments")}
        {r && (
          <>
            <h4>The last 90 days, {dm(r.from)} to {dm(r.to)}</h4>
            <div className="replay">
              <div><small>Now</small><div className="prladder">{r.days.map((x) => <i key={x.d} className={x.now} title={`${dm(x.d)}: ${LABEL[x.now]}, ${x.negative} negative of ${x.comments}`} />)}</div></div>
              <div><small>Tried</small><div className="prladder">{r.days.map((x) => <i key={x.d} className={x.next} title={`${dm(x.d)}: ${LABEL[x.next]}`} />)}</div></div>
            </div>
            <table className="changes counts"><thead><tr><th /><th>Watch</th><th>Issue</th><th>Crisis</th></tr></thead>
              <tbody>
                <tr><td>Now</td><td>{r.counts.now.watch}</td><td>{r.counts.now.issue}</td><td>{r.counts.now.crisis}</td></tr>
                <tr><td>Tried</td><td>{r.counts.next.watch}</td><td>{r.counts.next.issue}</td><td>{r.counts.next.crisis}</td></tr>
              </tbody></table>
            {r.changed.length > 0 ? <p className="muted">{r.changed.length} day{r.changed.length === 1 ? "" : "s"} would read differently, most recently {r.changed.slice(0, 3).map((x) => `${dm(x.d)} (${LABEL[x.now]} → ${LABEL[x.next]})`).join(", ")}.</p> : changed ? <p className="muted">No day in the last 90 would read differently.</p> : null}
            {changed && <p className="muted">{r.rule.next}</p>}
          </>
        )}
        <footer>
          {msg && <span className="err">{msg}</span>}
          {!builder && changed && <span className="muted">Only a Builder can change the rule for the team.</span>}
          {builder && <button className="btn pri sm" disabled={busy || !changed} onClick={apply}>Apply for everyone</button>}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
