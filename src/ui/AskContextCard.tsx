/** The card that carries a dashboard click into Chats: what was looked at, the figures on screen, and the way back. */
import Link from "next/link";
import type { AskContext } from "@/dashboard/askref";

export function AskContextCard({ c, onRemove, sent = false }: { c: AskContext; onRemove?: () => void; sent?: boolean }) {
  const fromSlide = c.source === "slide";
  const back = fromSlide ? (c.back.startsWith("/weekly") ? c.back : "/weekly") : c.back.startsWith("/dashboard") ? c.back : "/dashboard";
  return (
    <div className={`ctxcard ${sent ? "sent" : "pending"}`}>
      <div className="head">
        <span className="src">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>
          {fromSlide ? "From a weekly report slide" : "From the dashboard"}
        </span>
        <Link href={back} className="back">{fromSlide ? "Back to the slide" : "Back to dashboard"}</Link>
        {onRemove && <button type="button" className="x" onClick={onRemove} title="Ask without this context" aria-label="Remove context">×</button>}
      </div>
      <b className="title">{c.title}</b>
      <span className="scope">{c.scope}</span>
      <dl>
        {c.facts.filter((f) => f.label !== "Link").map((f, i) => (
          <div key={i}><dt>{f.label}</dt><dd>{f.value}</dd></div>
        ))}
      </dl>
      {c.facts.find((f) => f.label === "Link") && <a className="post" href={c.facts.find((f) => f.label === "Link")!.value} target="_blank" rel="noreferrer">Open the post ↗</a>}
    </div>
  );
}
