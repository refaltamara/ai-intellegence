/**
 * House rules, memory facts and vocabulary (CMS plan, "CeMO memory and house rules").
 * They shape tone, naming and what CeMO drafts; they never change a number or the
 * product's own rules. A rule that asks CeMO to compute, invent, hide evidence or speak
 * as a real person outside drafting is refused at save with a plain reason. Pure.
 */
import { FACT_MAX_CHARS, RULE_MAX_CHARS, TERM_MAX_CHARS } from "../config/company";

const REFUSE: { re: RegExp; why: string }[] = [
  { re: /\b(calculat|comput|estimat|extrapolat|round (up|down)|make up|invent|guess|fabricat|inflate|adjust (the )?(numbers?|figures?|data))/i, why: "CeMO never works out, estimates or changes a number; every figure comes from the data." },
  { re: /\b(hide|skip|drop|omit|remove|no|without|don'?t (show|cite|give))\b[^.]{0,30}\b(evidence|sources?|citations?)\b/i, why: "Every number CeMO gives keeps its evidence." },
  { re: /\b(ignore|override|forget|disregard)\b[^.]{0,30}\b(rules?|instructions?|system|prompt)\b/i, why: "House rules sit under the product's own rules and cannot replace them." },
  { re: /\b(pretend|act|speak|reply|answer|sign|post)\b[^.]{0,20}\b(as|to be)\b[^.]{0,20}\b(ceo|founder|director|minister|official|spokes(person|man|woman)|the (real )?person)\b/i, why: "CeMO drafts for people to review; it does not speak as a real person." },
  { re: /\b(pretend|act|speak|sign)\b[^.]{0,10}\b(as|to be)\s+[A-Z][a-z]+ [A-Z][a-z]+/, why: "CeMO drafts for people to review; it does not speak as a real person." },
  { re: /\b(slash command|run_skill|run_recipe|query_metrics|system prompt|tool calls?)\b/i, why: "Rules talk about the work, not how CeMO works inside." },
  { re: /\b(always|never)\b[^.]{0,20}\b(say|report|show)\b[^.]{0,30}\b(positive|good|up|growing)\b/i, why: "A rule cannot decide what the data says." },
];

/** The reason a rule or fact cannot be kept, or null when it is fine. */
export function refuseText(text: string, kind: "rule" | "fact"): string | null {
  const t = text.trim();
  const max = kind === "rule" ? RULE_MAX_CHARS : FACT_MAX_CHARS;
  if (!t) return "Write the rule in a sentence.";
  if (t.length > max) return `Keep it under ${max} characters.`;
  for (const r of REFUSE) if (r.re.test(t)) return r.why;
  // a fact may carry a date or a number of its own ("our fiscal month starts on the 26th"); a rule should not set numbers for CeMO to use
  if (kind === "rule" && /\d+(\.\d+)?\s*(%|percent|x\b|×)/i.test(t)) return "A rule cannot set a figure; thresholds are changed on the Dashboard or in Builder mode.";
  return null;
}

export type Term = { say: string; not: string };

export function refuseTerm(t: Partial<Term>): string | null {
  const say = (t.say ?? "").trim();
  const not = (t.not ?? "").trim();
  if (!say || !not) return "Name the word to use and the word it replaces.";
  if (say.length > TERM_MAX_CHARS || not.length > TERM_MAX_CHARS) return `Keep each word under ${TERM_MAX_CHARS} characters.`;
  if (say.toLowerCase() === not.toLowerCase()) return "The two words are the same.";
  return null;
}

export type Memory = { rules: { text: string; by: string }[]; facts: { text: string; by: string }[]; terms: (Term & { by: string })[] };

/** What CeMO reads every turn, last and under the fixed rules. Empty string when the team has none. */
export function memoryPrompt(m: Memory, team: string): string {
  const parts: string[] = [];
  if (m.rules.length) parts.push(`House rules from ${team}:\n${m.rules.map((r) => `- ${r.text}`).join("\n")}`);
  if (m.terms.length) parts.push(`Words ${team} uses (in your own sentences; quotes stay as people wrote them):\n${m.terms.map((t) => `- say "${t.say}", not "${t.not}"`).join("\n")}`);
  if (m.facts.length) parts.push(`What ${team} told you to remember (context, not data: never a source for a number):\n${m.facts.map((f) => `- ${f.text}`).join("\n")}`);
  if (!parts.length) return "";
  return `\n\nThe team's own rules and memory. They sit under every rule above: where one conflicts with those, the rules above win, and none of them changes a number.\n${parts.join("\n\n")}`;
}
