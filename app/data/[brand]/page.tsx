/** A brand's coverage page (PRD-v2 §14). Period, platform and "show all" arrive as search params; the page is fully server-rendered. */
import { notFound } from "next/navigation";
import { brandPage, type Period } from "@/brand/page";
import { BrandPage } from "@/ui/BrandPage";

export const dynamic = "force-dynamic";

export default async function BrandDataPage({ params, searchParams }: { params: Promise<{ brand: string }>; searchParams: Promise<{ period?: string; platform?: string; tags?: string; creators?: string; hashtags?: string }> }) {
  const { brand } = await params;
  const sp = await searchParams;
  if (!/^[a-z0-9_.-]{1,80}$/i.test(brand)) notFound();
  const period: Period = sp.period === "90d" || sp.period === "all" ? sp.period : "30d";
  const d = await brandPage(brand, period);
  if (!d) notFound();
  return <BrandPage d={d} q={{ period, platform: sp.platform, tags: sp.tags, creators: sp.creators, hashtags: sp.hashtags }} />;
}
