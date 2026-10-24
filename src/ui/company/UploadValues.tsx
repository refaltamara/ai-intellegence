"use client";
/** Upload an extension's values: a CSV of two columns, a creator handle (or a post link) and its value. */
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { cn } from "../cn";
import { Button } from "../kit/Button";

export function UploadValues({ defId }: { defId: string }) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function pick(f: File) {
    setMsg(null); setBusy(true);
    const csv = await f.text();
    const r = await fetch("/api/builder/extensions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "upload", def_id: defId, csv }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: j.error ?? "That did not work." }); return; }
    setMsg({ ok: true, text: `${j.saved} saved${j.unknown_keys?.length ? `, ${j.unknown_keys.length} not found` : ""}${j.unknown_values?.length ? `, unknown values: ${j.unknown_values.join(", ")}` : ""}` });
    router.refresh();
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <input ref={ref} type="file" accept=".csv,text/csv,text/plain" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ""; }} />
      <Button variant="outline" size="sm" isLoading={busy} loadingLabel="Uploading…" onClick={() => ref.current?.click()}>Upload values (CSV)</Button>
      {msg && <small role={msg.ok ? "status" : "alert"} className={cn("text-xs", msg.ok ? "text-green-700" : "text-red-700")}>{msg.text}</small>}
    </span>
  );
}
