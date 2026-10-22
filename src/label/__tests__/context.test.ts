import { describe, expect, it } from "vitest";
import { LABEL_COMMENTS_TOOL, LABEL_POSTS_TOOL, commentSystem, labelTool, parseLabels, stanceSystem, type LabelContext } from "../prompt";
import { commentLabelRows, postLabelRows } from "../../labels/record";

const kahf: LabelContext = {
  subject: "Kahf",
  about: "Kahf, an Indonesian men's grooming brand sold in Malaysia",
  context: "Kahf posted a meme placing Indonesia above other ASEAN countries after the AFF win, deleted it and apologised.",
  languages: "Malay, Indonesian and English",
  topics: [
    { id: "kahf-threads:boycott", label: "Boycott calls", definition: "calls to stop buying", catch_all: false },
    { id: "kahf-threads:others", label: "Others", definition: null, catch_all: true },
  ],
  voices: ["Malaysian", "Indonesian"],
  voice_hint: "tak/nak are Malay; gak/banget are Indonesian.",
  post_off_topic: true,
};

describe("labelling with a workspace context", () => {
  it("keeps the original prompts and tools when a workspace has none", () => {
    expect(commentSystem("Maudy Ayunda")).toContain("an Indonesian public figure");
    expect(stanceSystem("Maudy Ayunda")).toContain("or is about something else");
    expect(labelTool("comments", "Maudy Ayunda")).toBe(LABEL_COMMENTS_TOOL);
    expect(labelTool("posts", { subject: "Maudy Ayunda" })).toBe(LABEL_POSTS_TOOL);
  });
  it("tells the model who the subject is, what happened, the topics and the voices", () => {
    const sys = commentSystem(kahf);
    expect(sys).toContain("Kahf, an Indonesian men's grooming brand");
    expect(sys).not.toContain("public figure");
    expect(sys).toContain("What happened:");
    expect(sys).toContain("- kahf-threads:boycott: Boycott calls: calls to stop buying");
    expect(sys).toContain("(anything that fits no other topic, including off-topic)");
    expect(sys).toContain("Malaysian, Indonesian, or unclear");
    expect(stanceSystem(kahf)).toContain("- off_topic: not about Kahf");
  });
  it("asks for topic and voice in the tool, and off_topic for posts", () => {
    const t = labelTool("posts", kahf) as unknown as { input_schema: { properties: { labels: { items: { properties: Record<string, { enum?: string[] }>; required: string[] } } } } };
    const item = t.input_schema.properties.labels.items;
    expect(item.properties.sentiment.enum).toEqual(["positive", "neutral", "negative", "off_topic"]);
    expect(item.properties.topic.enum).toEqual(["kahf-threads:boycott", "kahf-threads:others"]);
    expect(item.properties.voice.enum).toEqual(["Malaysian", "Indonesian", "unclear"]);
    expect(item.required).toEqual(["id", "sentiment", "topic", "voice"]);
  });
  it("keeps a label whose topic or voice is unknown, without them", () => {
    const extra = { topics: ["kahf-threads:boycott", "kahf-threads:others"], voices: ["Malaysian", "Indonesian"] };
    const { labels } = parseLabels({ labels: [
      { id: "a", sentiment: "negative", confidence: 0.9, topic: "kahf-threads:boycott", voice: "Malaysian" },
      { id: "b", sentiment: "off_topic", topic: "made-up", voice: "Singaporean" },
      { id: "c", sentiment: "neutral", topic: "kahf-threads:others", voice: "unclear" },
    ] }, ["a", "b", "c"], ["positive", "neutral", "negative", "off_topic"], extra);
    expect(labels).toEqual([
      { id: "a", sentiment: "negative", confidence: 0.9, topic: "kahf-threads:boycott", voice: "Malaysian" },
      { id: "b", sentiment: "off_topic", confidence: 0.5 },
      { id: "c", sentiment: "neutral", confidence: 0.5, topic: "kahf-threads:others", voice: "unclear" },
    ]);
  });
  it("asks why a row is set aside, where the workspace names reasons (22 Oct 2026)", () => {
    const daily: LabelContext = { ...kahf, topics: undefined, aside: [
      { id: "kahf-daily:other-brands", label: "Other brands' boycott", definition: "the boycott of other Indonesian brands", catch_all: false },
      { id: "kahf-daily:irrelevant", label: "Irrelevant", definition: "Surah Al-Kahf, names", catch_all: false },
    ] };
    expect(stanceSystem(daily)).toContain("When a post is off_topic, also say why it is set aside");
    expect(commentSystem(daily)).toContain("- kahf-daily:irrelevant: Irrelevant: Surah Al-Kahf, names");
    const t = labelTool("posts", daily) as unknown as { input_schema: { properties: { labels: { items: { properties: Record<string, { enum?: string[] }>; required: string[] } } } } };
    expect(t.input_schema.properties.labels.items.properties.aside.enum).toEqual(["kahf-daily:other-brands", "kahf-daily:irrelevant"]);
    expect(t.input_schema.properties.labels.items.required).not.toContain("aside");
    // a reason only for what is set aside; an unknown one falls to the last
    const { labels } = parseLabels({ labels: [
      { id: "a", sentiment: "off_topic", aside: "kahf-daily:other-brands", voice: "Malaysian" },
      { id: "b", sentiment: "off_topic", aside: "made-up" },
      { id: "c", sentiment: "negative", aside: "kahf-daily:other-brands" },
    ] }, ["a", "b", "c"], ["positive", "neutral", "negative", "off_topic"], { voices: ["Malaysian", "Indonesian"], aside: ["kahf-daily:other-brands", "kahf-daily:irrelevant"] });
    expect(labels.map((l) => [l.id, l.aside ?? null])).toEqual([["a", "kahf-daily:other-brands"], ["b", "kahf-daily:irrelevant"], ["c", null]]);
    // the history keeps the reason as the row's topic, as the core does
    expect(postLabelRows({ ...labels[0], confidence: 0.5 }).find((r) => r.kind === "topic")?.value).toBe("kahf-daily:other-brands");
    expect(commentLabelRows({ ...labels[2], confidence: 0.5 }).find((r) => r.kind === "topic")?.value).toBeNull();
  });
});
