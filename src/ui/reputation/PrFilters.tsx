"use client";
/** Brand in focus, window and platform. Every change is a URL, so a view can be shared. */
import { useRouter } from "next/navigation";
import { useTransition } from "react";

type F = { brand: string; days: number; platform: string };
const LABEL: Record<string, string> = { tiktok: "TikTok", instagram: "Instagram", threads: "Threads", x: "X", youtube: "YouTube" };

function href(f: F, client: string | null): string {
  const q = new URLSearchParams();
  if (f.brand && f.brand !== client) q.set("brand", f.brand);
  if (f.days !== 7) q.set("days", String(f.days));
  if (f.platform !== "all") q.set("platform", f.platform);
  const s = q.toString();
  return `/dashboard${s ? `?${s}` : ""}`;
}

export function PrFilters({ brand, days, platform, brands, platforms, client }: F & { brands: { id: string; name: string }[]; platforms: string[]; client: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const cur = { brand, days, platform };
  const go = (f: Partial<F>) => start(() => router.push(href({ ...cur, ...f }, client)));
  return (
    <div className={`dfilters ${pending ? "busy" : ""}`}>
      <select className="dsel" value={brand} onChange={(e) => go({ brand: e.target.value })} aria-label="Brand in focus">
        {brands.map((b) => <option key={b.id} value={b.id}>{b.name}{b.id === client ? " (you)" : ""}</option>)}
      </select>
      <div className="seg" role="tablist" aria-label="Window">
        {[7, 14, 30].map((d) => (
          <a key={d} role="tab" aria-selected={days === d} className={days === d ? "on" : ""} href={href({ ...cur, days: d }, client)} onClick={(e) => { e.preventDefault(); go({ days: d }); }}>{d} days</a>
        ))}
      </div>
      <div className="seg" role="tablist" aria-label="Platform">
        {["all", ...platforms].map((p) => (
          <a key={p} role="tab" aria-selected={platform === p} className={platform === p ? "on" : ""} href={href({ ...cur, platform: p }, client)} onClick={(e) => { e.preventDefault(); go({ platform: p }); }}>{p === "all" ? "All" : LABEL[p] ?? p}</a>
        ))}
      </div>
      {pending && <span className="dspin" aria-live="polite">Updating…</span>}
    </div>
  );
}
