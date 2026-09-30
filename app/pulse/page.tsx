/** Pulses (DECISIONS, 30 Sep 2026): the boards a team builds for the situation in front of it. */
import Link from "next/link";
import { currentWorkspaceId } from "@/auth/current";
import { panelWorkspace } from "@/pulses/api";
import { editorOptions } from "@/pulses/page";
import { listPulses } from "@/pulses/store";
import { TEMPLATES } from "@/pulses/templates";
import { KIND_INFO, type CardKind } from "@/pulses/cards";
import { NewPulse } from "@/ui/pulse/NewPulse";

export const dynamic = "force-dynamic";

export default async function PulsesPage() {
  const ws = await currentWorkspaceId();
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
          <div className="plist">
            {pulses.map((p) => (
              <Link key={p.id} href={`/pulse/${p.id}`} className="pitem">
                <b>{p.name}</b>
                <span>{p.description ?? ""}</span>
                <small>{p.cards} card{p.cards === 1 ? "" : "s"}{p.kinds.length ? ` · ${[...new Set(p.kinds)].slice(0, 4).map((k) => KIND_INFO[k as CardKind]?.label ?? k).join(", ")}` : ""} · updated {new Date(p.updated_at).toLocaleDateString("en-GB", { timeZone: "Asia/Jakarta", day: "numeric", month: "short" })}</small>
              </Link>
            ))}
          </div>
        )}
        <NewPulse templates={templates} brands={options.brands} panel={panel} first={pulses.length === 0} />
      </div>
    </section>
  );
}
