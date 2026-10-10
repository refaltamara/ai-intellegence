import { describe, expect, it } from "vitest";
import { blobPathOf, contentTypeOf, expired, keepUntil, workspaceOf, type Manifest } from "../store";

describe("raw files", () => {
  it("files each one under its workspace", () => {
    expect(workspaceOf("tiktok_q2_2026.csv.gz")).toBe("beauty-id");
    expect(workspaceOf("kahf/comments_threads_1007a.csv")).toBe("kahf-threads");
    expect(workspaceOf("maudy/contents_x.csv")).toBe("maudy-ayunda");
    expect(workspaceOf("fintech-id/content_20261001.csv")).toBe("fintech-id");
  });
  it("names the stored file raw/<workspace>/<file>", () => {
    expect(blobPathOf("tiktok_q2_2026.csv.gz")).toBe("raw/beauty-id/tiktok_q2_2026.csv.gz");
    expect(blobPathOf("kahf/comments_threads_1007a.csv")).toBe("raw/kahf-threads/comments_threads_1007a.csv");
    expect(blobPathOf("fintech-id/2026-10/content_1.csv")).toBe("raw/fintech-id/2026-10/content_1.csv");
  });
  it("keeps a file 12 months from the day it arrived", () => {
    expect(keepUntil("2026-09-02")).toBe("2027-09-02");
    const m: Manifest = { note: "", files: [
      { path: "a.csv", workspace: "w", blob: "raw/w/a.csv", bytes: 1, sha256: "x", received: "2025-10-01" },
      { path: "b.csv", workspace: "w", blob: "raw/w/b.csv", bytes: 1, sha256: "y", received: "2026-09-02" },
    ] };
    expect(expired(m, "2026-10-10").map((f) => f.path)).toEqual(["a.csv"]);
  });
  it("stores each file with its type", () => {
    expect(contentTypeOf("x.csv.gz")).toBe("application/gzip");
    expect(contentTypeOf("x.csv")).toBe("text/csv");
  });
});
