/**
 * Comments on a deck's slides (DECISIONS, 7 Oct 2026, "Teams build their own"). The team leaves
 * notes on a version's slide; a comment that mentions @CeMO gets a reply. CeMO answers from the
 * slide and the version's fact sheet (never a number it was not given: a sentence with one is
 * dropped), and when the comment asks for a change it proposes one through the same engine as
 * Chats and the Edit page (src/decks/changes.ts), drafting a new slide when one is asked for
 * (src/decks/slideDraft.ts). Nothing changes until someone presses the card's button.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { Actor } from "../auth/can";
import { can } from "../auth/can";
import { anthropicClient, describeModelError, toolAnswer } from "../chat/client";
import { hasModelCredentials, modelId } from "../chat/loop";
import { numbersIn } from "../competitor/narrative";
import type { WeeklyBlocks } from "../competitor/scheduled";
import { CREDIT_PRICES } from "../config/credits";
import { canSpend, charge } from "../credits/ledger";
import { sql } from "../db/client";
import { toJson } from "../db/json";
import { by, signal } from "../learning/signals";
import { fairRecipes } from "../recipes/store";
import { getReport } from "../reports/store";
import { isBuilder, companyRecipes } from "../company/creations";
import { cleanChange, libraryOf, previewDeckChange, roleOfSpec, type DeckChange, type DeckChangeProposal } from "./changes";
import { draftSlide } from "./slideDraft";
import { getDeck } from "./store";

export type SlideComment = { id: string; slide: number; author: "person" | "cemo"; author_name: string | null; author_email: string | null; text: string; proposal: DeckChangeProposal | null; created_at: string };

const CEMO = /(^|\s)@cemo\b/i;
export const mentionsCemo = (t: string) => CEMO.test(t);

export async function listComments(ws: string, reportId: string): Promise<SlideComment[]> {
  if (!/^[0-9a-f-]{36}$/.test(reportId)) return [];
  return (await sql.query(
    "select id, slide, author, author_name, author_email, text, proposal, created_at from slide_comments where workspace_id = $1 and report_id = $2 order by created_at",
    [ws, reportId],
  )) as SlideComment[];
}

async function insert(row: { ws: string; deck: string; report: string; slide: number; author: "person" | "cemo"; email: string | null; name: string | null; text: string; proposal?: unknown }): Promise<SlideComment> {
  const r = (await sql.query(
    `insert into slide_comments (workspace_id, deck_id, report_id, slide, author, author_email, author_name, text, proposal)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb) returning id, slide, author, author_name, author_email, text, proposal, created_at`,
    [row.ws, row.deck, row.report, row.slide, row.author, row.email, row.name, row.text, row.proposal ? toJson(row.proposal) : null],
  )) as SlideComment[];
  return r[0];
}

const ANSWER_TOOL: Anthropic.Tool = {
  name: "answer_comment",
  description: "Reply to the comment, and propose a change to the deck when it asks for one.",
  input_schema: {
    type: "object",
    properties: {
      reply: { type: "string", description: "one or two plain sentences; numbers only as the slide or the fact sheet print them" },
      change: {
        type: "object",
        description: "only when the comment asks to change the deck",
        properties: {
          add_slides: { type: "array", items: { type: "string" } },
          remove_slides: { type: "array", items: { type: "string" } },
          add_analyses: { type: "array", items: { type: "object", properties: { recipe: { type: "string" }, after: { type: "string" } }, required: ["recipe"] } },
          remove_analyses: { type: "array", items: { type: "string" } },
          grain: { type: "string", enum: ["day", "week", "month"] },
          name: { type: "string" },
          recurring: { type: "boolean" },
        },
        additionalProperties: false,
      },
      new_slide: { type: "string", description: "when they want a slide that no listed slide or analysis gives: what it should show, in one sentence (CeMO drafts the analysis)" },
      template: { type: "boolean", description: "they want the template the deck came from to change too" },
    },
    required: ["reply"],
    additionalProperties: false,
  },
};

/** Sentences that carry a number not on the slide or the sheet are dropped (the model never makes a number). */
function keepKnownNumbers(reply: string, pool: string): string {
  const known = new Set(numbersIn(pool).map((n) => n.value));
  const sentences = reply.split(/(?<=[.!?])\s+/);
  const kept = sentences.filter((s) => numbersIn(s).every((n) => known.has(n.value)));
  return kept.join(" ").trim();
}

/** CeMO's reply to a comment that mentions it: a short answer, and a change card when one is asked for. */
async function cemoReply(actor: Actor, ws: string, deckId: string, reportId: string, slide: number): Promise<SlideComment> {
  const say = (text: string, proposal?: DeckChangeProposal) => insert({ ws, deck: deckId, report: reportId, slide, author: "cemo", email: null, name: "CeMO", text, proposal });
  if (!hasModelCredentials()) return say("CeMO is not available on this server.");
  const spend = await canSpend(ws, CREDIT_PRICES.question);
  if (!spend.ok) return say(spend.message);
  const deck = await getDeck(deckId, ws);
  const report = await getReport(reportId, ws);
  const b = report?.blocks as unknown as WeeklyBlocks | undefined;
  if (!deck || !b?.slides?.length) return say("I could not read this version.");
  const role = roleOfSpec(deck.spec);
  const here = b.slides.find((s) => s.n === slide);
  const thread = (await listComments(ws, reportId)).filter((c) => c.slide === slide).slice(-8);
  const lib = libraryOf(deck.spec);
  const current = (deck.spec.rep?.slides ?? deck.spec.social?.slides ?? deck.spec.slides) as string[];
  const fair = [...(await fairRecipes()).values()].filter((r) => r.roles.includes(role));
  const own = await companyRecipes(ws, role, actor.email);
  const brief = [
    `Deck "${deck.name}" (${deck.spec.grain === "day" ? "day on day" : deck.spec.grain === "week" ? "week on week" : "month on month"}${deck.recurring ? ", repeating" : ""}). This version: ${b.week.label}.`,
    `Slides in it now: ${current.map((k) => `${k} (${lib.find((s) => s.kind === k)?.title ?? k})`).join(", ")}.${deck.spec.findings?.length ? ` The team's slides: ${deck.spec.findings.map((f) => `${f.skill.replace(/^recipe:/, "")} (${f.title})`).join(", ")}.` : ""}`,
    `Slides it can add: ${lib.filter((s) => !current.includes(s.kind)).map((s) => `${s.kind} (${s.title})`).join(", ") || "none"}.`,
    `Analyses it can add as a slide (add_analyses): ${[...fair, ...own].map((r) => `${r.key} (${r.title})`).join(", ") || "none"}.`,
    deck.spec.rep ? "" : "Day on day is only for PR decks.",
    `The slide they comment on: ${here ? `${here.n}. ${here.title}\n${here.text.slice(0, 1500)}` : `slide ${slide}`}`,
    `The version's fact sheet:\n${(b.sheet ?? "").slice(0, 7000)}`,
    `The comments on this slide, oldest first:\n${thread.map((c) => `${c.author === "cemo" ? "CeMO" : c.author_name ?? "Someone"}: ${c.text}`).join("\n")}`,
  ].filter(Boolean).join("\n\n");
  const system = [
    "You are CeMO, answering a comment the team left on a slide of their deck. Reply in one or two plain sentences, in the language of the comment.",
    "Use only numbers the slide or the fact sheet print, written the same way; never work out a new one.",
    "When the comment asks to change the deck (add or drop slides, a split, day/week/month, the name, the schedule), fill change; when it wants a slide nothing listed gives, describe it in new_slide. Say in the reply what the card will do; never say it is done. Set template when they say the template should change too.",
  ].join("\n");
  let input: { reply?: string; change?: unknown; new_slide?: string; template?: boolean } = {};
  try {
    const client = anthropicClient({ workspace: ws, purpose: "slide_comment", ref: reportId });
    const { use } = await toolAnswer((req) => client.messages.create(req), { model: modelId(), max_tokens: 3000, system, tools: [ANSWER_TOOL], messages: [{ role: "user", content: brief }] }, ANSWER_TOOL.name);
    input = (use?.input ?? {}) as typeof input;
  } catch (e) {
    return say(`CeMO could not answer: ${describeModelError(e).slice(0, 160)}`);
  }
  const reply = keepKnownNumbers(String(input.reply ?? ""), `${here?.text ?? ""}\n${b.sheet ?? ""}`) || "Here is what I would change.";
  let change: DeckChange = cleanChange(input.change ?? {});
  let drafted = false;
  if (input.new_slide && input.new_slide.trim().length > 5) {
    const d = await draftSlide(ws, role, input.new_slide, actor, "comment");
    if (d.ok) { change = { ...change, new_analyses: [{ recipe: d.draft.recipe }] }; drafted = true; }
    else return say(`${reply} I could not draft that slide: ${d.error}`);
  }
  const preview = await previewDeckChange(deck, change, actor.email);
  if (!preview.changed && !input.template) {
    await charge({ ws, email: actor.email, staff: actor.staff.length > 0, kind: "question", credits: CREDIT_PRICES.question, ref: reportId, note: "Slide comment" });
    return say(preview.dropped.length && (input.change || input.new_slide) ? `${reply} ${preview.dropped.join(" ")}` : reply);
  }
  // drafting the slide was charged when it was drafted; a change alone costs what any drafted change costs
  if (!drafted) await charge({ ws, email: actor.email, staff: actor.staff.length > 0, kind: "creation", credits: CREDIT_PRICES.creation, ref: deckId, note: `Change to ${deck.name}` });
  return say(reply, { deck_id: deck.id, deck_name: deck.name, change, lines: preview.lines, dropped: preview.dropped, template: !!input.template, team_template: !!deck.template?.startsWith("co-"), builder: isBuilder(actor, ws, role) });
}

/** Leave a comment on a slide; one that mentions @CeMO gets CeMO's reply too. */
export async function addComment(actor: Actor, ws: string, deckId: string, o: { report_id: string; slide: number; text: string }): Promise<{ ok: true; comments: SlideComment[] } | { ok: false; error: string }> {
  const deck = await getDeck(deckId, ws);
  if (!deck) return { ok: false, error: "No such deck." };
  const role = roleOfSpec(deck.spec);
  if (!can(actor, "role.use", { workspace: ws, role })) return { ok: false, error: "You are not on this team." };
  const report = await getReport(o.report_id, ws);
  if (!report || (report as { deck_id?: string | null }).deck_id !== deck.id) return { ok: false, error: "That version is not part of this deck." };
  const text = o.text.trim().slice(0, 2000);
  if (!text) return { ok: false, error: "Write something first." };
  const n = Math.max(1, Math.min(60, Math.round(o.slide)));
  const mine = await insert({ ws, deck: deck.id, report: report.id, slide: n, author: "person", email: actor.email, name: actor.name ?? null, text });
  const cemo = mentionsCemo(text);
  await signal(by(actor, ws, role), "deck.comment", { report: report.id, n, cemo });
  const out = [mine];
  if (cemo) out.push(await cemoReply(actor, ws, deck.id, report.id, n));
  return { ok: true, comments: out };
}
