/**
 * "Ask CeMO anything about this" on the PR dashboard (Refal, 14 Oct 2026). As with "Ask why" and the Pulse's ask box,
 * the link carries only what the dashboard shows (the brand, the window, the platform), never its numbers: the
 * figures are read again here from the same function as the page (`prDashboard`), shown as a card at the top of the
 * chat and put in front of the question. The model phrases, never computes.
 */
import { compact, dayMonth, int } from "../competitor/view";
import type { AskContext, AskRef, Fact } from "../dashboard/askref";
import { PLATFORM_LABEL } from "../skills/common";
import { getWorkspace } from "../workspace/store";
import { prDashboard, type Split } from "./dashboard";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-10-14 09:00" → "14 Oct 09:00" */
const when = (s: string | null | undefined) => {
  const m = s ? /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(s) : null;
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}${m[4] ? ` ${m[4]}:${m[5]}` : ""}` : s ?? "–";
};
const pf = (p: string) => PLATFORM_LABEL[p] ?? p;
/** a count with its whole-number share of what was read beside it (no share under a handful) */
const counted = (n: number, base: number) => {
  if (base < 5) return int(n);
  const p = Math.round((n / base) * 100);
  return `${int(n)} (${p === 0 && n > 0 ? "<1" : p}%)`;
};
const leaning = (x: Split, against: string, for_: string) =>
  `${int(x.n)}${x.labelled ? `: ${counted(x.negative, x.labelled)} ${against}, ${counted(x.positive, x.labelled)} ${for_}, of ${int(x.labelled)} read` : ""}`;

type RepRef = Extract<AskRef, { k: "rep" }>;

/** The PR dashboard's figures for the brand, window and platform it showed, read again. Null when the workspace has none. */
export async function resolveRepAsk(ws: string, ref: RepRef): Promise<AskContext | null> {
  const [d, cfg] = await Promise.all([prDashboard(ws, { brand: ref.brand, days: String(ref.days), platform: ref.platform }), getWorkspace(ws)]);
  if (!d) return null;
  const hide = new Set(cfg?.pr_hide ?? []);
  const who = d.focus.name;
  const f = d.filters;
  const now = d.conversation.now, prev = d.conversation.prev;
  const facts: Fact[] = [];
  if (!hide.has("status")) facts.push({ label: "Status", value: `${d.status.level}: ${d.status.reason}` });
  facts.push(
    // around one subject posts carry a stance and count as voices; on a panel they are the mentions, with no stance
    d.voice_posts > 0
      ? { label: `Posts about ${who}`, value: `${leaning(now.posts, "against", "defending")}; the ${f.days} days before: ${int(prev.posts.n)}` }
      : { label: `Posts about ${who}`, value: `${int(d.kpis.mentions.now ?? 0)}; the ${f.days} days before: ${int(d.kpis.mentions.prev ?? 0)}` },
    { label: `Comments about ${who}`, value: `${leaning(now.comments, "negative", "defending")}; the ${f.days} days before: ${int(prev.comments.n)}` },
  );
  if (d.other_comments.now) facts.push({ label: "Left out", value: `${int(d.other_comments.now)} comments in the same threads are about something else` });
  for (const p of d.by_platform ?? []) {
    facts.push({ label: pf(p.platform), value: `comments ${leaning(p.comments, "negative", "defending")}${p.peak ? `; busiest ${when(p.peak.at)} (${int(p.peak.n)})` : ""}${p.first_after_min != null ? `; first comment ${int(p.first_after_min)} min after the post` : ""}` });
  }
  if (d.pace?.peak) {
    const last = d.pace.points.slice(-3).map((x) => `${when(x.h)} ${int(x.comments)}`).join(", ");
    facts.push({ label: "Comments per hour", value: `peak ${when(d.pace.peak.h)} WIB with ${int(d.pace.peak.comments)}; the last hours: ${last} (the last one still filling)` });
  }
  const topics = d.narratives.filter((n) => n.comments > 0).slice(0, 5);
  if (topics.length) facts.push({ label: "What they talk about", value: topics.map((n) => `${n.topic} ${int(n.comments)} (${n.neg_pct == null ? "–" : `${Math.round(n.neg_pct)}%`} negative)`).join("; ") });
  const issues = d.issues.slice(0, 3);
  if (issues.length) facts.push({ label: "Issues building", value: issues.map((i) => `${i.topic}: ${int(i.negative)} negative (${int(i.negative_prev)} before), ${i.stage}`).join("; ") });
  const tagged = (d.tagged?.rows ?? []).filter((t) => !t.subject && !t.poster).slice(0, 5);
  if (tagged.length) facts.push({ label: "Accounts pulled in", value: tagged.map((t) => `@${t.handle} ${int(t.comments)}`).join(", ") });
  const amps = d.amplifiers.slice(0, 3);
  if (amps.length && !hide.has("reach")) facts.push({ label: "Amplifiers", value: amps.map((a) => `@${a.handle} (${pf(a.platform)}, ${a.views ? `${compact(a.views)} views` : `${int(a.comments)} comments`})`).join(", ") });
  const liked = (d.by_platform ?? []).flatMap((p) => p.liked).sort((a, b) => b.likes - a.likes).slice(0, 2);
  for (const q of liked) facts.push({ label: `Most liked on ${pf(q.platform)}`, value: `${int(q.likes)} likes: "${q.text.replace(/\s+/g, " ").slice(0, 160)}"` });
  const scope = [ref.platform === "all" ? "All platforms" : pf(ref.platform), `${dayMonth(f.from)} to ${dayMonth(f.to)} vs the ${f.days} days before`, `data through ${dayMonth(d.as_of)}`].join(" · ");
  return {
    source: "dashboard",
    title: `The dashboard on ${who}`,
    scope,
    facts,
    back: `/dashboard?brand=${encodeURIComponent(f.brand)}&days=${f.days}&platform=${f.platform}`,
    question: `What stands out on ${who}'s dashboard, and what should we do about it?`,
  };
}
