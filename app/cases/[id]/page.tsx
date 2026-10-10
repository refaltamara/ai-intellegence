/**
 * A case's own numbers (DECISIONS, 10 Oct 2026, step 5): the crisis view, counted over the posts the case caught and the
 * comments under them. Only the people on the case's list reach it; to anyone else it is not there.
 */
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { can } from "@/auth/can";
import { currentActor, currentWorkspaceId } from "@/auth/current";
import { getCase } from "@/cases/store";
import { pulsePage } from "@/pulse/page";
import { PageLoading } from "@/ui/PageLoading";
import { PulsePage } from "@/ui/PulsePage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(id)) notFound();
  const [actor, ws] = await Promise.all([currentActor(), currentWorkspaceId()]);
  const c = actor ? await getCase(id) : null;
  if (!actor || !c || c.workspace_id !== ws || !can(actor, "case.view", { workspace: ws, case: c })) notFound();
  if (!c.posts) {
    return (
      <section className="screen">
        <div className="topbar"><div><h1>{c.name}</h1><span className="meta">{c.about ?? ""}</span></div></div>
        <div className="wrap"><p className="muted">This case holds no posts yet: they arrive with its first load.</p></div>
      </section>
    );
  }
  return (
    <Suspense fallback={<PageLoading label="Loading the case…" />}>
      <CaseView ws={ws} id={c.id} name={c.name} />
    </Suspense>
  );
}

async function CaseView({ ws, id, name }: { ws: string; id: string; name: string }) {
  const d = await pulsePage(ws, { caseId: id });
  if (!d) notFound();
  return <PulsePage d={d} title={name} ask={false} />;
}
