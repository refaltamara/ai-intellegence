"use client";
/** Which brand CeMO is on the side of. Fair (owners or data ops) sets it; everyone sees it. */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "./kit/Button";
import { SectionCard } from "./kit/Section";
import { SelectInput } from "./kit/SelectInput";

export function ClientBrand({ brands, current, canEdit, productName = "CeMO", kind = "category" }: { brands: { id: string; name: string }[]; current: string | null; canEdit: boolean; productName?: string; kind?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(current ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const currentName = brands.find((b) => b.id === current)?.name ?? null;
  const name = <b className="font-semibold text-gray-900">{currentName}</b>;

  async function save() {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/workspace", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_brand_id: value || null }) });
    const j = await r.json();
    setBusy(false);
    if (j.error) { setMsg({ ok: false, text: j.error }); return; }
    setMsg({ ok: true, text: j.client_name ? `${productName} is now on the side of ${j.client_name}.` : "No client brand: every brand is a competitor." });
    router.refresh();
  }

  return (
    <SectionCard title={kind === "profile" ? "Subject" : "Client brand"}
      hint={kind === "profile" ? (currentName ? <>This workspace is about {name}. Every post and comment loaded here is about them.</> : <>No subject set. Pick the profile this workspace is about.</>) : currentName ? <>{productName} is on the side of {name}. Other brands are competitors; new creator searches exclude anyone who posted for a competitor by default.</> : <>No client brand set. Every tracked brand is a competitor and there is no &quot;our brand&quot; yet. Set one to make {productName} take a side.</>}>
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <SelectInput withSearch size="sm" className="w-auto min-w-56" ariaLabel={kind === "profile" ? "Subject" : "Client brand"} value={value} onChange={setValue} searchPlaceholder="Search brands"
            options={[{ value: "", label: "None (no client)" }, ...brands.map((b) => ({ value: b.id, label: b.name }))]} />
          <Button size="sm" onClick={save} isLoading={busy} loadingLabel="Saving…" disabled={(value || null) === (current ?? null)}>Save</Button>
          {msg && <span role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-xs text-green-700" : "text-xs text-red-700"}>{msg.text}</span>}
        </div>
      ) : (
        <p className="text-xs text-gray-500">Fair sets this for your team.</p>
      )}
    </SectionCard>
  );
}
