import { describe, expect, it } from "vitest";
import { CLIENT_KINDS, SIGNALS, cleanPayload, isSignalKind } from "../kinds";
import { creationShape, queryIntent, ruleCategory, skillIntent } from "../vocab";
import { composerPosition, ordinal, shapeLabel } from "../labels";
import { FIXED_MEASURES, measureOf, suggestMeasures } from "../measures";
import { originPhrase, readingSentence, type OriginDetail } from "../outcomes";
import { ROLES } from "../../roles/model";

describe("signal payloads keep only the whitelist", () => {
  it("drops unknown fields and free text", () => {
    expect(cleanPayload("chat.turn", { conv: "0f8fad5b-d9cb-469f-a165-70867728950e", first: true, text: "what about GoPay?", from: "typed" })).toEqual({ conv: "0f8fad5b-d9cb-469f-a165-70867728950e", first: true, from: "typed" });
    expect(cleanPayload("chat.analysis", { layer: "skill", analysis: "Top content for GoPay!", intent: "issue_check" })).toEqual({ layer: "skill", intent: "issue_check" });
    expect(cleanPayload("chat.analysis", { layer: "sql", analysis: "top-content", intent: "made up" })).toEqual({ analysis: "top-content" });
  });
  it("never carries a number from the data or a sentence", () => {
    expect(cleanPayload("dashboard.tile_viewed", { tile: "amplifiers", views: 1234 })).toEqual({ tile: "amplifiers" });
    expect(cleanPayload("deck.slide_ask", { report: "not-a-uuid", n: 3 })).toEqual({ n: 3 });
    expect(cleanPayload("chat.pane_open", { anything: "x" })).toEqual({});
  });
  it("keeps setting values that are numbers, flags or ids, never words people chose", () => {
    expect(cleanPayload("setting.changed", { path: "alert.crisis_multiple", value: 4 })).toEqual({ path: "alert.crisis_multiple", value: 4 });
    expect(cleanPayload("setting.changed", { path: "tiles.hidden", value: ["amplifiers", "service"] })).toEqual({ path: "tiles.hidden", value: ["amplifiers", "service"] });
    expect(cleanPayload("setting.changed", { path: "tiles.names", value: { issues: "Isu hari ini" } })).toEqual({ path: "tiles.names" });
    expect(cleanPayload("setting.changed", { path: "tiles.names", value: "isu" })).toEqual({ path: "tiles.names" });
    expect(cleanPayload("setting.changed", { path: "prefs.answer", value: "Always mention Legal" })).toEqual({ path: "prefs.answer" });
  });
  it("lets the browser send only its own kinds", () => {
    expect(CLIENT_KINDS.sort()).toEqual(["chat.copy", "chat.pane_open", "chat.show_chart", "dashboard.tile_viewed", "deck.version_opened"]);
    expect(isSignalKind("creation.approved")).toBe(true);
    expect(isSignalKind("toString")).toBe(false);
    for (const k of Object.keys(SIGNALS)) expect(k).toMatch(/^[a-z]+\.[a-z_]+$/);
  });
});

describe("shapes and intents are computed inside the workspace", () => {
  it("a skill's shape is its query, with a client-named field as ext", () => {
    expect(creationShape("skill", { title: "Keluhan biaya", query: { entity: "comments", group_by: ["topic"], metrics: ["count_comments"], filters: { sentiment: ["negative"] } } })).toBe("skill.comments.topic.count_comments");
    expect(creationShape("skill", { query: { entity: "posts", group_by: ["brand_id", "ext_persona"], metrics: ["sum_views"] } })).toBe("skill.posts.brand_id-ext.sum_views");
    expect(shapeLabel("skill.posts.brand_id-ext.sum_views")).toBe("a skill over posts by brand and by one of their own fields");
  });
  it("a house rule travels as its category only", () => {
    expect(creationShape("rule", { text: "Never draft anything about OJK without saying Legal must review" })).toBe("rule.review");
    expect(ruleCategory("We call it isu, not issue")).toBe("naming");
    expect(ruleCategory("Write holding statements in a calm tone")).toBe("drafting");
    expect(ruleCategory("Our fiscal month starts on the 26th")).toBe("other");
    expect(creationShape("fact", { text: "Paylater launches 1 Nov" })).toBe("fact");
    expect(shapeLabel("rule.review")).toBe("house rules about review");
  });
  it("templates and extensions by where they came from", () => {
    expect(creationShape("deck_template", { name: "Our weekly", from: "reputation-weekly" })).toBe("deck.reputation-weekly");
    expect(creationShape("deck_template", { name: "Ours" })).toBe("deck.scratch");
    expect(creationShape("extension", { name: "Persona", target: "creators", source: "cemo" })).toBe("extension.creators.cemo");
    expect(shapeLabel("extension.creators.cemo")).toBe("a data extension on creators filled by CeMO");
  });
  it("intents", () => {
    expect(skillIntent("top-content")).toBe("content");
    expect(skillIntent("seeding")).toBe("issue_check");
    expect(skillIntent("nope")).toBe("other");
    expect(queryIntent({ entity: "comments", metrics: ["count_comments", "negative_pct"], group_by: ["day"] })).toBe("issue_check");
    expect(queryIntent({ entity: "posts", filters: { source: "owned" }, group_by: ["week"] })).toBe("own_accounts");
    expect(queryIntent({ entity: "posts", group_by: ["brand_id"], metrics: ["sum_views"] })).toBe("competitor_comparison");
    expect(queryIntent(null)).toBe("data_question");
  });
});

describe("labels and measures", () => {
  it("composer position puts the role's own analyses first, then its layers", () => {
    const pr = ROLES.pr;
    expect(composerPosition({ recipes: ["complaints-by-topic", "negative-by-day"], skill_order: pr.skill_order }, "complaints-by-topic")).toBe(1);
    const firstSkill = composerPosition({ recipes: ["a", "b"], skill_order: ["comments"] }, "sentiment");
    expect(firstSkill).toBe(3);
    expect(composerPosition({ recipes: [] }, "not-a-skill")).toBeNull();
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd"]);
  });
  it("measures: fixed, per analysis, per tile; suggested from what a version changes", () => {
    expect(measureOf("show_chart")?.den).toEqual({ kind: "chat.analysis" });
    expect(measureOf("analysis:complaints-by-topic", { "complaints-by-topic": "Complaints by topic" })?.label).toBe("share of analyses that run Complaints by topic");
    expect(measureOf("tile_seen:amplifiers")?.label).toBe('"Amplifiers" viewed per Dashboard visit');
    expect(measureOf("drop table")).toBeNull();
    expect(FIXED_MEASURES).toContain("analyses_per_week");
    const before = { id: "pr" as const, recipes: ["complaints-by-topic"], tiles: {} };
    const after = { id: "pr" as const, recipes: ["complaints-by-topic", "fee-complaints"], tiles: { hidden: ["amplifiers"] } };
    expect(suggestMeasures(before, after)).toEqual(["analysis:fee-complaints", "tile_seen:amplifiers", "analyses_per_week", "company_share"]);
  });
});

describe("origins and readings", () => {
  const d = (kind: OriginDetail["kind"], ws: string | null, category: string | null): OriginDetail => ({ kind, ref: `${kind}-${ws}`, text: "x", workspace_id: ws, workspace_name: ws, category });
  it("says where a release came from without naming a client", () => {
    expect(originPhrase([d("creation", "a", "fintech"), d("creation", "b", "fintech"), d("creation", "c", "fintech"), d("creation", "c", "fintech")])).toBe("Started from creations in three fintech workspaces.");
    expect(originPhrase([d("creation", "a", "fintech"), d("creation", "b", "beauty"), d("insight", null, null)])).toBe("Started from creations in two workspaces and one insight.");
    expect(originPhrase([])).toBe("");
  });
  it("reads a before and after with its control", () => {
    const g = (workspaces: number, before: number | null, after: number | null) => ({ workspaces, before, after, num_before: 0, num_after: 0, den_before: 0, den_after: 0 });
    expect(readingSentence("Chorus", "1.1", { key: "x", label: "alerts opened", unit: "%", took: g(4, 31, 54), stayed: g(3, 30, 31) })).toBe("After Chorus 1.1, alerts opened rose from 31% to 54% in the 4 workspaces that took it; in the 3 that stayed, 30% to 31%.");
    expect(readingSentence("Atlas", "1.2", { key: "x", label: "analyses per workspace a week", unit: "per week", took: g(3, 12, 9.5), stayed: g(1, 4, 4) })).toBe("After Atlas 1.2, analyses per workspace a week fell from 12 per week to 9.5 per week in the 3 workspaces that took it; one workspace stayed, too few to compare.");
    expect(readingSentence("Spark", "1.1", { key: "x", label: "Show chart per analysis", unit: "%", took: g(5, 10, 10), stayed: g(0, null, null) })).toContain("held from 10% to 10%");
  });
});
