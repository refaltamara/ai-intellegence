/** Generic implementation for skills whose data layer is not loaded (Phase 1b / Phase 2). */
import type { SkillDef } from "./registry";
import type { SkillOutput } from "./types";

const LAYER_MESSAGE: Record<string, string> = {
  post_snapshots: "day-by-day post snapshots are not loaded (the exports contain one final capture per post)",
  comments: "comment data is not loaded yet (only per-post comment counts exist)",
  topics: "the topic taxonomy is not loaded yet",
};

export function unavailable(def: SkillDef, missing: string[], params: Record<string, unknown>): SkillOutput {
  const reasons = missing.map((m) => LAYER_MESSAGE[m] ?? `${m} data is not loaded`);
  return {
    status: "unavailable",
    message: `${def.title} is unavailable: ${reasons.join("; ")}.`,
    params_resolved: params,
    summary: { missing },
    rows: [],
    evidence: [],
  };
}
