/** Pulses (DECISIONS, 30 Sep 2026): the boards a team builds for the situation in front of it. */
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentWorkspaceId } from "@/auth/current";
import { pulsePage } from "@/pulse/page";
import { PulsePage } from "@/ui/PulsePage";
import { PageLoading } from "@/ui/PageLoading";
import { getWorkspace } from "@/workspace/store";
import { panelWorkspace } from "@/pulses/api";
import { editorOptions } from "@/pulses/page";
import { listPulses } from "@/pulses/store";
import { TEMPLATES } from "@/pulses/templates";
import { KIND_INFO, type CardKind } from "@/pulses/cards";
import { NewPulse } from "@/ui/pulse/NewPulse";
import { PulseList } from "@/ui/pulse/PulseList";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function PulsesPage() {
  const ws = await currentWorkspaceId();
  // a profile on the reputation dashboard keeps its crisis view here, hour by hour
  const cfg = await getWorkspace(ws);
  if (cfg?.kind === "profile" && cfg.reputation) {
    // the loading screen wraps only the crisis view: a board's not-found and a panel team's redirect
    // below are decided before anything streams, so they keep their 404 and 307
    return (
      <Suspense fallback={<PageLoading label="Loading the Pulse…" />}>
        <CrisisPulse ws={ws} />
      </Suspense>
    );
  }
  // a team with a brand panel builds decks now (DECISIONS, 2 Oct 2026); its old boards are listed there
  if (await panelWorkspace(ws)) redirect("/decks");
  const [pulses, panel, options] = await Promise.all([listPulses(ws), panelWorkspace(ws), editorOptions(ws)]);
  const templates = TEMPLATES.filter((t) => panel || !t.panel).map((t) => ({ key: t.key, name: t.name, description: t.description, kinds: t.cards.map((c) => KIND_INFO[c.kind].label) }));
  return (
    <section className="screen">
      <div className="topbar">
        <div><h1>Pulse</h1><span className="meta">Boards for the situation in front of you. The Dashboard stays the same for everyone; a Pulse is yours to shape.</span></div>
        <span className="pill">{pulses.length} Pulse{pulses.length === 1 ? "" : "s"}</span>
      </div>
      <div className="wrap wide">
        {pulses.length > 0 && (
          <PulseList pulses={pulses.map((p) => ({
            id: p.id, name: p.name, description: p.description ?? null,
            meta: `${p.cards} card${p.cards === 1 ? "" : "s"}${p.kinds.length ? ` · ${[...new Set(p.kinds)].slice(0, 4).map((k) => KIND_INFO[k as CardKind]?.label ?? k).join(", ")}` : ""} · updated ${new Date(p.updated_at).toLocaleDateString("en-GB", { timeZone: "Asia/Jakarta", day: "numeric", month: "short" })}`,
          }))} />
        )}
        <NewPulse templates={templates} brands={options.brands} panel={panel} first={pulses.length === 0} />
      </div>
    </section>
  );
}

async function CrisisPulse({ ws }: { ws: string }) {
  const d = await pulsePage(ws);
  if (!d) redirect("/data");
  return <PulsePage d={d} title="Pulse" />;
}
