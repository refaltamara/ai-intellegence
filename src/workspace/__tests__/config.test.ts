import { describe, expect, it } from "vitest";
import { fillCopy, workspaceConfig } from "../config";

describe("workspaceConfig", () => {
  it("a category workspace keeps CeMO and the beauty copy", () => {
    const c = workspaceConfig({ id: "beauty-id", name: "Fair Beauty", category: "beauty", client_brand_id: "wardahofficial", tz: "Asia/Jakarta", kind: "category", settings: {} }, "Wardah");
    expect(c.product_name).toBe("CeMO");
    expect(c.category_label).toBe("Beauty · Indonesia");
    expect(c.hero_title).toBe("What's happening in Indonesian beauty?");
    expect(c.persona.startsWith("You are CeMO — the CMO in the room for Fair Beauty.")).toBe(true);
    expect(c.subject_noun).toBe("creators");
  });
  it("a profile workspace is Fair Intelligence about one subject", () => {
    const c = workspaceConfig({ id: "maudy-ayunda", name: "Maudy Ayunda", category: "music", client_brand_id: "maudyayunda", tz: "Asia/Jakarta", kind: "profile", settings: { category_label: "Maudy Ayunda · Artist" } }, "Maudy Ayunda");
    expect(c.product_name).toBe("Fair Intelligence");
    expect(c.tagline).not.toContain("CMO");
    expect(c.hero_title).toBe("What are people saying about Maudy Ayunda?");
    expect(c.suggested[0]).toBe("What are people saying about Maudy Ayunda this week?");
    expect(c.persona).toContain("working with Maudy Ayunda's team");
    expect(c.subject_noun).toBe("accounts");
  });
  it("settings override the defaults for the kind", () => {
    const c = workspaceConfig({ id: "x", name: "X", category: null, client_brand_id: null, tz: "Asia/Jakarta", kind: "profile", settings: { product_name: "Panorama", suggested: ["Hi {{subject}}"] } });
    expect(c.product_name).toBe("Panorama");
    expect(c.suggested).toEqual(["Hi X"]);
    expect(c.category_label).toBe("X");
  });
  it("fillCopy fills every placeholder", () => {
    expect(fillCopy("{{name}}/{{subject}}/{{category}}/{{brands}}/{{platforms}}", { name: "a", subject: "b", category: "c", brands: 3, platforms: "X and Threads" })).toBe("a/b/c/3/X and Threads");
  });
});
