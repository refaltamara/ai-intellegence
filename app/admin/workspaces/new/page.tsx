/** A new workspace (CMS plan, "Workspace lifecycle: 1. Create"): Fair's data ops and owners only. */
import { notFound } from "next/navigation";
import { currentActor } from "@/auth/current";
import { can } from "@/auth/can";
import { NewWorkspace } from "@/ui/admin/onboard/NewWorkspace";

export const dynamic = "force-dynamic";

export default async function NewWorkspacePage() {
  const actor = await currentActor();
  if (!actor || !can(actor, "workspace.data")) notFound();
  return (
    <section className="screen">
      <div className="topbar"><div><h1>New workspace</h1><span className="meta">A listening client: create the draft, upload the dump, map brands, load, read the report, switch live</span></div></div>
      <div className="wrap cms"><NewWorkspace /></div>
    </section>
  );
}
