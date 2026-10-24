"use client";
/**
 * Set up (or edit) a Weekly Competitor Pulse: who it is for, which brands it
 * watches, the files, the recipients and when it goes out. What is saved is the
 * report's contract (src/competitor/contract.ts); the server checks every brand.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ClientContract as WeeklyContract } from "@/competitor/contract";
import { MultiSelect } from "../MultiSelect";
import { CARD, SectionTitle } from "../decks/formParts";
import { Button } from "../kit/Button";
import { Chip, Field, TextField } from "../kit/Form";
import { IconClose, IconPlus } from "../kit/icons";
import { SelectInput } from "../kit/SelectInput";

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
    <div className="flex flex-col gap-6">
      <section className={CARD}>
        <SectionTitle title="The report" hint="What it is called and who it is for" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Report title"><TextField value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} /></Field>
          <Field label="Prepared for"><TextField value={client} onChange={(e) => setClient(e.target.value)} placeholder="Client name, e.g. Paragon" maxLength={60} /></Field>
          <Field group label="Their brands" hint="in the appendix; actions name them"><MultiSelect options={brands} value={clientBrands} onChange={setClientBrands} placeholder="Pick the client's brands" /></Field>
        </div>
      </section>

      <section className={CARD}>
        <SectionTitle title="Watchlist" hint="The brands the report is about" />
        <div className="flex flex-col gap-3">
          {watch.map((w, i) => (
            <div key={i} className="grid items-start gap-2 rounded-2xl border border-card-border p-3 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto_auto]">
              <TextField aria-label={`Name on the slide, row ${i + 1}`} value={w.name} onChange={(e) => setRow(i, { name: e.target.value })} placeholder="Name on the slide" maxLength={60} />
              <MultiSelect options={brands} value={w.brand_ids} onChange={(ids) => pickBrands(i, ids)} placeholder="Brands in this row" />
              <SelectInput withSearch size="sm" className="md:w-auto md:min-w-40" ariaLabel="Core or when relevant" value={w.group} onChange={(v) => setRow(i, { group: v as Watch["group"] })}
                options={[{ value: "core", label: "Core" }, { value: "when_relevant", label: "When relevant" }]} />
              <button type="button" onClick={() => setWatch((ws) => ws.filter((_, j) => j !== i))} title="Remove" aria-label={`Remove row ${i + 1}`}
                className="inline-flex h-10 w-10 cursor-pointer items-center justify-center justify-self-end rounded-xl text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 max-md:h-11 max-md:w-11">
                <IconClose size={18} />
              </button>
              {w.untracked?.length ? <small className="col-span-full text-xs text-amber-800">Not collected yet: {w.untracked.join(", ")}</small> : null}
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" className="self-start" onClick={() => setWatch((ws) => [...ws, { name: "", brand_ids: [], group: "core" }])} disabled={watch.length >= 12}><IconPlus size={16} />Add a brand to watch</Button>
      </section>

      <section className={CARD}>
        <SectionTitle title="Files and delivery" hint="It reports the last full week in the data, and sends nothing when there is no new week." />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field group label="Files">
            <div className="flex flex-wrap gap-2">
              {[["pptx", "PowerPoint"], ["pdf", "PDF"]].map(([k, label]) => (
                <Chip key={k} on={formats.includes(k)} onClick={() => setFormats((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]))}>{label}</Chip>
              ))}
            </div>
          </Field>
          <Field label="Send to" hint="emails, separated by commas; empty = Library only"><TextField value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com, other@company.com" /></Field>
          <Field group label="When">
            <div className="flex flex-wrap gap-2">
              <SelectInput withSearch size="sm" className="w-auto min-w-44" ariaLabel="Day" value={String(day)} onChange={(v) => setDay(Number(v))}
                options={DAYS.map((d, i) => ({ value: String(i), label: `Every ${d}` }))} />
              <SelectInput withSearch size="sm" className="w-auto min-w-36" ariaLabel="Time" value={String(hour)} onChange={(v) => setHour(Number(v))} searchPlaceholder="Search hours"
                options={Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${String(h).padStart(2, "0")}:00 WIB` }))} />
            </div>
          </Field>
        </div>
      </section>

      <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-end gap-3 border-0 border-t border-gray-200 bg-gray-50 py-3">
        {error && <p role="alert" className="mr-auto rounded-2xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
        <Button size="sm" disabled={!ready} isLoading={busy} loadingLabel="Saving…" onClick={save}>{initial.id ? "Save changes" : "Schedule it"}</Button>
      </div>
    </div>
  );
}
