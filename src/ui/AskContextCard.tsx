/** The card that carries a dashboard click into Chats: what was looked at, the figures on screen, and the way back. */
import Link from "next/link";
import type { AskContext } from "@/dashboard/askref";
import { cn } from "./cn";
import { IconChart } from "./kit/icons";

export function AskContextCard({ c, onRemove, sent = false }: { c: AskContext; onRemove?: () => void; sent?: boolean }) {
  const fromSlide = c.source === "slide";
  const fromPulse = c.source === "pulse";
  const back = fromSlide ? (c.back.startsWith("/weekly") ? c.back : "/weekly") : fromPulse ? "/pulse" : c.back.startsWith("/dashboard") ? c.back : "/dashboard";
  const link = c.facts.find((f) => f.label === "Link");
  return (
    // sent: it sits above the question it went with, on the asker's side of the thread
    <div className={cn("flex flex-col gap-2 rounded-2xl border border-brand-palette-100 bg-white p-4", sent && "w-full max-w-[75%] self-end sm:min-w-80")}>
      <div className="flex items-center gap-3">
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-semibold text-brand-palette-700">
          <IconChart size={14} />
          {fromSlide ? "From a weekly report slide" : fromPulse ? "From the Pulse" : "From the dashboard"}
        </span>
        <Link href={back} className="shrink-0 text-xs font-semibold text-gray-600 underline-offset-2 hover:text-brand-palette-700 hover:underline">{fromSlide ? "Back to the slide" : fromPulse ? "Back to the Pulse" : "Back to dashboard"}</Link>
        {onRemove && (
          <button type="button" onClick={onRemove} title="Ask without this context" aria-label="Remove context" className="-my-1 -mr-1 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-brand-palette-600">×</button>
        )}
      </div>
      <div>
        <b className="block text-sm font-semibold text-gray-900">{c.title}</b>
        <span className="text-xs text-gray-500">{c.scope}</span>
      </div>
      <dl className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-2">
        {c.facts.filter((f) => f.label !== "Link").map((f, i) => (
          <div key={i} className="rounded-xl bg-gray-50 px-3 py-2">
            <dt className="text-[11px] text-gray-500">{f.label}</dt>
            <dd className="text-sm font-semibold text-gray-900">{f.value}</dd>
          </div>
        ))}
      </dl>
      {link && <a className="self-start text-xs font-semibold text-brand-palette-700 underline underline-offset-2" href={link.value} target="_blank" rel="noreferrer">Open the post</a>}
    </div>
  );
}
