"use client";
/** Platform, period and brands. Every change is a URL, so a view can be shared and "Back to dashboard" lands on it. */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Period } from "@/dashboard/period";
import { PLATFORM_NAME } from "@/dashboard/askref";
import { MultiSelect } from "../MultiSelect";
import { SelectInput } from "../kit/SelectInput";

type F = { platform: string; brands: string[]; period: string };

function href(f: F): string {
  const q = new URLSearchParams();
  if (f.platform !== "all") q.set("platform", f.platform);
  if (f.brands.length) q.set("brands", f.brands.join(","));
  q.set("period", f.period);
  return `/dashboard?${q.toString()}`;
}

export function DashFilters({ platform, brands, period, months, weeks, brandOptions, platforms }: { platform: string; brands: string[]; period: string; months: Period[]; weeks: Period[]; brandOptions: { id: string; name: string }[]; platforms: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<string[]>(brands);
  const go = (f: Partial<F>) => start(() => router.push(href({ platform, brands, period, ...f })));
  const dirty = picked.join(",") !== brands.join(",");
  return (
    <div className={`dfilters ${pending ? "busy" : ""}`}>
      <div className="seg" role="tablist" aria-label="Platform">
        {[["all", "All platforms"], ...platforms.map((p) => [p, PLATFORM_NAME[p] ?? p])].map(([k, label]) => (
          <a key={k} role="tab" aria-selected={platform === k} className={platform === k ? "on" : ""} href={href({ platform: k, brands, period })} onClick={(e) => { e.preventDefault(); go({ platform: k }); }}>{label}</a>
        ))}
      </div>
      <SelectInput withSearch size="sm" className="w-auto min-w-52" ariaLabel="Period" value={period} onChange={(v) => go({ period: v })} searchPlaceholder="Search periods"
        options={[...months.map((p) => ({ value: p.key, label: p.label, group: "Months" })), ...weeks.map((p) => ({ value: p.key, label: p.label, group: "Weeks" }))]} />
      <div className="dbrands">
        <MultiSelect options={brandOptions} value={picked} onChange={setPicked} placeholder="All brands" />
        {dirty && <button className="btn pri sm" onClick={() => go({ brands: picked })}>Apply</button>}
      </div>
      {pending && <span className="dspin" aria-live="polite">Updating…</span>}
    </div>
  );
}
