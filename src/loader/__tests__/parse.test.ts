import { describe, expect, it } from "vitest";
import { hashtags, int, localDay, localMonth, naiveLocal, readCsv, roundHalfEven } from "../parse";
import { canonUrl, handleFromUrl, parseWhen, postIdFromUrl, snowflakeTime, toInt } from "../adapters/profile";
import { completeDumps } from "../intake";
import { flagsOf } from "../adapters/beauty";

describe("cells read as the Python loaders read them", () => {
  it("rounds halves to even, as Python's round()", () => {
    expect([0.5, 1.5, 2.5, 3.5, 2.4, 2.6].map(roundHalfEven)).toEqual([0, 2, 2, 4, 2, 3]);
    expect(int("42600.0")).toBe(42600);
    expect(int("")).toBeNull();
    expect(int("abc")).toBeNull();
  });
  it("reads naive times as local time in the zone", () => {
    expect(naiveLocal("2026-04-11 00:30:00", "Asia/Jakarta")!.toISOString()).toBe("2026-04-10T17:30:00.000Z");
    expect(naiveLocal("2026-04-11 9:05:00", "Asia/Jakarta")!.toISOString()).toBe("2026-04-11T02:05:00.000Z");
    expect(naiveLocal("2026-07-01", "Asia/Jakarta")!.toISOString()).toBe("2026-06-30T17:00:00.000Z");
    expect(naiveLocal("2026-13-01", "Asia/Jakarta")).toBeNull();
  });
  it("puts a moment in its local day and month", () => {
    expect(localDay(new Date("2026-03-31T17:00:00Z"), "Asia/Jakarta")).toBe("2026-04-01");
    expect(localMonth(new Date("2026-03-31T16:59:59Z"), "Asia/Jakarta")).toBe("2026-03-01");
    expect(localDay(new Date("2026-04-10T18:30:00Z"), "Asia/Kolkata")).toBe("2026-04-11");
  });
  it("finds each hashtag once, lowercased, in any script", () => {
    expect(hashtags("Cek #GlowUp dan #glowup lagi #kulit_sehat #美白")).toEqual(["glowup", "kulit_sehat", "美白"]);
    expect(hashtags("no tags")).toBeNull();
  });
  it("names repeated headers as pandas does", () => {
    // pandas: likes, likes.1, Unnamed: 2; the profile loader drops the unnamed column
    const rows = readCsv(Buffer.from("likes,likes,\n1,2,3\n"), "x.csv", { lowerHeaders: true });
    expect(rows[0]).toEqual({ likes: "1", "likes.1": "2" });
  });
});

describe("profile exports (etl/load_profile.py rules)", () => {
  it("gives every post url one identity", () => {
    expect(canonUrl("https://www.threads.net/@kahfeveryday/post/DeKWiFpE_9K/?xmt=1", "threads")).toBe("https://threads.com/@kahfeveryday/post/DeKWiFpE_9K");
    expect(canonUrl("twitter.com/someone/status/2099767375331832026", "x")).toBe("https://x.com/someone/status/2099767375331832026");
    expect(canonUrl("​https://m.youtube.com/shorts/r1DSH9AQXLU", "youtube")).toBe("https://www.youtube.com/watch?v=r1DSH9AQXLU");
    expect(canonUrl("https://youtu.be/r1DSH9AQXLU", "youtube")).toBe("https://www.youtube.com/watch?v=r1DSH9AQXLU");
    expect(canonUrl("https://www.youtube.com/watch?v=r1DSH9AQXLU&t=30", "youtube")).toBe("https://www.youtube.com/watch?v=r1DSH9AQXLU");
    expect(canonUrl("https://www.instagram.com/p/ABC123/c/18012345/", "instagram")).toBe("https://instagram.com/p/ABC123");
    expect(canonUrl("Link: https://x.com/a/status/1", "x")).toBe("https://x.com/a/status/1");
    expect(canonUrl("", "x")).toBeNull();
  });
  it("reads ids and handles from urls", () => {
    expect(postIdFromUrl("https://www.youtube.com/watch?v=r1DSH9AQXLU", "youtube")).toBe("r1DSH9AQXLU");
    expect(postIdFromUrl("https://threads.com/@a/post/DeKWiFpE_9K", "threads")).toBe("DeKWiFpE_9K");
    expect(handleFromUrl("https://threads.com/@Kahf.Everyday/post/x")).toBe("kahf.everyday");
    expect(handleFromUrl("https://x.com/MaudyAyunda/status/1")).toBe("maudyayunda");
  });
  it("reads the date shapes the exports use", () => {
    const anchor = new Date("2026-09-15T06:00:00+07:00");
    const at = (v: string, tz: string | null = null) => parseWhen(v, anchor, tz);
    expect(at("2026-10-07T03:12:45.123Z").when!.toISOString()).toBe("2026-10-07T03:12:45.123Z");
    expect(at("2026-10-07 10:12:45").when!.toISOString()).toBe("2026-10-07T03:12:45.000Z");
    expect(at("2026-10-07 10:12:45", "UTC").when!.toISOString()).toBe("2026-10-07T10:12:45.000Z");
    expect(at("10/7/2026, 3:12:45 PM", "UTC").when!.toISOString()).toBe("2026-10-07T15:12:45.000Z");
    expect(at("15/9/2025, 12:05:00 AM", "UTC").when!.toISOString()).toBe("2025-09-15T00:05:00.000Z");
    expect(at("Wed Sep 10 12:34:56 +0000 2025").when!.toISOString()).toBe("2025-09-10T12:34:56.000Z");
    expect(at("Sep 15, 2025").when!.toISOString()).toBe("2025-09-14T17:00:00.000Z");
    expect(at("Sep, 15 2025").when!.toISOString()).toBe("2025-09-14T17:00:00.000Z");
    expect(at("5 days ago").when!.toISOString()).toBe("2026-09-09T23:00:00.000Z");
    expect(at("2 hours ago (edited)").how).toBe("relative");
    expect(at("1757900000123").when!.getTime()).toBe(1757900000123);
    expect(at("").how).toBe("empty");
    expect(at("whenever").how).toBe("unparseable");
    expect(at("2026-10-07 10:12:45").how).toBe("naive_local");
  });
  it("takes an X post's time from its status id", () => {
    expect(snowflakeTime("https://x.com/a/status/2099767375331832026")!.toISOString()).toBe("2026-09-15T07:48:48.727Z");
    expect(snowflakeTime("https://x.com/a/status/123")).toBeNull();
  });
  it("reads counts with thousands separators", () => {
    expect(toInt("174,000")).toBe(174000);
    expect(toInt("1.234.5")).toBeNull();
    expect(toInt("modmedia")).toBeNull();
  });
});

describe("load warnings", () => {
  it("flags 0 followers and videos with 0 views, not images", () => {
    expect(flagsOf(0, 10, "reel")).toEqual(["zero_followers"]);
    expect(flagsOf(null, 0, "video")).toEqual(["zero_views"]);
    expect(flagsOf(5, 0, "image")).toBeNull();
  });
});

describe("scraper deliveries", () => {
  const f = (name: string) => ({ url: `https://store/inbox/w/${name}`, pathname: `inbox/w/${name}`, size: 1 });
  const all = (stamp: string) => ["_content_", "_comment_", "comment_sentiment", "brand", "creator", "content_hashtag", "content_metric_snapshot", "topic", "content_tagged_user"].map((t) => f(`${t}_${stamp}.csv`));
  it("loads a dump once all its tables arrived, oldest first", () => {
    const partial = all("202610021730").filter((x) => !x.pathname.includes("_comment_"));
    const got = completeDumps([...all("202610031730"), ...partial, ...all("202610011730"), f("notes.txt")]);
    expect(got.map((d) => d.stamp)).toEqual(["202610011730", "202610031730"]);
    expect(got[0].files).toHaveLength(9);
  });
});

describe("a profile file's read time (readTimeOf)", () => {
  it("is the file's own export time, else no earlier than its latest post or the contract's time", async () => {
    const { readTimeOf } = await import("../adapters/profile");
    const anchor = new Date("2026-09-14T05:15:00Z");
    expect(readTimeOf({ export_time: "2026-09-14T12:15:00+07:00" }, anchor, ["2026-09-18T03:43:28Z"]).toISOString()).toBe("2026-09-14T05:15:00.000Z");
    expect(readTimeOf({}, anchor, ["2026-09-15T11:02:57Z", "2026-09-14T23:13:56Z"]).toISOString()).toBe("2026-09-15T11:02:57.000Z");
    expect(readTimeOf({}, anchor, ["2026-09-14T03:21:38Z"]).toISOString()).toBe("2026-09-14T05:15:00.000Z");
    expect(readTimeOf({}, anchor, []).toISOString()).toBe("2026-09-14T05:15:00.000Z");
  });
});
