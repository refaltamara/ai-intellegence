import { describe, expect, it } from "vitest";
import { BRAND_KOL, PR, ROLES, SOCIAL } from "../model";
import { allowed, resolve, sanitize } from "../policy";
import { compareVersions, isVersion } from "../version";
import { DECK_TEMPLATE_KEYS, NAV_KEYS, SKILL_LAYERS } from "../registry";
import registry from "../../../skills.registry.json";

describe("role versions", () => {
  it("each role carries its codename and starts at 1.0", () => {
    expect([PR.codename, BRAND_KOL.codename, SOCIAL.codename]).toEqual(["Chorus", "Atlas", "Spark"]);
    for (const r of Object.values(ROLES)) expect(r.version).toBe("1.0");
  });

  it("compares major.minor as numbers", () => {
    expect(compareVersions("1.10", "1.9")).toBeGreaterThan(0);
    expect(compareVersions("2.0", "1.12")).toBeGreaterThan(0);
    expect(compareVersions("1.0", "1.0")).toBe(0);
    expect(isVersion("1.1")).toBe(true);
    expect(isVersion("1")).toBe(false);
    expect(isVersion("v1.1")).toBe(false);
  });
});

describe("resolve", () => {
  it("with no changes, every role resolves to itself", () => {
    for (const r of Object.values(ROLES)) {
      const out = resolve(r, null, null);
      expect(out.role).toEqual(r);
      expect(out.dropped).toEqual([]);
    }
  });

  it("applies a company's changes inside the guard rails", () => {
    const { role, dropped } = resolve(PR, { "alert.negative_multiple": 2.5, "alert.min_comments": 100, house_rules: ["Refer to the client as GoPay, never Gojek."] }, null);
    expect(role.alert).toEqual({ negative_multiple: 2.5, min_comments: 100, baseline_days: 28 });
    expect(role.house_rules).toEqual(["Refer to the client as GoPay, never Gojek."]);
    expect(dropped).toEqual([]);
    expect(PR.alert!.negative_multiple).toBe(2); // the Fair role is not mutated
  });

  it("refuses values outside the guard rails and locked fields", () => {
    const { role, dropped } = resolve(PR, { "alert.min_comments": 5, voice: "Be rude.", label: "Comms", codename: "Mine" }, null);
    expect(role.alert!.min_comments).toBe(50);
    expect(role.voice).toBe(PR.voice);
    expect(role.label).toBe(PR.label);
    expect(dropped.map((d) => `${d.path}:${d.why}`).sort()).toEqual(["alert.min_comments:invalid", "codename:locked", "label:locked", "voice:locked"]);
  });

  it("a member may only change their own settings", () => {
    const { role, dropped } = resolve(PR, { "prefs.days": 14 }, { "prefs.days": 30, "alert.min_comments": 200 });
    expect(role.prefs).toEqual({ days: 30 });
    expect(role.alert!.min_comments).toBe(50);
    expect(dropped).toEqual([{ layer: "member", path: "alert.min_comments", why: "locked" }]);
  });

  it("a block the Fair role does not have cannot be added", () => {
    const { role, dropped } = resolve(PR, { "watch.storm_negative": 10 }, null);
    expect(role.watch).toBeUndefined();
    expect(dropped).toEqual([{ layer: "company", path: "watch.storm_negative", why: "locked" }]);
    expect(resolve(SOCIAL, { "watch.storm_negative": 10 }, null).role.watch!.storm_negative).toBe(10);
  });

  it("nav and deck templates can be narrowed or reordered, never extended", () => {
    expect(resolve(PR, { nav: ["chats", "dashboard"] }, null).role.nav).toEqual(["chats", "dashboard"]);
    expect(resolve(PR, { nav: ["dashboard"] }, null).dropped[0].why).toBe("invalid"); // Chats stays
    expect(resolve(PR, { nav: ["dashboard", "chats", "weekly"] }, null).dropped[0].why).toBe("invalid");
    expect(resolve(PR, { deck_templates: ["issue-postmortem", "reputation-weekly"] }, null).role.deck_templates).toEqual(["issue-postmortem", "reputation-weekly"]);
    expect(resolve(PR, { deck_templates: ["weekly-pulse"] }, null).dropped[0].why).toBe("invalid");
  });

  it("drops ids the code no longer knows from a stored role", () => {
    const stale = { ...PR, nav: [...PR.nav, "insights" as never], deck_templates: [...PR.deck_templates, "gone-template"], skill_order: ["comments", "gone-layer"] };
    const { role } = resolve(stale, null, null);
    expect(role.nav).toEqual(PR.nav);
    expect(role.deck_templates).toEqual(PR.deck_templates);
    expect(role.skill_order).toEqual(["comments"]);
  });

  it("sanitize keeps only what a layer may set", () => {
    expect(sanitize({ "alert.min_comments": 80, voice: "x", "prefs.answer": "short" }, "company", PR)).toEqual({ "alert.min_comments": 80, "prefs.answer": "short" });
    expect(sanitize({ "alert.min_comments": 80, "prefs.answer": "short" }, "member", PR)).toEqual({ "prefs.answer": "short" });
    expect(allowed("house_rules", "member")).toBe(false);
  });
});

describe("registry", () => {
  it("knows every nav key, template and skill layer the roles use", () => {
    for (const r of Object.values(ROLES)) {
      for (const k of r.nav) expect(NAV_KEYS).toContain(k);
      for (const t of r.deck_templates) expect(DECK_TEMPLATE_KEYS).toContain(t);
      for (const l of r.skill_order ?? []) expect(SKILL_LAYERS).toContain(l);
    }
  });

  it("matches the layers in skills.registry.json", () => {
    const layers = [...new Set((registry as { skills: { layer: string }[] }).skills.map((s) => s.layer))].sort();
    expect([...SKILL_LAYERS]).toEqual(layers);
  });
});
