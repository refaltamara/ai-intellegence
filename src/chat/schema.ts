/**
 * JSON Schema helpers for strict tool use. Anthropic's strict mode accepts a
 * subset of JSON Schema (docs: build-with-claude/structured-outputs#json-schema-limitations):
 * every object needs additionalProperties:false, no numeric/string/array-size
 * constraints (minItems 0/1 only), enum/default/format(date…) are fine.
 */
import { registry, type JsonSchema } from "../skills/registry";

const DROP = new Set(["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "maxItems", "pattern", "uniqueItems", "minProperties", "maxProperties"]);

/** Deep-clean a schema into the strict subset. Objects get additionalProperties:false; unsupported keywords are dropped. */
export function strictify(schema: JsonSchema): JsonSchema {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) {
    if (DROP.has(k)) continue;
    if (k === "minItems") {
      if (v === 0 || v === 1) out[k] = v;
      continue;
    }
    if (k === "properties" && v && typeof v === "object") {
      out[k] = Object.fromEntries(Object.entries(v as Record<string, JsonSchema>).map(([pk, pv]) => [pk, strictify(pv)]));
      continue;
    }
    if (k === "items" && v && typeof v === "object") {
      out[k] = strictify(v as JsonSchema);
      continue;
    }
    if ((k === "anyOf" || k === "allOf" || k === "oneOf") && Array.isArray(v)) {
      out[k] = (v as JsonSchema[]).map(strictify);
      continue;
    }
    if (k === "additionalProperties") continue; // re-added below for objects
    out[k] = v;
  }
  if (out.type === "object" || out.properties) {
    out.additionalProperties = false;
    if (!out.type) out.type = "object";
    if (!Array.isArray(out.required)) out.required = [];
  }
  return out as JsonSchema;
}

/** Union of every skill's parameters: one strict object the run_skill tool can carry for any skill.
 *  Enums for the same key are merged; descriptions say which skills use the parameter. */
export function unionSkillParamsSchema(): JsonSchema {
  const props: Record<string, JsonSchema & { _skills?: string[] }> = {};
  for (const s of registry.skills) {
    for (const [k, v] of Object.entries(s.input_schema.properties ?? {})) {
      const cur = props[k];
      if (!cur) {
        props[k] = { ...structuredClone(v), _skills: [s.name] };
        continue;
      }
      cur._skills!.push(s.name);
      const a = cur.enum as unknown[] | undefined;
      const b = v.enum as unknown[] | undefined;
      if (a && b) cur.enum = Array.from(new Set([...a, ...b]));
      const ai = (cur.items as JsonSchema | undefined)?.enum as unknown[] | undefined;
      const bi = (v.items as JsonSchema | undefined)?.enum as unknown[] | undefined;
      if (ai && bi) (cur.items as JsonSchema).enum = Array.from(new Set([...ai, ...bi]));
      if (cur.properties && v.properties) cur.properties = { ...(v.properties as Record<string, JsonSchema>), ...(cur.properties as Record<string, JsonSchema>) };
    }
  }
  const common = new Set(["platform", "window", "brands", "limit"]);
  const properties: Record<string, JsonSchema> = {};
  for (const [k, { _skills, ...schema }] of Object.entries(props)) {
    const desc = String(schema.description ?? "").trim();
    const used = common.has(k) ? "all skills" : `used by ${_skills!.join(", ")}`;
    delete (schema as Record<string, unknown>).default; // defaults are applied server-side per skill
    properties[k] = strictify({ ...schema, description: desc ? `${desc} (${used})` : used });
  }
  return { type: "object", properties, required: [], additionalProperties: false };
}
