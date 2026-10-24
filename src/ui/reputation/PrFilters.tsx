"use client";
/** Brand in focus, window and platform. Every change is a URL, so a view can be shared. */
import { useOptimistic } from "react";
import { SelectInput } from "../kit/SelectInput";
import { Segmented } from "../kit/Segmented";
import { FilterBusy } from "../dashboard/FilterBusy";
import { useNavPending } from "../kit/NavPending";

type F = { brand: string; days: number; platform: string };
const LABEL: Record<string, string> = { tiktok: "TikTok", instagram: "Instagram", threads: "Threads", x: "X", youtube: "YouTube" };

function href(f: F, client: string | null, def = 7): string {
  const q = new URLSearchParams();
  if (f.brand && f.brand !== client) q.set("brand", f.brand);
  if (f.days !== def) q.set("days", String(f.days));
  if (f.platform !== "all") q.set("platform", f.platform);
  const s = q.toString();
  return `/dashboard${s ? `?${s}` : ""}`;
}

/** The PR dashboard's filters; the Social Media dashboard uses them with its own windows (7, 30, 90 days, 30 by default). */
export function PrFilters({ brand, days, platform, brands, platforms, client, windows = [7, 14, 30], def = 7 }: F & { brands: { id: string; name: string }[]; platforms: string[]; client: string | null; windows?: number[]; def?: number }) {
  const { pending, go: push } = useNavPending();
  // the controls show the new choice at once; the server's props take over when the new view arrives
  const [cur, setCur] = useOptimistic<F>({ brand, days, platform });
  const go = (f: Partial<F>) => push(href({ ...cur, ...f }, client, def), { before: () => setCur({ ...cur, ...f }) });
  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={pending || undefined}>
      <SelectInput withSearch size="sm" className="w-auto min-w-52" ariaLabel="Brand in focus" value={cur.brand} onChange={(v) => go({ brand: v })} searchPlaceholder="Search brands"
        options={brands.map((b) => ({ value: b.id, label: `${b.name}${b.id === client ? " (you)" : ""}` }))} />
      <Segmented label="Window" size="sm" value={String(cur.days)} onChange={(k) => go({ days: Number(k) })} options={windows.map((d) => ({ key: String(d), label: `${d} days` }))} />
      <Segmented label="Platform" size="sm" value={cur.platform} onChange={(k) => go({ platform: k })} options={["all", ...platforms].map((p) => ({ key: p, label: p === "all" ? "All" : LABEL[p] ?? p }))} />
      <FilterBusy on={pending} />
    </div>
  );
}
