"use client";
/**
 * Set up (or edit) a Weekly Competitor Pulse: who it is for, which brands it
 * watches, the files, the recipients and when it goes out. What is saved is the
 * report's contract (src/competitor/contract.ts); the server checks every brand.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ClientContract as WeeklyContract } from "@/competitor/contract";
import { MultiSelect } from "./MultiSelect";

type Watch = { name: string; brand_ids: string[]; group: "core" | "when_relevant"; untracked?: string[]; short?: string };
export type WeeklyInitial = { id?: string; name?: string; contract: WeeklyContract | null; formats?: string[]; email?: string; cron?: string };

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function fromCron(cron: string | undefined): { day: number; hour: number } {
  const m = /^0 (\d{1,2}) \* \* (\d)$/.exec(cron ?? "");
  return m ? { hour: Number(m[1]), day: Number(m[2]) } : { hour: 7, day: 1 };
}

export function WeeklyForm({ brands, initial, onDone }: { brands: { id: string; name: string }[]; initial: WeeklyInitial; onDone?: (message: string) => void }) {
  const router = useRouter();
  const c = initial.contract;
  const nameOf = new Map(brands.map((b) => [b.id, b.name]));
  // names the contract already gives the client's brands ("Make Over"), kept when the brand stays picked
  const clientNames = new Map((c?.client.brands ?? []).flatMap((b) => b.brand_ids.map((id) => [id, b.name] as const)));
  const [title, setTitle] = useState(c?.title ?? "Weekly Competitor Pulse");
  const [client, setClient] = useState(c?.client.name ?? "");
  const [clientBrands, setClientBrands] = useState<string[]>(c?.client.brands.flatMap((b) => b.brand_ids) ?? []);
  const [watch, setWatch] = useState<Watch[]>(c?.watchlist.map((w) => ({ name: w.name, brand_ids: w.brand_ids ?? [], group: w.group, untracked: w.untracked, short: w.short })) ?? [{ name: "", brand_ids: [], group: "core" }]);
  const [formats, setFormats] = useState<string[]>(initial.formats?.length ? initial.formats : ["pptx", "pdf"]);
  const [email, setEmail] = useState(initial.email ?? "");
  const start = fromCron(initial.cron);
  const [day, setDay] = useState(start.day);
  const [hour, setHour] = useState(start.hour);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const setRow = (i: number, patch: Partial<Watch>) => setWatch((ws) => ws.map((w, j) => (j === i ? { ...w, ...patch } : w)));
  const pickBrands = (i: number, ids: string[]) => {
    const w = watch[i];
    // a new row takes the first brand's name until someone types one
    const auto = !w.name || w.name === nameOf.get(w.brand_ids[0] ?? "");
    setRow(i, { brand_ids: ids, ...(auto ? { name: ids.length ? nameOf.get(ids[0]) ?? ids[0] : "" } : {}) });
  };

  async function save() {
    setBusy(true);
    setError("");
    const contract = {
      title: title.trim() || "Weekly Competitor Pulse",
      client: { name: client.trim(), brands: clientBrands.map((id) => ({ name: clientNames.get(id) ?? nameOf.get(id) ?? id, brand_ids: [id] })) },
      watchlist: watch.filter((w) => w.brand_ids.length || w.untracked?.length).map((w) => ({ name: w.name.trim() || nameOf.get(w.brand_ids[0]) || "Brand", ...(w.short ? { short: w.short } : {}), group: w.group, brand_ids: w.brand_ids, ...(w.untracked?.length ? { untracked: w.untracked } : {}) })),
    };
    const body = { kind: "weekly_report", name: `${contract.title} · ${contract.client.name}`, contract, formats, schedule: { cron: `0 ${hour} * * ${day}`, tz: "Asia/Jakarta" }, delivery: { email: email.trim(), channels: email.trim() ? ["email"] : [] } };
    const r = await fetch(initial.id ? `/api/agents/${initial.id}` : "/api/agents", { method: initial.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok || j.error) { setError(j.error ?? `Could not save (${r.status})`); return; }
    onDone?.(initial.id ? "Saved" : `Scheduled: every ${DAYS[day]} at ${String(hour).padStart(2, "0")}:00 WIB`);
    router.refresh();
  }

  const ready = client.trim() && clientBrands.length && watch.some((w) => w.brand_ids.length) && formats.length;
  return (
    <div className="wform">
      <label className="wf"><span>Report title</span><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} /></label>
      <label className="wf"><span>Prepared for</span><input value={client} onChange={(e) => setClient(e.target.value)} placeholder="Client name, e.g. Paragon" maxLength={60} /></label>
      <div className="wf"><span>Their brands <small>(in the appendix; actions name them)</small></span><MultiSelect options={brands} value={clientBrands} onChange={setClientBrands} placeholder="Pick the client's brands" /></div>

      <div className="wf">
        <span>Watchlist <small>(the brands the report is about)</small></span>
        <div className="wlist">
          {watch.map((w, i) => (
            <div className="wrow" key={i}>
              <input className="wname" value={w.name} onChange={(e) => setRow(i, { name: e.target.value })} placeholder="Name on the slide" maxLength={60} />
              <div className="wbrands"><MultiSelect options={brands} value={w.brand_ids} onChange={(ids) => pickBrands(i, ids)} placeholder="Brands in this row" /></div>
              <select value={w.group} onChange={(e) => setRow(i, { group: e.target.value as Watch["group"] })} aria-label="Core or when relevant">
                <option value="core">Core</option>
                <option value="when_relevant">When relevant</option>
              </select>
              <button type="button" className="x" onClick={() => setWatch((ws) => ws.filter((_, j) => j !== i))} title="Remove" aria-label="Remove">×</button>
              {w.untracked?.length ? <small className="untracked">Not collected yet: {w.untracked.join(", ")}</small> : null}
            </div>
          ))}
        </div>
        <button type="button" className="btn sm ghost" onClick={() => setWatch((ws) => [...ws, { name: "", brand_ids: [], group: "core" }])} disabled={watch.length >= 12}>+ Add a brand to watch</button>
      </div>

      <div className="wf"><span>Files</span>
        <div className="wchecks">
          {[["pptx", "PowerPoint"], ["pdf", "PDF"]].map(([k, label]) => (
            <label key={k}><input type="checkbox" checked={formats.includes(k)} onChange={(e) => setFormats((f) => (e.target.checked ? [...f, k] : f.filter((x) => x !== k)))} />{label}</label>
          ))}
        </div>
      </div>
      <label className="wf"><span>Send to <small>(emails, separated by commas; empty = Library only)</small></span><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com, other@company.com" /></label>
      <div className="wf"><span>When</span>
        <div className="wwhen">
          <select value={day} onChange={(e) => setDay(Number(e.target.value))} aria-label="Day">{DAYS.map((d, i) => <option key={d} value={i}>Every {d}</option>)}</select>
          <select value={hour} onChange={(e) => setHour(Number(e.target.value))} aria-label="Time">{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00 WIB</option>)}</select>
        </div>
        <small className="hint">It reports the last full week in the data, and sends nothing when there is no new week.</small>
      </div>
      {error && <div className="errbox">{error}</div>}
      <div className="wactions">
        <button className="btn pri sm" disabled={busy || !ready} onClick={save}>{busy ? "Saving…" : initial.id ? "Save changes" : "Schedule it"}</button>
      </div>
    </div>
  );
}
