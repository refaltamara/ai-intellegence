import { describe, expect, it } from "vitest";
import { readWatch, watchUrl } from "../daily";

describe("posts to watch (22 Oct 2026)", () => {
  it("store a watched url the way the loader stores the post", () => {
    expect(watchUrl("https://www.threads.net/@kahfeveryday/post/Dex9_cQGtqd/?xmt=abc")).toBe("https://threads.com/@kahfeveryday/post/Dex9_cQGtqd");
    expect(watchUrl("https://twitter.com/kahfeveryday/status/1")).toBe("https://x.com/kahfeveryday/status/1");
    expect(watchUrl("not a link")).toBeNull();
  });
  it("read settings.pr.watch: a list of { url, label }, anything else left out", () => {
    expect(readWatch([{ url: "https://www.threads.com/@kahfeveryday/post/Dex9_cQGtqd", label: "Kahf's statement, 22 Oct" }, { label: "no url" }, "x", null])).toEqual([
      { url: "https://threads.com/@kahfeveryday/post/Dex9_cQGtqd", label: "Kahf's statement, 22 Oct" },
    ]);
    expect(readWatch({ url: "https://threads.com/@a/post/b" })).toEqual([]);
    expect(readWatch(undefined)).toEqual([]);
  });
});
