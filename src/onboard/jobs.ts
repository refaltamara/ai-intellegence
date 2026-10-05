/**
 * Onboarding jobs (cms_jobs; the runner is src/extensions/jobs.ts): inspect a dump, load
 * it in slices, apply a brand's relevance terms. Each returns what to save and whether it
 * is done; errors are kept on the job for data ops to read.
 */
import { inspectDump, loadSlice, type Progress } from "./load";
import { applyRelevance } from "./terms";

export const ONBOARD_KINDS = ["dump_inspect", "dump_load", "relevance_apply"] as const;

export async function onboardSlice(kind: string, ws: string, params: Record<string, unknown>, progress: Record<string, unknown>, budgetMs?: number): Promise<{ done: boolean; progress: Record<string, unknown>; note: string }> {
  if (kind === "dump_inspect") {
    const r = await inspectDump(ws);
    return { done: true, progress: { files: r.files.length, handles: r.handles.length }, note: `Inspected ${r.files.length} files.` };
  }
  if (kind === "dump_load") {
    const r = await loadSlice(ws, progress as Progress, budgetMs);
    return { done: r.done, progress: r.progress as unknown as Record<string, unknown>, note: r.note };
  }
  if (kind === "relevance_apply") {
    const r = await applyRelevance(ws, String(params.brand_id ?? ""), String(params.by ?? "cms"));
    return { done: true, progress: r as unknown as Record<string, unknown>, note: `${r.changed} posts changed.` };
  }
  throw new Error(`unknown job ${kind}`);
}
