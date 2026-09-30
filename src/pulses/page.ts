/** Everything a Pulse page needs: the Pulse, its cards with their numbers, and the choices the card editor offers. */
import { getSkillRun } from "../chat/persist";
import { brandHandles } from "../dashboard/data";
import { periodOptions } from "../dashboard/period";
import { SkillDb } from "../skills/db";
import { loadContext } from "../skills/params";
import type { SkillResult } from "../skills/types";
import { renderCard, type RenderedCard } from "./cards";
import { getPulse, listCards, type PulseRow } from "./store";

export type EditorOptions = { brands: { id: string; name: string }[]; months: { key: string; label: string }[]; weeks: { key: string; label: string }[] };

export async function editorOptions(workspaceId: string): Promise<EditorOptions> {
  const ctx = await loadContext(new SkillDb(), workspaceId);
  const o = periodOptions(ctx.earliest, ctx.asOf);
  return {
    brands: ctx.brands.map((b) => ({ id: b.id, name: b.name })).sort((a, b) => a.name.localeCompare(b.name)),
    months: o.months.map((p) => ({ key: p.key, label: p.label })),
    weeks: o.weeks.map((p) => ({ key: p.key, label: `${p.key.slice(5)} · ${p.label}` })),
  };
}

export async function pulsePageData(id: string, workspaceId: string): Promise<{ pulse: PulseRow; cards: RenderedCard[] } | null> {
  const pulse = await getPulse(id, workspaceId);
  if (!pulse) return null;
  const db = new SkillDb();
  const [ctx, rows] = await Promise.all([loadContext(db, workspaceId), listCards(id, workspaceId)]);
  const handles = rows.some((c) => c.kind === "creators") ? brandHandles(db, workspaceId) : undefined;
  const skillRun = async (runId: string) => {
    const r = await getSkillRun(runId, workspaceId);
    return r ? { skill: r.skill, result: r.result as SkillResult, created_at: r.created_at } : null;
  };
  const cards = await Promise.all(rows.map((c) => renderCard(c, ctx, { handles, skillRun })));
  return { pulse, cards };
}
