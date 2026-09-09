/**
 * Mechanism-leak guard. The model must never expose how an answer was produced:
 * no skill names with a slash, no tool names, no "SQL". A leading slash on a known
 * skill name is stripped (safe and unambiguous); everything else is only counted
 * and logged so the prompt can be fixed, because blanket word bans mangle real
 * sentences ("in the long run", "TikTok/Instagram").
 */
const TOOL_WORDS = /\b(run_skill|query_metrics|create_agent_draft|ask_user|input_schema|tool_use|SQL)\b/g;

export function scrubMechanism(text: string, skillNames: string[]): { text: string; leaks: string[] } {
  const leaks: string[] = [];
  let out = text;
  if (skillNames.length) {
    const alt = skillNames.map((n) => n.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")).join("|");
    const slashed = new RegExp(`(^|[^\\w/])/(${alt})\\b`, "g");
    out = out.replace(slashed, (_m, pre: string, name: string) => {
      leaks.push(`/${name}`);
      return `${pre}${name.replace(/-/g, " ")}`;
    });
  }
  for (const m of out.matchAll(TOOL_WORDS)) leaks.push(m[1]);
  return { text: out, leaks };
}
