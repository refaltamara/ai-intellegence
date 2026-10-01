import { describe, expect, it } from "vitest";
import { captionBatchPrompt, captionSystem, parseTags, READ_CAPTIONS_TOOL } from "../prompt";

describe("caption reading", () => {
  it("prints each post with its brand, who posted it and the cart product, and strips escaped emoji", () => {
    const p = captionBatchPrompt([
      { ref: "p1", platform: "tiktok", url: "u1", brands: ["ESQA"], source: "owned", handle: "esqa", format: "product_showcase", cart_product: null, caption: "Full set makeup ONLY 449K?! \\ud83d\\ude0d #ESQA #bundle" },
      { ref: "p2", platform: "instagram", url: "u2", brands: ["Wardah"], source: "earned", handle: "rina", format: null, cart_product: "Colorfit Skintint", caption: "Finally   skintint!" },
    ]);
    expect(p).toContain("ref=p1 · tiktok · brand account · brand: ESQA · format: product_showcase");
    expect(p).toContain("ref=p2 · instagram · creator @rina · brand: Wardah · cart: Colorfit Skintint");
    expect(p).not.toContain("\\ud83d");
    expect(p).toContain("caption: Finally skintint!");
  });

  it("keeps known refs and classes, shortens names, and reports the refs it did not get", () => {
    const { tags, missing } = parseTags({
      posts: [
        { ref: "p1", product: "Full Set Makeup Bundle Package Deluxe", event: "sale_event", event_name: "Payday sale", offer: "bundle", hook: "hard_sell", angle: "full makeup under 450K for payday shoppers" },
        { ref: "p2", product: "none", event: "launch", event_name: "Colorfit Skintint launch", offer: "nonsense", hook: "review", angle: "" },
        { ref: "p9", product: "x", event: "launch" },
        { ref: "p1", product: "duplicate" },
      ],
    }, ["p1", "p2", "p3"]);
    expect(tags).toEqual([
      { ref: "p1", product: "Full Set Makeup Bundle", event: "sale_event", event_name: "Payday sale", offer: "bundle", hook: "hard_sell", angle: "full makeup under 450K for payday" },
      { ref: "p2", product: null, event: "launch", event_name: "Colorfit Skintint launch", offer: "none", hook: "review", angle: null },
    ]);
    expect(missing).toEqual(["p3"]);
  });

  it("an ordinary post has no event name", () => {
    expect(parseTags({ posts: [{ ref: "p1", event: "none", event_name: "something", offer: "none", hook: "other" }] }, ["p1"]).tags[0].event_name).toBeNull();
    expect(parseTags({ posts: [{ ref: "p1", event: "made_up" }] }, ["p1"]).tags[0]).toMatchObject({ event: "none", offer: "none", hook: "other" });
  });

  it("the tool asks for every field and the prompt never asks the model to count", () => {
    const item = (READ_CAPTIONS_TOOL.input_schema as { properties: { posts: { items: { required: string[] } } } }).properties.posts.items;
    expect(item.required).toEqual(["ref", "product", "event", "event_name", "offer", "hook", "angle"]);
    expect(captionSystem()).toMatch(/never count/);
  });
});
