/** Skill contract (PRD §4.1). A skill is a pure function over the database. */

export type SkillStatus = "ok" | "unavailable" | "error";

export type SkillRequest = {
  skill: string;
  workspace_id: string;
  params: Record<string, unknown>;
  actor: { user_id: string; via: "chat" | "agent" | "api" | "cli" };
  /** set by the runner; skip persistence (tests, dry runs) */
  persist?: boolean;
};

export type Evidence = {
  id: string;
  type: "post" | "creator" | "aggregate" | "comment";
  ref: string;
  label: string;
  url?: string;
  metrics?: Record<string, number | string | null>;
  sample_text?: string;
};

export type ChartSeries = { name: string; data: Array<number | null>; stack?: string };
export type ChartSpec = {
  type: "line" | "bar" | "stacked_bar";
  x: string[];
  series: ChartSeries[];
  y_label?: string;
  title?: string;
};

export type Row = Record<string, unknown>;

export type SkillMeta = {
  matched: number;
  returned: number;
  data_window: { from: string; to: string };
  freshness: string;
  caveats: string[];
  sql_hash: string;
  duration_ms: number;
};

export type SkillResult = {
  skill: string;
  status: SkillStatus;
  message?: string;
  params_resolved: Record<string, unknown>;
  summary: Record<string, unknown>;
  rows: Row[];
  chart?: ChartSpec;
  evidence: Evidence[];
  meta: SkillMeta;
  diff_key: string;
  run_id?: string;
};

/** What a skill implementation returns; the runner fills skill, meta, diff_key, run_id. */
export type SkillOutput = {
  status?: SkillStatus;
  message?: string;
  params_resolved: Record<string, unknown>;
  summary: Record<string, unknown>;
  rows: Row[];
  chart?: ChartSpec;
  evidence: Evidence[];
  matched?: number;
  data_window?: { from: string; to: string };
  caveats?: string[];
};

export type Platform = "tiktok" | "instagram" | "threads" | "x";
export type Tier = "nano" | "micro" | "mid" | "macro" | "mega";
