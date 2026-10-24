"use client";
/**
 * "Customise" on a Dashboard (CMS plan, The Builder): a Builder hides, renames and moves
 * sections and the team's own panels for everyone on the team. Since 16 Oct 2026 the
 * Dashboard is the team's and locked for Members: only a Builder sees this. The server keeps
 * only what each layer may set (src/roles/policy.ts).
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SectionDef } from "@/dashboard/sections";
import { Button } from "../kit/Button";
import { Drawer } from "../kit/Drawer";
import { TextField } from "../kit/Form";
import { ErrorBox } from "../kit/Section";
import { SwitchKnob } from "../kit/Switch";
import { IconChevronDown } from "../kit/icons";
import { cn } from "../cn";

type Item = SectionDef & { title: string; hidden: boolean };

export function Customise({ sections, builder, codename, client }: { sections: Item[]; builder: boolean; codename: string; client: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(sections);
  const scope = "team" as const;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const move = (i: number, by: number) => setItems((xs) => { const j = i + by; if (j < 0 || j >= xs.length) return xs; const out = [...xs]; [out[i], out[j]] = [out[j], out[i]]; return out; });
  const set = (i: number, patch: Partial<Item>) => setItems((xs) => xs.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  async function save() {
    setBusy(true); setMsg("");
    const order = items.map((x) => x.key);
    const body = { action: "apply", note: "Customised the Dashboard", changes: { "tiles.order": order, "tiles.hidden": items.filter((x) => x.hidden).map((x) => x.key), "tiles.names": Object.fromEntries(items.filter((x) => x.title.trim() && x.title.trim() !== x.label).map((x) => [x.key, x.title.trim()])) } as Record<string, unknown> };
    // an empty renaming goes back to Fair's names; nothing hidden shows everything
    if (!Object.keys(body.changes["tiles.names"] as object).length) body.changes["tiles.names"] = null;
    if (!(body.changes["tiles.hidden"] as string[]).length) body.changes["tiles.hidden"] = null;
    const r = await fetch("/api/builder/company", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok && !/Nothing would change/.test(j.error ?? "")) { setMsg(j.error ?? "That did not work."); return; }
    setOpen(false);
    router.refresh();
  }
  const shown = items.filter((x) => !x.hidden).length;
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => { setItems(sections); setMsg(""); setOpen(true); }}>Customise</Button>
      <Drawer open={open} title="Customise the Dashboard" onClose={() => setOpen(false)} footer={
        <>
          {msg && <span role="alert" className="mr-auto text-sm text-red-700">{msg}</span>}
          <Button size="sm" variant="ghost" onClick={() => setItems(sections)}>Reset</Button>
          <Button size="sm" isLoading={busy} loadingLabel="Applying…" disabled={busy || (scope === "team" && shown < 2)} onClick={save}>{scope === "team" ? "Apply for everyone" : "Save my order"}</Button>
        </>
      }>
        <p className="text-sm leading-relaxed text-gray-600">For everyone on {client ? `${client}'s ` : ""}{codename}{builder ? "" : " (a Builder's change)"}: hide, rename and move sections and your panels. The status and the headline numbers stay on top.</p>
        {scope === "team" && shown < 2 && <ErrorBox>Keep at least two sections shown.</ErrorBox>}
        <ol className="flex flex-col gap-2">
          {items.map((x, i) => (
            <li key={x.key} className={cn("flex items-center gap-2 rounded-2xl border p-2", x.hidden ? "border-dashed border-gray-300 bg-gray-50" : "border-card-border bg-white")}>
              <span className="flex flex-col">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${x.title || x.label} up`} className="grid h-7 w-8 cursor-pointer place-items-center rounded-lg text-gray-600 hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent max-md:h-9"><IconChevronDown size={16} className="rotate-180" /></button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label={`Move ${x.title || x.label} down`} className="grid h-7 w-8 cursor-pointer place-items-center rounded-lg text-gray-600 hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent max-md:h-9"><IconChevronDown size={16} /></button>
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                {scope === "team" ? <TextField value={x.title} onChange={(e) => set(i, { title: e.target.value.slice(0, 40) })} aria-label={`Title of ${x.label}`} className={cn(x.hidden && "text-gray-500")} /> : <b className="text-sm font-semibold text-gray-900">{x.title}</b>}
                {scope === "team" && x.title.trim() !== x.label && <small className="px-1 text-xs text-gray-500">Fair: {x.label}</small>}
              </span>
              {scope === "team" && (
                <button type="button" role="switch" aria-checked={!x.hidden} aria-label={`Show ${x.title || x.label}`} onClick={() => set(i, { hidden: !x.hidden })}
                  className="inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-2 rounded-xl px-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 max-md:min-h-11">
                  <SwitchKnob on={!x.hidden} />{x.hidden ? "Hidden" : "Shown"}
                </button>
              )}
            </li>
          ))}
        </ol>
      </Drawer>
    </>
  );
}
