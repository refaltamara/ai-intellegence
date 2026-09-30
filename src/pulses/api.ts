/** Shared checks for the Pulse routes: the workspace's brands, its kind, and what a pinned run may be. */
import { sql } from "../db/client";
import { getSkillRun } from "../chat/persist";
import { getWorkspace } from "../workspace/store";
import { CARD_KINDS, cleanConfig, KIND_INFO, type CardKind, type CardSize } from "./cards";
import { addCard } from "./store";

export async function knownBrands(workspaceId: string): Promise<Set<string>> {
  return new Set(((await sql.query("select id from brands where workspace_id = $1", [workspaceId])) as { id: string }[]).map((b) => b.id));
}

/** Panel cards need a brand panel: a PR team (one subject) pins analyses instead. */
export async function panelWorkspace(workspaceId: string): Promise<boolean> {
  return (await getWorkspace(workspaceId).catch(() => null))?.kind !== "profile";
}

export const SIZES: CardSize[] = ["s", "m", "l"];

/** Add a card from a request body: { kind, config, size?, title? } or { kind: "skill", skill_run_id }. */
export async function addCardFromBody(pulseId: string, workspaceId: string, body: Record<string, unknown>): Promise<{ id: string } | { error: string }> {
  const kind = String(body.kind ?? "") as CardKind;
  if (!(CARD_KINDS as readonly string[]).includes(kind)) return { error: `unknown card kind '${kind}'` };
  const size = SIZES.includes(body.size as CardSize) ? (body.size as CardSize) : KIND_INFO[kind].size;
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 80) : null;
  if (kind === "skill") {
    const runId = String(body.skill_run_id ?? "");
    if (!/^[0-9a-f-]{36}$/.test(runId)) return { error: "skill_run_id is required" };
    const run = await getSkillRun(runId, workspaceId);
    if (!run) return { error: "that analysis is not in this workspace" };
    const card = await addCard({ workspaceId, pulseId, kind, title: title ?? run.pane_title ?? null, config: { platform: "all", brands: [], period: "latest-month" }, size, skillRunId: run.id });
    return { id: card.id };
  }
  if (!(await panelWorkspace(workspaceId))) return { error: "this team has no brand panel; pin answers from Chats instead" };
  const config = cleanConfig(kind, body.config, await knownBrands(workspaceId));
  const card = await addCard({ workspaceId, pulseId, kind, title, config, size });
  return { id: card.id };
}
