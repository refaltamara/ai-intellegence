import { describe, expect, it } from "vitest";
import { isExtDim, keyOf, matchValue, validateExt } from "../spec";
import { wordPattern } from "../fill";
import { validateRecipe } from "../../recipes/spec";
import { findingColumns } from "../../decks/findings";

describe("extension definitions", () => {
  it("keep a Persona table from CeMO's draft", () => {
    const v = validateExt({ name: "Persona", target: "creator", source: "rule", values: [{ name: "Mom", description: "Mothers" }, { name: "Student" }], rules: [{ value: "mom", terms: ["Ibu", "mama", "x"] }, { value: "Student", terms: ["kuliah"] }] });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.def.key).toBe("persona");
      expect(v.def.rules).toEqual([{ value: "Mom", terms: ["ibu", "mama"] }, { value: "Student", terms: ["kuliah"] }]);
    }
  });
  it("refuse what would be unclear or unbounded, with reasons", () => {
    const v = validateExt({ name: "Severity", target: "comment", source: "cemo", values: [{ name: "High" }, { name: "high" }] });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors.join(" ")).toMatch(/Each value once.*start date or brands/);
    const r = validateExt({ name: "Persona", target: "creator", source: "rule", values: [{ name: "Mom" }, { name: "none" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/kept for rows that fit no value.*at least one value/);
    expect(validateExt({ name: "Line", target: "post", source: "rule", values: [{ name: "A" }, { name: "B" }], rules: [{ value: "C", terms: ["c"] }] }).ok).toBe(false);
  });
  it("name values the way the definition spells them", () => {
    expect(matchValue([{ name: "Office worker" }], "office WORKER ")).toBe("Office worker");
    expect(matchValue([{ name: "Mom" }], "Dad")).toBeNull();
  });
  it("are dimensions named ext_<key>", () => {
    expect(isExtDim("ext_persona")).toBe(true);
    expect(isExtDim("ext_persona; drop table posts")).toBe(false);
    expect(keyOf("ext_hero_product")).toBe("hero_product");
  });
});

describe("rule words", () => {
  it("become whole-word patterns with every regex character escaped", () => {
    expect(wordPattern("Ibu")).toBe("\\mibu\\M");
    expect(wordPattern("anak  kos")).toBe("\\manak\\s+kos\\M");
    expect(wordPattern("c++ (x)")).toBe("\\mc\\+\\+\\s+\\(x\\)\\M");
  });
});

describe("company skills over extensions", () => {
  const base = { key: "views-by-persona", title: "Views by persona", description: "d", activity: "a", examples: ["q"], roles: ["brand_kol" as const], params: ["window" as const], present: "ranked" as const };
  it("may group by an extension; the workspace checks it when the skill runs", () => {
    expect(validateRecipe({ ...base, query: { entity: "posts", metrics: ["count_posts"], group_by: ["ext_persona"] } })).toEqual([]);
    expect(validateRecipe({ ...base, query: { entity: "posts", metrics: ["count_posts"], group_by: ["ext_x;"] } })).not.toEqual([]);
  });
  it("print the extension's name on a deck's finding slide", () => {
    const cols = findingColumns([{ ext_persona: "Mom", sum_views: 10, count_posts: 2 }]);
    expect(cols[0]).toMatchObject({ key: "ext_persona", label: "Persona" });
  });
});
