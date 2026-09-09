import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildExport, toCsv, toXlsx } from "../run";
import { xlsx, zip } from "../xlsx";

/** Reads a ZIP written by our writer back through its central directory. */
function unzip(buf: Buffer): Record<string, string> {
  const out: Record<string, string> = {};
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const n = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < n; i++) {
    expect(buf.readUInt32LE(p)).toBe(0x02014b50);
    const csize = buf.readUInt32LE(p + 20), nlen = buf.readUInt16LE(p + 28), off = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nlen);
    expect(buf.readUInt32LE(off)).toBe(0x04034b50);
    const lnlen = buf.readUInt16LE(off + 26), lxlen = buf.readUInt16LE(off + 28);
    const start = off + 30 + lnlen + lxlen;
    out[name] = inflateRawSync(buf.subarray(start, start + csize)).toString("utf8");
    p += 46 + nlen;
  }
  return out;
}

const run = {
  id: "11111111-1111-4111-8111-111111111111", skill: "discovery", created_at: "2026-09-09T01:00:00Z",
  pane_state: { excluded: ["c2"], sort: { key: "views", dir: "asc" as const } },
  result: {
    skill: "discovery", status: "ok", params_resolved: { tiers: ["nano"], platform: "tiktok", window: { from: "2026-04-01", to: "2026-06-30" }, rank_by: "views", limit: 50 }, summary: {}, diff_key: "creator_id",
    rows: [
      { creator_id: "c1", creator_handle: "ana", views: 900, er_pct: 3.5, used_by: [{ brand: "skintific", posts: 2 }], evidence_ids: ["ev_01"] },
      { creator_id: "c2", creator_handle: "budi", views: 500, er_pct: 1, used_by: [], evidence_ids: [] },
      { creator_id: "c3", creator_handle: "cici", views: 700, er_pct: null, used_by: [], evidence_ids: ["ev_03"] },
    ],
    evidence: [{ id: "ev_01", type: "post", ref: "p1", label: "ana · tiktok", url: "https://t.example/1" }, { id: "ev_03", type: "post", ref: "p3", label: "cici", url: "https://t.example/3" }],
    meta: { matched: 120, returned: 3, data_window: { from: "2026-04-01", to: "2026-06-30" }, freshness: "2026-06-30T12:00:00Z", caveats: ["Instagram capture is uneven."], sql_hash: "x", duration_ms: 1 },
  },
};

describe("buildExport", () => {
  const b = buildExport(run, { decisionName: "Ramadan launch", brandNames: { skintific: "Skintific" }, now: new Date("2026-09-09T03:00:00Z") });
  it("applies the pane state and labels columns for people", () => {
    expect(b.rows.map((r) => r[0])).toEqual(["cici", "ana"]); // budi excluded, ascending by views
    expect(b.columns.map((c) => c.label)).toEqual(["Creator", "Views", "Engagement rate (%)", "Worked for", "Evidence url"]);
    expect(b.rows[1]).toEqual(["ana", 900, 3.5, "skintific ×2", "https://t.example/1"]);
    expect(b.rows_before).toBe(3);
    expect(b.rows_after).toBe(2);
  });
  it("writes the About block", () => {
    const about = Object.fromEntries(b.about);
    expect(about.List).toBe("Creator discovery · nano · TikTok · Apr–Jun 26");
    expect(about.Filters).toBe("Nano · TikTok · 1 Apr 2026 to 30 Jun 2026 · ranked by views · top 50");
    expect(about.Rows).toBe("3 in the result, 2 exported (1 excluded by hand)");
    expect(about.Decision).toBe("Ramadan launch");
    expect(about.Note).toBe("Instagram capture is uneven.");
    expect(b.filename).toBe("creator-discovery-nano-tiktok-apr-jun-26-2026-09-09");
  });
  it("csv carries the About block as comments and numbers unquoted", () => {
    const csv = toCsv(b);
    expect(csv.startsWith("# List: Creator discovery")).toBe(true);
    expect(csv).toContain('"Creator","Views","Engagement rate (%)","Worked for","Evidence url"\n"cici",700,,,"https://t.example/3"\n"ana",900,3.5,"skintific ×2","https://t.example/1"');
  });
  it("xlsx is a valid zip with two sheets and the About sheet named", () => {
    const files = unzip(toXlsx(b));
    expect(Object.keys(files).sort()).toEqual(["[Content_Types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"]);
    expect(files["xl/workbook.xml"]).toContain('name="About this list"');
    expect(files["xl/worksheets/sheet1.xml"]).toContain("<v>900</v>");
    expect(files["xl/worksheets/sheet1.xml"]).toContain("Engagement rate (%)");
    expect(files["xl/worksheets/sheet2.xml"]).toContain("Ramadan launch");
  });
});

describe("xlsx writer", () => {
  it("escapes markup and round-trips through inflate", () => {
    const files = unzip(xlsx([{ name: "A<b>", rows: [["x & y", 1], ['q"', null]] }]));
    expect(files["xl/worksheets/sheet1.xml"]).toContain("x &amp; y");
    expect(files["xl/workbook.xml"]).toContain('name="A&lt;b&gt;"');
  });
  it("zip stores utf-8 names", () => {
    const files = unzip(zip([{ name: "héllo.txt", data: Buffer.from("hi") }]));
    expect(files["héllo.txt"]).toBe("hi");
  });
});
