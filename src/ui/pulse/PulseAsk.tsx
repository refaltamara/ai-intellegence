"use client";
/**
 * Ask CeMO from the Pulse: the question goes to Chats with a reference to the Pulse (never its
 * numbers; the server reads them again, src/pulse/ask.ts) and is sent at once.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AskBar } from "../dashboard/AskBar";
import { pulseAskHref } from "@/dashboard/askref";

export function PulseAsk({ subject }: { subject: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  function go() {
    const t = q.trim();
    if (!t || busy) return;
    setBusy(true);
    router.push(`${pulseAskHref("overview")}&q=${encodeURIComponent(t.slice(0, 1500))}&go=1`);
  }
  return (
    <AskBar label="Ask CeMO" value={q} onChange={setQ} onSubmit={go} busy={busy} disabled={!q.trim()} submitLabel="Ask" busyLabel="Opening…"
      ariaLabel={`Ask CeMO about ${subject}`} placeholder={`Anything about ${subject}: why the anger rose, who is driving it, what to say next…`} />
  );
}
