import { Suspense } from "react";
import { Discovery } from "@/ui/Discovery";
import { SkillDb } from "@/skills/db";
import { loadContext } from "@/skills/params";

export const dynamic = "force-dynamic";

export default async function DiscoveryPage() {
  const ctx = await loadContext(new SkillDb());
  const brands = ctx.brands.map((b) => ({ id: b.id, name: b.name }));
  return (
    <Suspense>
      <Discovery brands={brands} />
    </Suspense>
  );
}
