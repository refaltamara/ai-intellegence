/**
 * Asking CeMO from the Pulse (a case's crisis view, /pulse): the ask box at the top and "Ask why"
 * on each card. As on the dashboard, the link carries only which card was asked about; the
 * figures are read again here from the same data as the page (`pulsePage`), shown as a card at
 * the top of the chat and put in front of the question. The model phrases, never computes.
 */
import { compact, int } from "../competitor/view";
import type { AskContext, Fact, PulseCard } from "../dashboard/askref";
import { PLATFORM_LABEL } from "../skills/common";
import { pulsePage, type PulseData, type Span } from "./page";


const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-09-13 15:15" → "13 Sep 15:15" */
const when = (s: string | null | undefined) => {
  if (!s) return "–";
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(s);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}${m[4] ? ` ${m[4]}:${m[5]}` : ""}` : s;
};
const pf = (p: string) => PLATFORM_LABEL[p] ?? p;
const STANCE: Record<string, string> = { negative: "against", positive: "for", neutral: "neutral", against: "against", for: "for" };
/** a whole-number share, blank where the base is too small to mean anything */
const share = (n: number, base: number, floor = 1) => (base >= floor && base > 0 ? `${Math.round((n / base) * 100)}%` : "–");
/** a window as the Now card shows it (its shares are already percents, as on the screen) */
const span = (s: Span) => `${int(s.on_topic)} comments about the case, ${s.negative_pct == null ? "too few read for a share" : `${s.negative_pct}% negative`} (${int(s.labelled)} read); ${int(s.posts)} posts, ${s.posts_against_pct == null ? "too few for a share" : `${s.posts_against_pct}% against`}`;

const TITLES: Record<PulseCard, string> = {
  overview: "The Pulse", now: "How it is going", trend: "Comments per hour, and which way they lean", anger: "Where the anger is",
  reply: "Before and after the reply", spread: "How it spread", stance: "Where the contents stand", commenters: "Who is commenting",
  themes: "What they are saying", drivers: "Who is driving it", seeding: "Coordinated patterns", exposure: "Commercial exposure",
  sides: "Who is talking, and about what", watch: "Most commented posts",
};

/** The question a card's "Ask why" starts with; the person can change it before sending. */
function question(card: PulseCard, s: string): string {
  switch (card) {
    case "now": return `Is the conversation about ${s} cooling down or getting worse, and why?`;
    case "trend": return `What drove the peaks in comments about ${s}?`;
    case "anger": return `Why are the comments under other accounts' posts angrier (or calmer) than under ${s}'s own?`;
    case "reply": return `Did ${s}'s reply calm the comments or make them worse?`;
    case "spread": return `How did the conversation about ${s} spread from one platform to the next?`;
    case "stance": return `Who is publishing against ${s}, and who defends it?`;
    case "commenters": return `Is this a pile-on of first-time accounts or a mobilised group?`;
    case "themes": return `What are the main complaints in the negative comments about ${s}?`;
    case "drivers": return `Which posts and accounts are driving the negative comments about ${s}?`;
    case "seeding": return `Is anyone seeding the comments about ${s}?`;
    case "exposure": return `How big is the boycott risk for ${s} and its sister brands?`;
    case "sides": return `Which voices and topics carry the most anger about ${s}?`;
    case "watch": return `Which posts about ${s} should we watch or answer first?`;
    default: return `What should ${s} do next?`;
  }
}

function facts(card: PulseCard, d: PulseData): Fact[] {
  const t = d.totals;
  const head: Fact[] = [
    { label: `Comments about ${d.subject}`, value: `${int(t.on_topic)} from ${int(t.accounts)} accounts on ${int(t.posts_with_comments)} posts` },
    { label: "Negative", value: `${share(t.on_topic_negative, t.on_topic_labelled)} of ${int(t.on_topic_labelled)} read · ${share(t.on_topic_positive, t.on_topic_labelled)} defend` },
    { label: "Posts against", value: `${share(t.posts_against, t.posts_stance_labelled)} of ${int(t.posts_stance_labelled)} with a stance · ${int(t.earned_posts)} posts by other accounts` },
  ];
  switch (card) {
    case "overview":
    case "now": {
      const s = d.status;
      const now: Fact[] = [
        { label: "Last six hours", value: span(s.now6) },
        { label: "Six hours before", value: span(s.prev6) },
        { label: "Last 24 hours", value: span(s.day) },
        { label: "24 hours before", value: span(s.prev_day) },
      ];
      if (s.hours_since_peak != null) now.push({ label: "Since the peak", value: `${s.hours_since_peak} hours` });
      return card === "now" ? now : [...head, ...now.slice(0, 2), ...(d.trend.peak ? [{ label: "Peak hour", value: `${when(d.trend.peak.h)} WIB, ${int(d.trend.peak.on_topic)} comments about the case` }] : [])];
    }
    case "trend": {
      const p = d.trend.points;
      const top = [...p].sort((a, b) => b.on_topic - a.on_topic).slice(0, 3);
      return [
        { label: "Hours shown", value: p.length ? `${when(p[0].h)} → ${when(p[p.length - 1].h)} WIB, ${p.length} hours` : "none" },
        ...top.map((x, i) => ({ label: i === 0 ? "Busiest hour" : `${i + 1}${i === 1 ? "nd" : "rd"} busiest`, value: `${when(x.h)}: ${int(x.on_topic)} comments about the case, ${share(x.negative, x.labelled, 10)} negative` })),
        ...(d.trend.peak_posts ? [{ label: "Most posts in an hour", value: `${when(d.trend.peak_posts.h)}: ${int(d.trend.peak_posts.posts)} posts, ${int(d.trend.peak_posts.against)} against` }] : []),
      ];
    }
    case "anger":
      return [
        { label: `Under ${d.subject}'s own posts`, value: `${int(t.owned_comments)} comments, ${int(t.owned_negative)} negative` },
        { label: "Under other accounts' posts", value: `${int(t.earned_comments)} comments, ${int(t.earned_negative)} negative` },
      ];
    case "reply": {
      const r = d.reply_effect;
      if (!r) return [{ label: "Reply", value: `no reply from ${d.subject} in the data` }];
      const side = (x: { comments: number; labelled: number; negative: number }) => `${int(x.comments)} comments, ${share(x.negative, x.labelled, 10)} negative of ${int(x.labelled)} read`;
      return [
        { label: "Reply posted", value: `${when(r.at)} WIB` },
        { label: "Three days before", value: side(r.before) },
        { label: "Three days after", value: side(r.after) },
        // one platform in the case: the same rows again
        ...(d.spread.length > 1 ? [{ label: `On ${pf(r.same_platform.platform)} only`, value: `before ${side(r.same_platform.before)}; after ${side(r.same_platform.after)}` }] : []),
      ];
    }
    case "spread":
      return d.spread.slice(0, 5).map((r) => ({ label: pf(r.platform), value: `first post ${when(r.first_post)}${r.first_post_handle ? ` by @${r.first_post_handle}` : ""}; took off ${when(r.takeoff)}; peak ${when(r.peak_hour)} (${int(r.peak_comments)} comments); ${int(r.posts)} posts, ${int(r.on_topic)} comments about the case, ${share(r.negative, r.labelled, 10)} negative` }));
    case "stance":
      return [head[2], ...d.stance.slice(0, 5).map((r) => ({ label: pf(r.platform), value: `${int(r.posts)} posts: ${int(r.against)} against, ${int(r.neutral)} neutral, ${int(r.for_)} for${r.unlabelled ? `, ${int(r.unlabelled)} waiting` : ""}; ${r.views_total > 0 ? `views ${compact(r.views_against)} against, ${compact(r.views_for)} for` : `likes ${compact(r.likes_against)} against, ${compact(r.likes_for)} for (no views reported)`}` }))];
    case "commenters": {
      const c = d.commenters;
      return [
        { label: "Accounts", value: `${int(c.accounts)} accounts, ${int(c.comments)} comments` },
        { label: "Commented once", value: `${int(c.once)} accounts (${share(c.once, c.accounts)}), ${share(c.comments_from_once, c.comments)} of comments` },
        { label: "Five or more comments", value: `${int(c.many)} accounts, ${share(c.comments_from_many, c.comments)} of comments` },
        { label: "On several posts", value: `${int(c.cross_post)} accounts on 2+ posts · ${int(c.cross_platform)} handles on 2+ platforms` },
        { label: "Most active", value: c.top.slice(0, 5).map((x) => `@${x.handle} (${pf(x.platform)}, ${int(x.comments)} comments)`).join(", ") || "–" },
      ];
    }
    case "themes":
      return (d.themes.rows as { term: string; comments: number; share_pct: number }[]).slice(0, 8).map((r) => ({ label: r.term, value: `${int(r.comments)} comments, ${r.share_pct}%` }));
    case "drivers":
      return (d.drivers.rows as { url: string; platform: string; account: string; source: string; comments: number; negative: number; stance: string | null }[]).slice(0, 6).map((r) => ({ label: r.source === "owned" ? `${d.subject} (own ${pf(r.platform)})` : `@${r.account} · ${pf(r.platform)}`, value: `${int(r.comments)} comments, ${int(r.negative)} negative${r.stance ? `; the post itself is ${STANCE[r.stance] ?? r.stance}` : ""} · ${r.url}` }));
    case "seeding": {
      const rows = d.seeding.rows as { kind: string; platform: string; what: string; accounts: number; comments: number; first_at: string }[];
      if (!rows.length) return [{ label: "Patterns", value: "no coordinated pattern found" }];
      return rows.slice(0, 6).map((r) => ({ label: r.kind === "same_wording" ? `Same wording, ${r.accounts} accounts` : r.kind === "repeat_account" ? `Repeat account, ${r.comments} comments` : `Burst, ${r.accounts} first-time commenters`, value: `${pf(r.platform)} · ${when(r.first_at)} · ${r.what.slice(0, 120)}` }));
    }
    case "exposure": {
      const c = d.commercial;
      if (!c.configured) return [{ label: "Boycott words", value: "none set for this case" }];
      return [
        { label: "Boycott calls", value: `${int(c.posts)} posts and ${int(c.comments)} comments in all` },
        { label: "Last 24 hours", value: `${int(c.posts_24h)} posts, ${int(c.comments_24h)} comments (24 hours before: ${int(c.posts_prev_24h)} posts, ${int(c.comments_prev_24h)} comments)` },
        ...c.partners.slice(0, 6).map((p) => ({ label: p.name, value: `${int(p.posts)} posts, ${int(p.comments)} comments; last 24 hours ${int(p.posts_24h)} posts, ${int(p.comments_24h)} comments` })),
      ];
    }
    case "sides": {
      const row = (r: PulseData["sides"]["voices"][number]) => `${int(r.posts)} posts (${int(r.against)} against, ${int(r.for_)} defending)${r.c_labelled ? `; ${int(r.comments)} comments, ${share(r.c_negative, r.c_labelled, 10)} negative` : ""}`;
      return [...d.sides.voices.slice(0, 5).map((r) => ({ label: `Voice: ${r.label}`, value: row(r) })), ...d.sides.topics.slice(0, 5).map((r) => ({ label: `Topic: ${r.label}`, value: row(r) }))];
    }
    case "watch":
      return d.watch.slice(0, 6).map((w) => ({ label: `${w.handle ? `@${w.handle}` : d.subject} · ${pf(w.platform)}`, value: `${int(w.on_topic)} comments about the case, ${share(w.negative, w.on_topic, 10)} negative, ${int(w.last6h)} in the last six hours · ${w.url}` }));
  }
}

/** The Pulse's figures behind a card, read again. Null when the workspace has no Pulse. */
export async function resolvePulseAsk(ws: string, card: PulseCard): Promise<AskContext | null> {
  const d = await pulsePage(ws);
  if (!d) return null;
  const f = facts(card, d).filter((x) => x.value && x.value !== "–");
  return {
    source: "pulse",
    title: card === "overview" ? `The Pulse on ${d.subject}` : TITLES[card],
    scope: `Posts through ${d.postsAsOf} · comments through ${d.asOf} WIB`,
    facts: f.length ? f : [{ label: "Data", value: "nothing on this card yet" }],
    back: "/pulse",
    question: question(card, d.subject),
  };
}
