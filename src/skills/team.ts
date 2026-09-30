/**
 * The analyses a team can use: every skill that can run in the workspace. A PR team
 * (one subject) gets the comment and post analyses; the creator-market and
 * brand-panel ones are built for a category of competing brands and are not
 * meaningful for one person, as the app's own PR assistant is told
 * (src/chat/loop.ts). The composer's "/" menu and the connector both read this.
 */
import { getWorkspace } from "../workspace/store";
import { availableSkills } from "./runner";

const NOT_FOR_A_SUBJECT = new Set(["creators", "brands", "audience"]);
/** post analyses that compare brands in a panel (campaigns across brands, TikTok Shop products, the beauty lexicon) */
const PANEL_ONLY = new Set(["campaigns", "products", "themes"]);
/** a PR team reads what people say first */
const SUBJECT_ORDER = ["comments", "conversation", "posts"];

export async function teamSkills(workspaceId: string) {
  const [skills, cfg] = await Promise.all([availableSkills(workspaceId), getWorkspace(workspaceId)]);
  if (cfg?.kind !== "profile") return skills;
  const rank = (layer: string) => (SUBJECT_ORDER.indexOf(layer) + SUBJECT_ORDER.length + 1) % (SUBJECT_ORDER.length + 1);
  return skills.filter((s) => !NOT_FOR_A_SUBJECT.has(s.layer) && !PANEL_ONLY.has(s.name)).sort((a, b) => rank(a.layer) - rank(b.layer));
}
