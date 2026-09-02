import { describe, expect, it } from "vitest";
import { CitationStream, renumberEvidence, rewriteCitations } from "../evidence";
import { buildTools } from "../tools";
import { skillNames } from "../../skills/registry";

describe("evidence citations", () => {
  const known = new Set(["ev_01", "ev_02"]);
  it("rewrites known ids and strips unknown ones", () => {
    const r = rewriteCitations("Up 12% [ev_01] and flat [ev_09]. Both [ev_01, ev_02].", known);
    expect(r.text).toBe('Up 12% <ev id="ev_01"></ev> and flat . Both <ev id="ev_01"></ev><ev id="ev_02"></ev>.');
    expect(r.miss).toEqual(["ev_09"]);
    expect(r.cited).toEqual(["ev_01", "ev_01", "ev_02"]);
  });
  it("never splits a citation across stream chunks", () => {
    const s = new CitationStream(known);
    const out = s.push("Skintific led [ev") + s.push("_0") + s.push("1] this week") + s.flush();
    expect(out).toBe('Skintific led <ev id="ev_01"></ev> this week');
    expect(s.miss).toEqual([]);
  });
  it("renumbers evidence across tool calls and remaps row references", () => {
    const counter = { n: 2 };
    const r = renumberEvidence([{ id: "ev_01", type: "post", ref: "x", label: "a" }], [{ evidence_ids: ["ev_01"] }], { top: "ev_01" }, counter);
    expect(r.evidence[0].id).toBe("ev_03");
    expect(r.rows[0].evidence_ids).toEqual(["ev_03"]);
    expect(r.summary.top).toBe("ev_03");
  });
});

describe("tool definitions", () => {
  it("are generated from the registry and none are strict", () => {
    const tools = buildTools();
    expect(tools.map((t) => t.name)).toEqual(["run_skill", "query_metrics", "create_agent_draft"]);
    const run = tools[0] as any;
    for (const t of tools) expect((t as any).strict).toBe(false);
    expect(run.input_schema.properties.skill.enum).toEqual(skillNames());
    for (const n of skillNames()) expect(run.description).toContain(`${n} — `);
  });
});
