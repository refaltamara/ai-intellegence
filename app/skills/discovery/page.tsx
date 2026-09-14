import { currentWorkspaceId } from "@/auth/current";
import { Suspense } from "react";
import { Discovery } from "@/ui/Discovery";
import { SkillDb } from "@/skills/db";
import { loadContext } from "@/skills/params";
import { sql } from "@/db/client";

export const dynamic = "force-dynamic";

export default async function DiscoveryPage() {
  const ws = await currentWorkspaceId();
  const db = new SkillDb();
  const [ctx, monthRows] = await Promise.all([
    loadContext(db, ws),
    sql.query("select to_char(month, 'YYYY-MM') as m from posts where workspace_id = $1 group by month order by month", [ws]) as unknown as Promise<{ m: string }[]>,
  ]);
  const brands = ctx.brands.map((b) => ({ id: b.id, name: b.name, hint: b.is_client ? "your brand" : undefined }));
  return (
    <Suspense>
      <Discovery brands={brands} months={monthRows.map((r) => r.m)} />
    </Suspense>
  );
}
