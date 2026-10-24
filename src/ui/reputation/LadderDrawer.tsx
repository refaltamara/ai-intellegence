"use client";
/**
 * "Why this level?" on the PR status (CMS plan, The Builder): the rule in words, sliders to
 * try another threshold, and the last 90 days replayed under both. Every count comes from
 * the server (src/reputation/replay.ts); a Builder can apply the tried rule for everyone.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Replay } from "@/reputation/replay";
import type { Level } from "@/reputation/dashboard";
import { Button } from "../kit/Button";
import { Drawer } from "../kit/Drawer";
import { Skel } from "../kit/Skeleton";
import { TABLE, TABLE_FRAME, TD, TD_NUM, TH, TH_NUM, THEAD, TR } from "../kit/Table";
import { LadderStrip } from "./parts/common";

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
  const slider = (k: keyof Alert, lo: number, hi: number, step: number, label: string, unit = "") => (
    <label className="grid grid-cols-[1fr_auto] items-center gap-x-3 text-sm text-gray-700 sm:grid-cols-[7.5rem_1fr_6.5rem]">
      <span className="font-semibold">{label}</span>
      <input type="range" min={lo} max={hi} step={step} value={a[k] ?? lo} className="order-last col-span-2 h-11 w-full cursor-pointer accent-brand-palette-600 sm:order-none sm:col-span-1"
        onChange={(e) => { setA({ ...a, [k]: Number(e.target.value) }); setTouched((t) => (t.includes(k) ? t : [...t, k])); }} />
      <b className="text-right font-semibold tabular-nums text-gray-900">{a[k]}{unit}</b>
    </label>
  );
  const changed = r ? JSON.stringify(r.alert.now) !== JSON.stringify(r.alert.next) : false;
  return (
    <>
      <Button variant="link" size="sm" className="min-h-8 px-1 max-md:min-h-11" onClick={() => setOpen(true)}>Why this level?</Button>
      <Drawer wide open={open} title="Why this level?" onClose={() => setOpen(false)} footer={(msg || (!builder && changed) || builder) ? (
        <>
          {msg && <span role="alert" className="mr-auto text-sm text-red-700">{msg}</span>}
          {!builder && changed && <span className="text-sm text-gray-500">Only a Builder can change the rule for the team.</span>}
          {builder && <Button size="sm" isLoading={busy} loadingLabel="Applying…" disabled={busy || !changed} onClick={apply}>Apply for everyone</Button>}
        </>
      ) : undefined}>
        <p className="text-sm leading-relaxed text-gray-600">{r?.rule.now ?? "Reading the last 90 days…"}</p>
        <h3 className="text-sm font-semibold text-gray-900">Try another rule</h3>
        <div className="flex flex-col">
          {slider("negative_multiple", 1.5, 4, 0.1, "Issue at", "×")}
          {slider("crisis_multiple", 2, 6, 0.1, "Crisis at", "×")}
          {slider("crisis_min_negative", 20, 500, 10, "Crisis needs", " negative")}
          {slider("min_comments", 20, 500, 10, "A day needs", " comments")}
        </div>
        {!r ? (
          <div role="status" className="flex flex-col gap-2"><span className="sr-only">Reading the last 90 days…</span><Skel className="h-4 w-56" /><Skel className="h-5 w-full" /><Skel className="h-5 w-full" /></div>
        ) : (
          <>
            <h3 className="text-sm font-semibold text-gray-900">The last 90 days, {dm(r.from)} to {dm(r.to)}</h3>
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-[3.5rem_1fr] items-center gap-2"><small className="text-xs text-gray-500">Now</small><LadderStrip label="Now, day by day" days={r.days.map((x) => ({ d: x.d, level: x.now as Level, title: `${dm(x.d)}: ${LABEL[x.now]}, ${x.negative} negative of ${x.comments}` }))} /></div>
              <div className="grid grid-cols-[3.5rem_1fr] items-center gap-2"><small className="text-xs text-gray-500">Tried</small><LadderStrip label="Tried, day by day" days={r.days.map((x) => ({ d: x.d, level: x.next as Level, title: `${dm(x.d)}: ${LABEL[x.next]}` }))} /></div>
            </div>
            <div className={TABLE_FRAME}>
              <table className={TABLE}>
                <thead className={THEAD}><tr><th className={TH}><span className="sr-only">Rule</span></th><th className={TH_NUM}>Watch</th><th className={TH_NUM}>Issue</th><th className={TH_NUM}>Crisis</th></tr></thead>
                <tbody>
                  <tr className={TR}><td className={TD}>Now</td><td className={TD_NUM}>{r.counts.now.watch}</td><td className={TD_NUM}>{r.counts.now.issue}</td><td className={TD_NUM}>{r.counts.now.crisis}</td></tr>
                  <tr className={TR}><td className={TD}>Tried</td><td className={TD_NUM}>{r.counts.next.watch}</td><td className={TD_NUM}>{r.counts.next.issue}</td><td className={TD_NUM}>{r.counts.next.crisis}</td></tr>
                </tbody>
              </table>
            </div>
            {r.changed.length > 0 ? <p className="text-sm text-gray-600">{r.changed.length} day{r.changed.length === 1 ? "" : "s"} would read differently, most recently {r.changed.slice(0, 3).map((x) => `${dm(x.d)} (${LABEL[x.now]} → ${LABEL[x.next]})`).join(", ")}.</p> : changed ? <p className="text-sm text-gray-600">No day in the last 90 would read differently.</p> : null}
            {changed && <p className="text-sm text-gray-600">{r.rule.next}</p>}
          </>
        )}
      </Drawer>
    </>
  );
}
