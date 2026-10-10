/**
 * Loading into a case (DECISIONS, 10 Oct 2026, step 5, third part): what brought each link in, the case's own posts, who is
 * told about a case's load, and where a case's delivery lands.
 */
import { describe, expect, it } from "vitest";
import { BROUGHT_IN_BY, CASE_POSTS_SQL, STUB_SQL, postSql } from "../promote";
import { noticeRecipients } from "../notify";
import { byRecipient, caseOfDelivery, type Delivered } from "../intake";

describe("links know what brought them in", () => {
  for (const source of ["listening", "beauty", "profile"] as const) {
    it(`a ${source} load writes brought_in_by on a new link and keeps the rule on an old one`, () => {
      const text = postSql(source);
      expect(text).toMatch(/insert into posts \([^)]*\bbrought_in_by\b/);
      expect(text).toContain("$8::text");
      expect(text).toContain(`brought_in_by = ${BROUGHT_IN_BY}`);
      // a flip from a case to the panel is a change, so the row is written
      expect(text).toContain("posts.brought_in_by,");
    });
  }
  it("only the panel's load takes a link: a case's load never takes one from the panel or another case", () => {
    expect(BROUGHT_IN_BY).toBe("case when $8::text = 'panel' then 'panel' else posts.brought_in_by end");
  });
  it("a post known only from its comments is brought in by the load's panel or case", () => {
    expect(STUB_SQL(["caption"])).toMatch(/brought_in_by, caption\)/);
    expect(STUB_SQL(["caption"])).toContain("$4::text");
  });
  it("every post of a case's load is the case's, once", () => {
    expect(CASE_POSTS_SQL).toContain("insert into case_posts (case_id, item_id, workspace_id, load_id)");
    expect(CASE_POSTS_SQL).toContain("on conflict (case_id, item_id) do nothing");
    // stubs too: a post the case caught comments on is the case's
    expect(CASE_POSTS_SQL).not.toContain("not stub");
  });
});

describe("who hears about a load", () => {
  const people = [
    { email: "ops@fair.id", staff: ["data_ops"] },
    { email: "Owner@Fair.id", staff: ["owner"] },
    { email: "designer@fair.id", staff: ["designer"] },
    { email: "ops2@fair.id", staff: ["data_ops"] },
  ];
  it("the panel's held load: data ops", () => {
    expect(noticeRecipients(people, true, null, ["scraper@fair.id"])).toEqual(["ops@fair.id", "ops2@fair.id"]);
  });
  it("the panel's load with warnings: data ops and the scraper team", () => {
    expect(noticeRecipients(people, false, null, ["scraper@fair.id"])).toEqual(["ops@fair.id", "ops2@fair.id", "scraper@fair.id"]);
  });
  it("a case's load: only the owners and data ops on its list", () => {
    expect(noticeRecipients(people, true, ["owner@fair.id", "ops2@fair.id", "designer@fair.id", "client@brand.id"], ["scraper@fair.id"])).toEqual(["Owner@Fair.id", "ops2@fair.id"]);
    expect(noticeRecipients(people, false, ["ops2@fair.id"], ["scraper@fair.id"])).toEqual(["ops2@fair.id", "scraper@fair.id"]);
  });
  it("a case with nobody from Fair's data side on its list tells nobody by email", () => {
    expect(noticeRecipients(people, true, ["client@brand.id"], ["scraper@fair.id"])).toEqual([]);
  });
});

describe("where a delivery lands", () => {
  const f = (pathname: string): Delivered => ({ url: `https://store/${pathname}`, pathname, size: 1 });
  it("reads the case from inbox/<workspace>/cases/<case id>/", () => {
    expect(caseOfDelivery("fintech-id", "inbox/fintech-id/cases/gopay-outage/content_20261010.csv")).toBe("gopay-outage");
    expect(caseOfDelivery("fintech-id", "inbox/fintech-id/content_20261010.csv")).toBeNull();
    expect(caseOfDelivery("fintech-id", "inbox/fintech-id/cases/gopay-outage")).toBeNull();
    expect(caseOfDelivery("fintech-id", "inbox/other-ws/cases/gopay-outage/content_20261010.csv")).toBeNull();
  });
  it("groups the panel's files apart from each open case's; a closed or unknown case's files wait", () => {
    const files = [
      f("inbox/fintech-id/content_20261010.csv"),
      f("inbox/fintech-id/cases/gopay-outage/content_20261010.csv"),
      f("inbox/fintech-id/cases/gopay-outage/comment_20261010.csv"),
      f("inbox/fintech-id/cases/closed-case/content_20261010.csv"),
      f("inbox/fintech-id/cases/content_20261010.csv"),
    ];
    const g = byRecipient("fintech-id", files, new Set(["gopay-outage"]));
    expect([...g.keys()]).toEqual([null, "gopay-outage"]);
    expect(g.get(null)!.map((x) => x.pathname)).toEqual(["inbox/fintech-id/content_20261010.csv"]);
    expect(g.get("gopay-outage")!.length).toBe(2);
  });
});
