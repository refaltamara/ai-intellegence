"use client";
/**
 * One button on "Our Chorus": posts an action to the client-side API and refreshes the
 * page. `ask` asks for a note first (sending back, suggesting to Fair); `confirm` asks
 * before something that changes the team for everyone. The server decides; this shows
 * what it said. Also used on Credits and in the CMS.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "../cn";
import { Button } from "../kit/Button";
import { ConfirmDialog, PromptDialog } from "../kit/Modal";

export function Act({ label, url, body, ask, confirm, variant = "outline", danger, done }: { label: string; url: string; body: Record<string, unknown>; ask?: string; confirm?: string; variant?: "primary" | "outline" | "ghost"; danger?: boolean; done?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<"ask" | "confirm" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // the note from `ask`, held while `confirm` asks too
  const [note, setNote] = useState<string | undefined>(undefined);
  async function go(note?: string) {
    setBusy(true); setMsg(null);
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(note !== undefined ? { ...body, note } : body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false); setOpen(null);
    if (!r.ok) { setMsg({ ok: false, text: j.error ?? "That did not work." }); return; }
    if (done) setMsg({ ok: true, text: done });
    router.refresh();
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button size="sm" variant={variant} isLoading={busy && !open} onClick={() => (ask ? setOpen("ask") : confirm ? setOpen("confirm") : void go())}
        className={cn(danger && variant !== "primary" && "text-red-600 hover:bg-red-50 hover:text-red-700")}>
        {label}
      </Button>
      {msg && <small role={msg.ok ? "status" : "alert"} className={cn("text-xs", msg.ok ? "text-green-700" : "text-red-700")}>{msg.text}</small>}
      {ask && <PromptDialog open={open === "ask"} title={label} label={ask} maxLength={300} optional confirmLabel={confirm ? "Next" : label} busy={busy}
        onSubmit={(v) => { if (confirm) { setNote(v); setOpen("confirm"); } else void go(v); }} onClose={() => setOpen(null)} />}
      {confirm && <ConfirmDialog open={open === "confirm"} title={label} body={confirm} confirmLabel={label} danger={danger} busy={busy} onConfirm={() => void go(ask ? note : undefined)} onClose={() => setOpen(null)} />}
    </span>
  );
}
