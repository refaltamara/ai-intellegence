import { describe, expect, it } from "vitest";
import { strictify, unionSkillParamsSchema } from "../schema";
import { buildTools } from "../tools";
import { skillNames } from "../../skills/registry";

const BANNED = ["minimum", "maximum", "multipleOf", "minLength", "maxLength", "maxItems", "pattern", "uniqueItems"];

/** Walks a schema and returns violations of Anthropic's strict-mode subset. */
function violations(node: unknown, path = "$"): string[] {
  if (!node || typeof node !== "object") return [];
  const out: string[] = [];
  const s = node as Record<string, unknown>;
  for (const k of BANNED) if (k in s) out.push(`${path}: ${k}`);
  if ("minItems" in s && s.minItems !== 0 && s.minItems !== 1) out.push(`${path}: minItems ${s.minItems}`);
  if (Array.isArray(s.type)) out.push(`${path}: type array`);
  if (s.type === "object" || s.properties) {
    if (s.additionalProperties !== false) out.push(`${path}: additionalProperties must be false`);
    if (!Array.isArray(s.required)) out.push(`${path}: required missing`);
    for (const [k, v] of Object.entries((s.properties as Record<string, unknown>) ?? {})) out.push(...violations(v, `${path}.${k}`));
  }
  if (s.items) out.push(...violations(s.items, `${path}[]`));
  for (const key of ["anyOf", "allOf", "oneOf"]) for (const [i, v] of ((s[key] as unknown[]) ?? []).entries()) out.push(...violations(v, `${path}.${key}[${i}]`));
  return out;
}

describe("strict tool schemas", () => {
  it("every tool's input_schema stays inside the strict subset", () => {
    for (const t of buildTools()) expect(violations((t as any).input_schema), t.name).toEqual([]);
  });
  it("strict tools stay under Anthropic's limit of 24 optional parameters in total", () => {
    const count = (node: unknown): number => {
      if (!node || typeof node !== "object") return 0;
      const s = node as Record<string, any>;
      let n = 0;
      if (s.properties) {
        const req = new Set<string>(s.required ?? []);
        for (const [k, v] of Object.entries(s.properties)) n += (req.has(k) ? 0 : 1) + count(v);
      }
      if (s.items) n += count(s.items);
      return n;
    };
    const strictTools = buildTools().filter((t) => (t as any).strict);
    expect(strictTools).toEqual([]); // strict is off: the grammar compiler rejected the filter schema as "too complex"
    const total = strictTools.reduce((a, t) => a + count((t as any).input_schema), 0);
    expect(total).toBeLessThanOrEqual(24);
  });
  it("run_skill params carry every registry parameter with merged enums", () => {
    const u = unionSkillParamsSchema();
    const p = u.properties as Record<string, any>;
    expect(Object.keys(p).length).toBeGreaterThanOrEqual(45);
    expect(p.rank_by.enum).toEqual(expect.arrayContaining(["comment_rate", "er_pct", "views_per_1k", "median_views", "views", "engagements"]));
    expect(p.tiers.items.enum).toEqual(["nano", "micro", "mid", "macro", "mega"]);
    expect(p.window.additionalProperties).toBe(false);
    expect(p.rule.additionalProperties).toBe(false);
    expect(p.limit).not.toHaveProperty("maximum");
    expect(p.brand.description).toMatch(/used by/);
    expect(skillNames().length).toBe(29);
  });
  it("strictify drops unsupported keywords and closes objects", () => {
    const s = strictify({ type: "object", properties: { n: { type: "integer", minimum: 1, maximum: 5 }, list: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 9 }, o: { properties: { x: { type: "string" } } } } });
    expect(violations(s)).toEqual([]);
    expect((s.properties as any).n).toEqual({ type: "integer" });
    expect((s.properties as any).o.type).toBe("object");
  });
});
