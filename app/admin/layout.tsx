import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { currentActor } from "@/auth/current";
import { can } from "@/auth/can";
import { DUTY_LABEL } from "@/config/staff";
import { AdminNav } from "@/ui/admin/AdminNav";

export const dynamic = "force-dynamic";

/** The CMS (DECISIONS, 4 Oct 2026): Fair staff only; anyone else gets a plain 404, not a hint that it exists. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const actor = await currentActor();
  if (!actor || !can(actor, "cms.open")) notFound();
  return (
    <div className="app">
      <AdminNav email={actor.email} duties={actor.staff.map((d) => DUTY_LABEL[d]).join(" · ")} />
      <main className="main">{children}</main>
    </div>
  );
}
