import { notFound } from "next/navigation";
import { currentWorkspaceId } from "@/auth/current";
import { panelWorkspace } from "@/pulses/api";
import { editorOptions, pulsePageData } from "@/pulses/page";
import { PulseBoard } from "@/ui/pulse/PulseBoard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function PulsePage({ params }: { params: Promise<{ id: string }> }) {
  const ws = await currentWorkspaceId();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [d, options, panel] = await Promise.all([pulsePageData(id, ws), editorOptions(ws), panelWorkspace(ws)]);
  if (!d) notFound();
  return <PulseBoard key={d.pulse.id} pulse={{ id: d.pulse.id, name: d.pulse.name, description: d.pulse.description }} cards={d.cards} options={options} panel={panel} />;
}
