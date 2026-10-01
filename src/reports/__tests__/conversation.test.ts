import { describe, expect, it } from "vitest";
import type { MessageRow } from "../../chat/persist";
import { checkSummary, plainSummary, sectionsOf } from "../conversation";

const msg = (role: "user" | "assistant", content: MessageRow["content_json"]): MessageRow => ({ id: Math.random().toString(), conversation_id: "c", role, content_json: content, evidence_json: null, skill_run_ids: null, tokens_in: null, tokens_out: null, created_at: "" });

const messages = [
  msg("user", { text: "What is Glad2Glow doing on TikTok?" }),
  msg("assistant", { text: "TikTok, last 90 days, ranked by views, excluding Wardah creators.\nGlad2Glow leans on nano creators with a cart on 55% of posts <ev id=\"ev_01\"></ev>.\n- **Reach** — 182.2M views", tools: [{ id: "t1", name: "run_skill", input: {}, title: "Brand compare", status: "ok", rows: [{ brand_id: "g2g", views: 182_200_000, cart_share_pct: 55 }] }, { id: "t2", name: "export_run", input: {}, status: "ok" }] }),
  msg("user", { text: "You excluded 3 rows", hidden: true }),
  msg("assistant", { text: "With those three gone, the top three stay the same." }),
  msg("user", { text: "And Wardah?" }),
  msg("assistant", { text: "Wardah posts more but converts less: <counter>Before you copy it — cart share is 38%.</counter>" }),
];

describe("a report from a conversation", () => {
  it("keeps every question with its answer and results; pane actions join the open question; downloads are left out", () => {
    const s = sectionsOf(messages);
    expect(s.map((x) => x.question)).toEqual(["What is Glad2Glow doing on TikTok?", "And Wardah?"]);
    expect(s[0].answer).toContain("top three stay the same");
    expect(s[0].tools.map((t) => t.title)).toEqual(["Brand compare"]);
    expect(s[1].answer).not.toContain("<counter>");
  });

  it("the plain summary is each answer's lead finding, never its scope line", () => {
    expect(plainSummary(sectionsOf(messages)).findings).toEqual([
      "Glad2Glow leans on nano creators with a cart on 55% of posts <ev id=\"ev_01\"></ev>.",
      "Wardah posts more but converts less: Before you copy it — cart share is 38%.",
    ]);
  });

  it("the summary may only use numbers the conversation showed", () => {
    const s = sectionsOf(messages);
    expect(checkSummary({ findings: ["Glad2Glow drew 182.2M views with a cart on 55% of posts."], actions: [] }, s)).toEqual([]);
    expect(checkSummary({ findings: ["Glad2Glow grew 41% month on month."], actions: [] }, s)).toEqual(['findings[0]: "41%" is not a number in this conversation']);
  });
});
