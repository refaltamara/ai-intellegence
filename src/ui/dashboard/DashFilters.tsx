"use client";
/** Platform, period and brands. Every change is a URL, so a view can be shared and "Back to dashboard" lands on it. */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Period } from "@/dashboard/period";
import { MultiSelect } from "../MultiSelect";

type F = { platform: string; brands: string[]; period: string };

function href(f: F): string {
  const q = new URLSearchParams();
  if (f.platform !== "all") q.set("platform", f.platform);
  if (f.brands.length) q.set("brands", f.brands.join(","));
  q.set("period", f.period);
  return `/dashboard?${q.toString()}`;
}

export function DashFilters({ platform, brands, period, months, weeks, brandOptions }: { platform: string; brands: string[]; period: string; months: Period[]; weeks: Period[]; brandOptions: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<string[]>(brands);
  const go = (f: Partial<F>) => start(() => router.push(href({ platform, brands, period, ...f })));
  const dirty = picked.join(",") !== brands.join(",");
  return (
    <div className={`dfilters ${pending ? "busy" : ""}`}>
      <div className="seg" role="tablist" aria-label="Platform">
        {[["all", "All platforms"], ["tiktok", "TikTok"], ["instagram", "Instagram"]].map(([k, label]) => (
          <a key={k} role="tab" aria-selected={platform === k} className={platform === k ? "on" : ""} href={href({ platform: k, brands, period })} onClick={(e) => { e.preventDefault(); go({ platform: k }); }}>{label}</a>
        ))}
      </div>
      <select className="dsel" value={period} onChange={(e) => go({ period: e.target.value })} aria-label="Period">
        <optgroup label="Months">{months.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</optgroup>
        <optgroup label="Weeks">{weeks.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</optgroup>
      </select>
      <div className="dbrands">
        <MultiSelect options={brandOptions} value={picked} onChange={setPicked} placeholder="All brands" />
        {dirty && <button className="btn pri sm" onClick={() => go({ brands: picked })}>Apply</button>}
      </div>
      {pending && <span className="dspin" aria-live="polite">Updating…</span>}
    </div>
  );
}
