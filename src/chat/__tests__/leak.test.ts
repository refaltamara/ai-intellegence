import { describe, expect, it } from "vitest";
import { scrubMechanism } from "../leak";

const names = ["discovery", "top-content", "hashtag-overlap"];

describe("scrubMechanism", () => {
  it("strips a slashed skill name and records the leak", () => {
    const r = scrubMechanism("I used /discovery to find them.", names);
    expect(r.text).toBe("I used discovery to find them.");
    expect(r.leaks).toEqual(["/discovery"]);
  });
  it("turns a hyphenated name into words", () => {
    expect(scrubMechanism("See /top-content for the list", names).text).toBe("See top content for the list");
  });
  it("leaves ordinary slashes and the word run alone", () => {
    const r = scrubMechanism("TikTok/Instagram views fell 30/90 days; in the long run it recovers.", names);
    expect(r.text).toBe("TikTok/Instagram views fell 30/90 days; in the long run it recovers.");
    expect(r.leaks).toEqual([]);
  });
  it("counts tool names without altering the sentence", () => {
    const r = scrubMechanism("The run_skill call returned SQL rows.", names);
    expect(r.text).toBe("The run_skill call returned SQL rows.");
    expect(r.leaks).toEqual(["run_skill", "SQL"]);
  });
});
