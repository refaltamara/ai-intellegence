"use client";
/**
 * "Ask CeMO anything about this" at the top of the PR dashboard (Refal, 14 Oct 2026): the question goes to Chats with a
 * reference to what the dashboard shows (brand, window, platform), never its numbers; the server reads them again
 * (src/reputation/ask.ts), shows them above the question, and the question is sent at once.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AskBar } from "../dashboard/AskBar";
import { repAskHref } from "@/dashboard/askref";

export function DashAsk({ who, brand, days, platform }: { who: string; brand: string; days: number; platform: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  function go() {
    const t = q.trim();
    if (!t || busy) return;
    setBusy(true);
    router.push(`${repAskHref(brand, days, platform)}&q=${encodeURIComponent(t.slice(0, 1500))}&go=1`);
  }
  return (
    <AskBar label="Ask CeMO anything about this" value={q} onChange={setQ} onSubmit={go} busy={busy} disabled={!q.trim()} submitLabel="Ask" busyLabel="Opening…"
      ariaLabel={`Ask CeMO about this dashboard on ${who}`} placeholder={`About ${who} on this dashboard: why the anger, which platform, who is pulled in, what to say next…`} />
  );
}
