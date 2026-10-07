/**
 * The signals of the learning loop (CMS plan, "The learning loop"): one small, structured
 * event per thing people do, written to model_events. This file is the whitelist: every
 * kind, its surface and family, and the fields its payload may carry. A field is an id
 * (a slug, a tile, a template, a recipe key, a row id), a choice from a fixed list, a
 * small whole number, a yes/no, or a setting value; anything else is dropped before it is
 * stored. Never the text of a question or answer, a comment, a post, a brand name, a
 * house rule's wording or a number from the data: that is the privacy boundary that lets
 * learning cross workspaces while nothing else does.
 *
 * Pure: client components import it to know which kinds the browser may send.
 */
import { CREATION_KINDS_LIST, INTENTS } from "./vocab";

type Field = "id" | "uuid" | "bool" | "int" | "setting" | "ids" | readonly string[];
export type Family = "shaping" | "use";
export type Surface = "company" | "chats" | "dashboard" | "decks" | "signals" | "drafts";
export type SignalDef = { surface: Surface; family: Family; label: string; payload: Record<string, Field>; client?: boolean };

const LEVEL = ["builder", "member", "fair"] as const;

export const SIGNALS = {
  // ---- shaping: what a team changes in its own version
  "creation.made": { surface: "company", family: "shaping", label: "Creation made", payload: { kind: CREATION_KINDS_LIST, level: LEVEL, shape: "id" } },
  "creation.submitted": { surface: "company", family: "shaping", label: "Creation sent to the Builder", payload: { kind: CREATION_KINDS_LIST, shape: "id" } },
  "creation.approved": { surface: "company", family: "shaping", label: "Creation approved", payload: { kind: CREATION_KINDS_LIST, shape: "id", own: "bool" } },
  "creation.sent_back": { surface: "company", family: "shaping", label: "Creation sent back", payload: { kind: CREATION_KINDS_LIST, shape: "id" } },
  "creation.rejected": { surface: "company", family: "shaping", label: "Creation rejected", payload: { kind: CREATION_KINDS_LIST, shape: "id" } },
  "creation.removed": { surface: "company", family: "shaping", label: "Creation removed (undo)", payload: { kind: CREATION_KINDS_LIST, shape: "id", live: "bool" } },
  "creation.restored": { surface: "company", family: "shaping", label: "Creation brought back", payload: { kind: CREATION_KINDS_LIST, shape: "id" } },
  "setting.changed": { surface: "company", family: "shaping", label: "Setting changed", payload: { path: "id", value: "setting", reset: "bool" } },
  "setting.undone": { surface: "company", family: "shaping", label: "Setting change undone", payload: { path: "id" } },
  "suggestion.sent": { surface: "company", family: "shaping", label: "Suggested to Fair", payload: { ref_kind: ["creation", "setting"], kind: CREATION_KINDS_LIST, path: "id" } },

  // ---- use: normal work
  "chat.turn": { surface: "chats", family: "use", label: "Question asked", payload: { conv: "uuid", first: "bool", builder: "bool", from: ["typed", "ask_why", "pane"] } },
  "chat.analysis": { surface: "chats", family: "use", label: "Analysis run", payload: { layer: ["skill", "recipe", "company", "query"], analysis: "id", intent: INTENTS, status: ["ok", "empty", "unavailable", "error"] } },
  "chat.clarify": { surface: "chats", family: "use", label: "Clarifying question asked", payload: { conv: "uuid" } },
  "chat.pane_action": { surface: "chats", family: "use", label: "Evidence pane action", payload: { action: "id" } },
  "chat.pane_open": { surface: "chats", family: "use", label: "Evidence pane opened", payload: {}, client: true },
  "chat.show_chart": { surface: "chats", family: "use", label: "Show chart", payload: { where: ["card", "pane", "doc"] }, client: true },
  "chat.copy": { surface: "chats", family: "use", label: "Answer copied", payload: {}, client: true },
  "chat.export": { surface: "chats", family: "use", label: "Table exported", payload: { format: ["xlsx", "csv"], via: ["chat", "pane"] } },
  "chat.turn_into": { surface: "chats", family: "use", label: "Turned into a report or deck", payload: { to: ["report", "deck", "add_to_deck"] } },

  "dashboard.view": { surface: "dashboard", family: "use", label: "Dashboard opened", payload: { filtered: "bool" } },
  "dashboard.tile_viewed": { surface: "dashboard", family: "use", label: "Tile viewed (2 s or more)", payload: { tile: "id" }, client: true },
  "dashboard.ask_why": { surface: "dashboard", family: "use", label: "Ask why", payload: { k: "id" } },
  "dashboard.filter": { surface: "dashboard", family: "use", label: "Opened with a filter", payload: { filter: "id" } },

  "deck.template_chosen": { surface: "decks", family: "use", label: "Deck started", payload: { template: "id", source: ["fair", "company", "scratch", "chat"] } },
  "deck.version_made": { surface: "decks", family: "use", label: "Deck version made", payload: { deck: "uuid", report: "uuid", by: ["cron", "person"] } },
  "deck.version_opened": { surface: "decks", family: "use", label: "Deck version opened", payload: { report: "uuid" }, client: true },
  "deck.slide_ask": { surface: "decks", family: "use", label: "Ask AI on a slide", payload: { report: "uuid", n: "int" } },
  "deck.downloaded": { surface: "decks", family: "use", label: "Deck downloaded", payload: { format: ["pptx", "pdf"] } },
  // teams build their own (DECISIONS, 7 Oct 2026): what changed, from where, never the words
  "deck.changed": { surface: "decks", family: "shaping", label: "Deck changed", payload: { deck: "uuid", from: ["chat", "comment", "form"], template: "bool", added: "int", removed: "int", grain: "bool" } },
  "deck.slide_drafted": { surface: "decks", family: "shaping", label: "Own slide drafted", payload: { from: ["form", "chat", "comment"], status: ["ok", "empty", "error"] } },
  "deck.comment": { surface: "decks", family: "use", label: "Slide comment", payload: { report: "uuid", n: "int", cemo: "bool" } },
  "casewords.changed": { surface: "company", family: "shaping", label: "Case words changed", payload: { list: ["partners", "boycott"], action: ["add", "remove"] } },

  "alert.sent": { surface: "signals", family: "use", label: "Alert sent", payload: { kind: "id" } },
} as const satisfies Record<string, SignalDef>;

export type SignalKind = keyof typeof SIGNALS;
export const isSignalKind = (k: unknown): k is SignalKind => typeof k === "string" && Object.prototype.hasOwnProperty.call(SIGNALS, k);
/** the kinds a browser may send to /api/signal; everything else is recorded on the server where it happens */
export const CLIENT_KINDS = (Object.keys(SIGNALS) as SignalKind[]).filter((k) => (SIGNALS[k] as SignalDef).client);

const ID = /^[a-z0-9][a-z0-9_.:@-]{0,63}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** setting paths whose values are words people chose (tile names, voice): only the path travels */
const WORDED = /^(tiles\.names|voice|hero_|description|suggested|house_rules|memory)/;

function settingValue(v: unknown): unknown {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v * 1000) / 1000;
  if (typeof v === "boolean") return v;
  if (typeof v === "string" && ID.test(v)) return v;
  if (Array.isArray(v) && v.length <= 24 && v.every((x) => typeof x === "string" && ID.test(x))) return v;
  return undefined;
}

/** Keep only the fields the kind allows, each checked; unknown fields and bad values are dropped. */
export function cleanPayload(kind: SignalKind, payload: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const spec = (SIGNALS[kind] as SignalDef).payload;
  const out: Record<string, unknown> = {};
  for (const [k, f] of Object.entries(spec)) {
    const v = payload?.[k];
    if (v === undefined || v === null) continue;
    if (Array.isArray(f)) { if (f.includes(v as string)) out[k] = v; continue; }
    switch (f) {
      case "id": if (typeof v === "string" && ID.test(v)) out[k] = v; break;
      case "uuid": if (typeof v === "string" && UUID.test(v)) out[k] = v; break;
      case "bool": if (typeof v === "boolean") out[k] = v; break;
      case "int": if (typeof v === "number" && Number.isInteger(v) && Math.abs(v) < 1e6) out[k] = v; break;
      case "ids": if (Array.isArray(v) && v.length <= 24 && v.every((x) => typeof x === "string" && ID.test(x))) out[k] = v; break;
      case "setting": {
        const path = typeof payload?.path === "string" ? payload.path : "";
        const sv = WORDED.test(path) ? undefined : settingValue(v);
        if (sv !== undefined) out[k] = sv;
        break;
      }
    }
  }
  return out;
}
