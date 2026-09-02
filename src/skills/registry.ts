/**
 * Loads skills.registry.json, the single source of truth for skills (CLAUDE.md rule 2).
 * The Skills page, the slash menu and the run_skill tool definition are all built from here.
 */
import registryJson from "../../skills.registry.json";

export type JsonSchema = Record<string, unknown> & { properties?: Record<string, JsonSchema>; required?: string[] };

export type SkillDef = {
  name: string;
  layer: string;
  phase: number | string;
  first_release?: boolean;
  title: string;
  description: string;
  example: string;
  input_schema: JsonSchema;
  output: { kind: string; diff_key: string; [k: string]: unknown };
  requires: string[];
  platforms?: string[];
  gate?: { platforms_present?: string[] };
  [k: string]: unknown;
};

export type Registry = {
  version: string;
  generated: string;
  layers: Record<string, { title: string; blurb: string }>;
  tiers: Record<string, [number, number | null]>;
  skills: SkillDef[];
};

export const registry = registryJson as unknown as Registry;

const byName = new Map(registry.skills.map((s) => [s.name, s]));

export function listSkills(): SkillDef[] {
  return registry.skills;
}

export function getSkill(name: string): SkillDef | undefined {
  return byName.get(name);
}

export function skillNames(): string[] {
  return registry.skills.map((s) => s.name);
}

/** One line per skill for the run_skill tool description (PRD §5.2). */
export function describeSkillsForTool(): string {
  return registry.skills
    .map((s) => {
      const props = s.input_schema.properties ?? {};
      const params = Object.entries(props)
        .map(([k, v]) => {
          const req = s.input_schema.required?.includes(k) ? "*" : "";
          const d = (v as JsonSchema).default;
          const def = d === undefined ? "" : `=${JSON.stringify(d)}`;
          return `${k}${req}${def}`;
        })
        .join(", ");
      return `${s.name} — ${s.description} params: ${params}`;
    })
    .join("\n");
}
