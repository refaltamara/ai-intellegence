/**
 * The weekly competitor report as data. Every number the deck or the dashboard
 * shows is computed here, in SQL over the panel; the model only phrases them
 * (CLAUDE.md rule 1). Distinct posts throughout: an Instagram post tagging two
 * brands of one group counts once for the group.
 *
 * Decks (DECISIONS, 2 Oct 2026) run the same facts by week or by month, with or
 * without a client, and add the top creators and top content when they carry
 * those slides; findings pinned from Chats come in ready-made.
 */
import { GENERIC_HASHTAGS } from "../config/hashtags";
import { weeklyRules } from "../config/weekly";
import { brandNameKeys } from "../skills/campaigns";
import { SkillDb } from "../skills/db";
import { loadContext } from "../skills/params";
import { captionSettings } from "../captions/run";
import { contractGroups, contractHasClient, type WeeklyContract } from "./contract";
import { assessAll, covered, evaluate } from "./flags";
import { captionFacts } from "./captions";
import { landscape } from "./landscape";
import { deckPeriod, nextStart, periodWords, stepFrom, type Grain } from "./period";
import { CAPTION_SLIDES, cleanSlides, LANDSCAPE_SLIDES } from "./slides";
import { shortDay } from "./weeks";
import type { Cell, CreatorRow, EvidencePost, Finding, Flag, Group, GroupResult, Mover, Panel, PanelPoint, Platform, WeekPoint, WeeklyReport } from "./types";

const PLATFORM_NAME: Record<Platform, string> = { tiktok: "TikTok", instagram: "Instagram", threads: "Threads", x: "X", youtube: "YouTube" };
/** Owned-account posts are captured on TikTok in the beauty panel; listening workspaces capture them everywhere (a platform with any counts). */
const OWNED_PLATFORMS: Platform[] = ["tiktok"];
const CART_PLATFORMS: Platform[] = ["tiktok"];
const MIN_TAG_CREATORS = 3;
/** The engagement-rate base: posts with views, and without the impossible rows where engagement exceeds views. */
const RATED = "views > 0 and engagements is not null and engagements <= views";

const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : null);
const round = (v: number | null, dp = 1) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** dp) / 10 ** dp);

function emptyPoint(week: string): WeekPoint {
  return { week, posts: 0, creators: 0, owned_posts: 0, views: 0, owned_views: 0, posts_rated: 0, views_rated: 0, engagements: 0, cart_posts: 0, cart_known: 0, er: null, posts_share: null, views_share: null };
}

type SeriesRow = Omit<WeekPoint, "er" | "posts_share" | "views_share"> & { gkey: string; platform: Platform };

/** `week` is the period: a Monday or YYYY-Www for the week grain, YYYY-MM for the month grain. */
export async function weeklyReport(contract: WeeklyContract, week: string, opts: { db?: SkillDb; findings?: Finding[] } = {}): Promise<WeeklyReport> {
  const db = opts.db ?? new SkillDb();
  const ctx = await loadContext(db, contract.workspace);
  const tz = ctx.tz;
  const grain: Grain = contract.grain === "month" ? "month" : "week";
  // a whitelisted literal, never input: date_trunc's unit
  const unit = grain === "month" ? "month" : "week";
  const words = periodWords(grain);
  const rules = weeklyRules(contract.rules, grain);
  // by default every platform the workspace holds (TikTok and Instagram in the beauty panel)
  const platforms: Platform[] = contract.platforms?.length ? contract.platforms : ((await db.q<{ platform: Platform }>("select distinct platform from posts where workspace_id = $1 order by 1", [contract.workspace])).map((r) => r.platform));
  const slides = contract.slides ? cleanSlides(contract.slides) : undefined;
  const period = deckPeriod(grain, week);
  const W = period.from;
  const L = rules.lookback_weeks;
  const weeks = Array.from({ length: L + 1 }, (_, i) => stepFrom(grain, W, i - L));
  const from = weeks[0];
  const toExcl = nextStart(period);
  const step = (d: string, n: number) => stepFrom(grain, d, n);
  const withClient = contractHasClient(contract);
  const { watchlist, portfolio, clientBrands } = contractGroups(contract);
  const all = [...watchlist, ...(withClient ? [portfolio, ...clientBrands] : [])];

  const known = new Set(ctx.brands.map((b) => b.id));
  const unknown = all.flatMap((g) => g.brand_ids).filter((id) => !known.has(id));
  if (unknown.length) throw new Error(`contract names brands the workspace does not have: ${[...new Set(unknown)].join(", ")}`);

  const pairs = all.flatMap((g) => g.brand_ids.map((b) => [g.key, b] as const));
  const series = await db.q<SeriesRow>(
    `with g as (select * from unnest($2::text[], $3::text[]) as t(gkey, brand_id)),
     d as (
       select distinct on (g.gkey, p.platform, p.url)
              g.gkey, p.platform, p.url, p.source, p.creator_handle, p.views, p.engagements, p.has_cart,
              (date_trunc('${unit}', p.posted_at at time zone $4))::date as wk
       from posts p join g on g.brand_id = p.brand_id
       where p.workspace_id = $1 and p.relevant is not false and p.platform = any($5::text[])
         and p.posted_at >= ($6::date::timestamp at time zone $4) and p.posted_at < ($7::date::timestamp at time zone $4)
       order by g.gkey, p.platform, p.url, p.views desc nulls last
     )
     select gkey, platform, to_char(wk, 'YYYY-MM-DD') as week,
            count(*)::int as posts,
            count(distinct creator_handle) filter (where source = 'earned')::int as creators,
            count(*) filter (where source = 'owned')::int as owned_posts,
            coalesce(sum(views), 0)::float8 as views,
            coalesce(sum(views) filter (where source = 'owned'), 0)::float8 as owned_views,
            count(*) filter (where ${RATED})::int as posts_rated,
            coalesce(sum(views) filter (where ${RATED}), 0)::float8 as views_rated,
            coalesce(sum(engagements) filter (where ${RATED}), 0)::float8 as engagements,
            count(*) filter (where has_cart)::int as cart_posts,
            count(has_cart)::int as cart_known
     from d group by 1, 2, 3`,
    [ctx.workspaceId, pairs.map((p) => p[0]), pairs.map((p) => p[1]), tz, platforms, from, toExcl],
  );
  const panelRows = await db.q<PanelPoint & { platform: Platform }>(
    `with d as (
       select distinct on (p.platform, p.url) p.platform, p.url, p.views, (date_trunc('${unit}', p.posted_at at time zone $2))::date as wk
       from posts p
       where p.workspace_id = $1 and p.relevant is not false and p.platform = any($3::text[])
         and p.posted_at >= ($4::date::timestamp at time zone $2) and p.posted_at < ($5::date::timestamp at time zone $2)
       order by p.platform, p.url, p.views desc nulls last
     )
     select platform, to_char(wk, 'YYYY-MM-DD') as week, count(*)::int as posts, coalesce(sum(views), 0)::float8 as views
     from d group by 1, 2`,
    [ctx.workspaceId, tz, platforms, from, toExcl],
  );

  // ---- panel
  const panel: Partial<Record<Platform, Panel>> = {};
  const panelAt = (pl: Platform, wk: string): PanelPoint => panelRows.find((r) => r.platform === pl && r.week === wk) ?? { week: wk, posts: 0, views: 0 };
  for (const pl of platforms) {
    const hist = weeks.slice(0, L).map((wk) => panelAt(pl, wk));
    const now = panelAt(pl, W);
    const prev = hist[hist.length - 1];
    panel[pl] = { now, prev, history: hist, posts_change_pct: round(prev.posts > 0 ? (now.posts / prev.posts - 1) * 100 : null, 0), views_change_pct: round(prev.views > 0 ? (now.views / prev.views - 1) * 100 : null, 0) };
  }
  if (platforms.every((pl) => panel[pl]!.now.posts === 0)) throw new Error(`No posts in the panel for the ${words.unit} of ${W}`);

  // ---- cells
  const point = (g: Group, pl: Platform, wk: string): WeekPoint => {
    const r = series.find((s) => s.gkey === g.key && s.platform === pl && s.week === wk);
    const p = r ? { ...emptyPoint(wk), ...r, week: wk } : emptyPoint(wk);
    const pp = panelAt(pl, wk);
    p.er = round(pct(p.engagements, p.views_rated), 2);
    p.posts_share = round(pct(p.posts, pp.posts), 3);
    p.views_share = round(pct(p.views, pp.views), 3);
    delete (p as Partial<SeriesRow>).gkey;
    delete (p as Partial<SeriesRow>).platform;
    return p;
  };
  const result = (g: Group): GroupResult => {
    const cells: Partial<Record<Platform, Cell>> = {};
    for (const pl of platforms) {
      const history = weeks.slice(0, L).map((wk) => point(g, pl, wk));
      const now = point(g, pl, W);
      const isCovered = g.brand_ids.length > 0 && covered(history, now);
      cells[pl] = { covered: isCovered, now, prev: history[history.length - 1], history, flags: isCovered ? assessAll(history, now, rules) : [] };
    }
    return { group: g, cells };
  };
  const watch = watchlist.map(result);
  const portfolioResult = result(portfolio);
  const clientResults = clientBrands.map(result);

  // ---- which moves lead the report
  const flagged = watch
    .flatMap((r) => platforms.flatMap((pl) => (r.cells[pl]?.flags ?? []).map((flag) => ({ key: r.group.key, name: r.group.name, platform: pl, flag, views: r.cells[pl]!.now!.views }))))
    .sort((a, b) => Math.abs(b.flag.z) - Math.abs(a.flag.z) || b.views - a.views);
  const leaders: typeof flagged = [];
  for (const f of flagged) {
    if (leaders.length >= rules.max_movers) break;
    if (!leaders.some((l) => l.key === f.key)) leaders.push(f);
  }

  // on a quiet week the reader still wants to know what came closest, and why it is not news
  const nearMisses = watch
    .flatMap((r) => platforms.flatMap((pl) => {
      const c = r.cells[pl];
      const now = c?.now;
      if (!c?.covered || !now) return [];
      return (["posts", "views", "er"] as const).map((m) => ({ key: r.group.key, name: r.group.name, platform: pl, ...evaluate(m, c.history, now, rules) }));
    }))
    .filter((e) => !e.flag && e.z != null && e.miss !== "thin history" && e.miss !== "below size floor")
    .sort((a, b) => Math.abs(b.z!) - Math.abs(a.z!))
    .slice(0, 3)
    .map(({ flag: _f, ...e }) => e);

  const evidence: EvidencePost[] = [];
  const movers: Mover[] = [];
  for (const l of leaders) {
    const r = watch.find((w) => w.group.key === l.key)!;
    movers.push(await drivers(db, ctx.workspaceId, tz, r, l.platform, l.flag, weeks, rules, flagged.filter((f) => f.key === l.key && f.flag !== l.flag).map((f) => ({ platform: f.platform, flag: f.flag })), evidence, brandNameKeys(ctx).keys, { unit, step }));
  }

  // ---- notes the reader needs next to the numbers
  const notes: WeeklyReport["notes"] = [];
  for (const pl of platforms) {
    const pn = panel[pl]!;
    if (pn.posts_change_pct != null && Math.abs(pn.posts_change_pct) >= rules.panel_swing_pct) {
      notes.push({ kind: "coverage", text: `${PLATFORM_NAME[pl]}: the panel holds ${pn.now.posts.toLocaleString("en-US")} posts ${words.this} against ${pn.prev.posts.toLocaleString("en-US")} ${words.last} (${pn.posts_change_pct > 0 ? "+" : ""}${pn.posts_change_pct}%). Every brand's count moves with that, so brands are judged on their share of the panel.` });
    }
  }
  const lastSeen = await db.q<{ gkey: string; platform: Platform; last: string | null; n: number }>(
    `with g as (select * from unnest($2::text[], $3::text[]) as t(gkey, brand_id))
     select g.gkey, p.platform, to_char(max(p.posted_at at time zone $4), 'YYYY-MM-DD') as last, count(*)::int as n
     from posts p join g on g.brand_id = p.brand_id where p.workspace_id = $1 and p.relevant is not false group by 1, 2`,
    [ctx.workspaceId, pairs.map((p) => p[0]), pairs.map((p) => p[1]), tz],
  );
  for (const r of watch) {
    const g = r.group;
    const missing = platforms.filter((pl) => !r.cells[pl]?.covered);
    const untracked = g.untracked?.length ? `${g.untracked.join(" and ")} ${g.untracked.length > 1 ? "are" : "is"} not collected yet` : null;
    if (!missing.length) {
      if (untracked) notes.push({ kind: "coverage", text: `${g.name}: ${untracked}.` });
      continue;
    }
    if (missing.length < platforms.length && !untracked) {
      const have = platforms.filter((pl) => !missing.includes(pl)).map((pl) => PLATFORM_NAME[pl]);
      notes.push({ kind: "coverage", text: `${g.name} is collected on ${have.join(" and ")} only.` });
      continue;
    }
    const parts = missing.map((pl) => {
      const seen = lastSeen.filter((s) => s.gkey === g.key && s.platform === pl);
      const n = seen.reduce((a, x) => a + x.n, 0);
      const last = seen.map((x) => x.last).filter(Boolean).sort().pop();
      return n ? `${n.toLocaleString("en-US")} ${PLATFORM_NAME[pl]} posts in the panel, the last on ${shortDay(last!)}` : `none on ${PLATFORM_NAME[pl]}`;
    });
    notes.push({ kind: "coverage", text: `${g.name} is outside current coverage: ${[untracked, ...parts].filter(Boolean).join("; ")}.` });
  }
  const snapshots = await db.one<{ n: number }>("select count(*)::int as n from post_snapshots s join posts p on p.id = s.post_id where p.workspace_id = $1 and p.relevant is not false", [ctx.workspaceId]);
  if (!snapshots?.n) notes.push({ kind: "method", text: `Views and engagement are as captured once per post, not at a fixed age, so ${words.this}'s posts have had less time to collect views than ${words.last}'s. The live collector measures every post at day 7.` });

  const coveredWatch = watch.filter((r) => platforms.some((pl) => r.cells[pl]?.covered)).map((r) => r.group);
  const scene = !slides || slides.some((k) => LANDSCAPE_SLIDES.has(k))
    ? await landscape(db, {
        workspaceId: ctx.workspaceId, tz, platforms, period: { from: W, to: toExcl, prevFrom: weeks[L - 1] }, clientKey: withClient ? portfolio.key : null, clientName: contract.client?.name ?? "", brandKeys: brandNameKeys(ctx).keys,
        groups: [...(withClient ? [portfolio] : []), ...coveredWatch],
      })
    : undefined;
  const reach = [...(withClient ? [portfolio] : []), ...coveredWatch];
  const creators = slides?.includes("creators") ? await topCreators(db, { workspaceId: ctx.workspaceId, tz, platforms, groups: reach, from, at: W, toExcl }) : undefined;
  const content = slides?.includes("content") ? await topContent(db, { workspaceId: ctx.workspaceId, tz, platforms, groups: reach, at: W, toExcl }, evidence) : undefined;
  // the weekly report (no slides of its own) carries the caption slides too, when the captions read name something
  const captions = !slides || slides.some((k) => CAPTION_SLIDES.has(k))
    ? { ...(await captionFacts(db, { workspaceId: ctx.workspaceId, tz, platforms, groups: reach, clientKey: withClient ? portfolio.key : null, clientName: contract.client?.name ?? "", from: W, to: toExcl, prevFrom: weeks[L - 1] })), floor: (await captionSettings(ctx.workspaceId)).min_views }
    : undefined;
  const prev = deckPeriod(grain, weeks[L - 1]);

  return {
    version: 1,
    title: contract.title ?? "Weekly Competitor Pulse",
    client: withClient ? contract.client!.name : "",
    workspace_id: ctx.workspaceId,
    grain,
    ...(slides ? { slides } : {}),
    week: { from: W, to: period.to, label: period.label, iso: period.key },
    previous_week: { from: prev.from, to: prev.to, label: prev.label },
    history_weeks: weeks.slice(0, L),
    rules,
    platforms,
    panel,
    watchlist: watch,
    portfolio: portfolioResult,
    client_brands: clientResults,
    movers,
    flagged: flagged.map(({ views: _v, ...f }) => f),
    near_misses: nearMisses,
    notes,
    evidence,
    ...(scene ? { landscape: scene } : {}),
    ...(creators ? { creators } : {}),
    ...(content ? { content } : {}),
    ...(captions ? { captions } : {}),
    ...(opts.findings && slides?.includes("findings") ? { findings: opts.findings } : {}),
    data_as_of: ctx.asOf,
    generated_at: new Date().toISOString(),
  };
}

type PostRow = { url: string; creator_handle: string | null; source: string; tier: string | null; followers: number | null; posted_at: string; views: number | null; engagements: number | null; content_format: string | null; has_cart: boolean | null; product_name: string | null; caption: string | null };

/** The fixed lenses behind one highlighted move: who, what, campaign, owned vs earned, action. */
async function drivers(
  db: SkillDb, workspaceId: string, tz: string, r: GroupResult, platform: Platform, flag: Flag, weeks: string[], rules: ReturnType<typeof weeklyRules>,
  otherFlags: Mover["other_flags"], evidence: EvidencePost[], brandKeys: string[], g8: { unit: "week" | "month"; step: (d: string, n: number) => string },
): Promise<Mover> {
  const g = r.group;
  const cell = r.cells[platform]!;
  const now = cell.now!;
  const prev = cell.prev!;
  const W = weeks[weeks.length - 1];
  const P = weeks[weeks.length - 2];
  // one period further back, so the previous period's creators are judged against a full lookback too
  const from = g8.step(weeks[0], -1);
  const toExcl = g8.step(W, 1);
  const L = weeks.length - 1;
  // one CTE shape for every lens: the group's distinct posts on this platform across the lookback and the week
  const base = `with d as (
       select distinct on (p.url) p.url, p.creator_handle, p.source, p.tier, p.followers_at_post as followers, p.views, p.engagements,
              p.content_format, p.has_cart, p.product_name, p.caption, p.hashtags, p.posted_at,
              to_char((date_trunc('${g8.unit}', p.posted_at at time zone $3))::date, 'YYYY-MM-DD') as wk
       from posts p
       where p.workspace_id = $1 and p.relevant is not false and p.platform = $2 and p.brand_id = any($4::text[])
         and p.posted_at >= ($5::date::timestamp at time zone $3) and p.posted_at < ($6::date::timestamp at time zone $3)
       order by p.url, p.views desc nulls last
     )`;
  const args = [workspaceId, platform, tz, g.brand_ids, from, toExcl];

  const newCreators = async (wk: string) =>
    (await db.one<{ new_creators: number; creators: number }>(
      `${base}
       select count(distinct d.creator_handle) filter (where not exists (
                select 1 from d h where h.creator_handle = d.creator_handle and h.source = 'earned' and h.wk < $7 and h.wk >= $8))::int as new_creators,
              count(distinct d.creator_handle)::int as creators
       from d where d.wk = $7 and d.source = 'earned' and d.creator_handle is not null`,
      [...args, wk, g8.step(wk, -L)],
    )) ?? { new_creators: 0, creators: 0 };
  const [creators, creatorsPrev] = [await newCreators(W), await newCreators(P)];
  const tiers = await db.q<{ tier: string; now: number; prev: number }>(
    `${base}
     select coalesce(tier, 'unknown') as tier, count(*) filter (where wk = $7)::int as now, count(*) filter (where wk = $8)::int as prev
     from d where source = 'earned' and wk in ($7, $8) group by 1`,
    [...args, W, P],
  );
  const topCreators = await db.q<{ handle: string; tier: string | null; followers: number | null; posts: number; views: number }>(
    `${base}
     select creator_handle as handle, max(tier) as tier, max(followers)::int as followers, count(*)::int as posts, coalesce(sum(views), 0)::float8 as views
     from d where wk = $7 and source = 'earned' and creator_handle is not null
     group by 1 order by 5 desc, 4 desc limit 3`,
    [...args, W],
  );
  const topPosts = await db.q<PostRow>(
    `${base}
     select url, creator_handle, source, tier, followers, to_char(posted_at at time zone $3, 'YYYY-MM-DD') as posted_at, views::float8 as views,
            engagements::float8 as engagements, content_format, has_cart, product_name, caption
     from d where wk = $7 order by views desc nulls last limit 3`,
    [...args, W],
  );
  const formats = await db.q<{ format: string; now: number; prev: number }>(
    `${base}
     select content_format as format, count(*) filter (where wk = $7)::int as now, count(*) filter (where wk = $8)::int as prev
     from d where wk in ($7, $8) and content_format is not null and content_format <> 'other' group by 1 order by 2 desc`,
    [...args, W, P],
  );
  const tags = await db.q<{ tag: string; creators: number; posts: number; views: number; brand_share: number | null }>(
    `${base},
     t as (
       select distinct h as tag, d.url, d.creator_handle, d.views from d, unnest(d.hashtags) h
       where d.wk = $7 and d.source = 'earned' and h <> all($8::text[])
         and not exists (select 1 from unnest($9::text[]) k where length(h) >= 4 and k like '%' || h || '%')
     ),
     agg as (select tag, count(distinct creator_handle)::int as creators, count(distinct url)::int as posts, coalesce(sum(views), 0)::float8 as views from t group by tag),
     tot as (
       select h as tag, count(distinct p.url)::int as posts_all
       from posts p, unnest(p.hashtags) h
       where p.workspace_id = $1 and p.relevant is not false and p.platform = $2
         and p.posted_at >= ($7::date::timestamp at time zone $3) and p.posted_at < ($11::date::timestamp at time zone $3)
         and h in (select tag from agg where creators >= $10)
       group by 1
     )
     select agg.tag, agg.creators, agg.posts, agg.views, round(agg.posts::numeric / nullif(tot.posts_all, 0) * 100, 1)::float8 as brand_share
     from agg left join tot using (tag) where agg.creators >= $10 order by agg.creators desc, agg.views desc limit 5`,
    [...args, W, GENERIC_HASHTAGS, brandKeys, MIN_TAG_CREATORS, toExcl],
  );
  const products = CART_PLATFORMS.includes(platform)
    ? await db.q<{ name: string; posts: number; views: number }>(
        `${base}
         select product_name as name, count(*)::int as posts, coalesce(sum(views), 0)::float8 as views
         from d where wk = $7 and has_cart and product_name is not null group by 1 order by 3 desc limit 3`,
        [...args, W],
      )
    : [];

  const earnedNow = tiers.reduce((a, t) => a + t.now, 0);
  const earnedPrev = tiers.reduce((a, t) => a + t.prev, 0);
  const TIER_ORDER = ["nano", "micro", "mid", "macro", "mega", "unknown"];
  const tierMix = tiers
    .map((t) => ({ tier: t.tier, posts: t.now, share: round(pct(t.now, earnedNow), 1) ?? 0, share_prev: round(pct(t.prev, earnedPrev), 1) ?? 0 }))
    .sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));

  const posts: EvidencePost[] = topPosts.map((p) => {
    const e: EvidencePost = {
      ref: `P${evidence.length + 1}`,
      url: p.url,
      platform,
      group: g.name,
      creator_handle: p.creator_handle,
      source: p.source,
      tier: p.tier,
      followers: p.followers,
      posted_at: p.posted_at,
      views: p.views,
      er: p.views && p.views > 0 && p.engagements != null && p.engagements <= p.views ? round((p.engagements / p.views) * 100, 1) : null,
      content_format: p.content_format,
      has_cart: p.has_cart,
      product_name: p.product_name,
      caption: p.caption ? p.caption.replace(/\s+/g, " ").trim().slice(0, 220) : null,
    };
    evidence.push(e);
    return e;
  });

  return {
    key: g.key,
    name: g.name,
    platform,
    flag,
    other_flags: otherFlags,
    now,
    prev,
    who: {
      creators: now.creators,
      creators_prev: prev.creators,
      new_creators: creators.new_creators,
      new_creator_share: round(pct(creators.new_creators, creators.creators), 0),
      new_creator_share_prev: round(pct(creatorsPrev.new_creators, creatorsPrev.creators), 0),
      tier_mix: tierMix,
      top_creators: topCreators,
    },
    what: {
      top_posts: posts,
      top_post_view_share: round(topPosts[0]?.views != null ? pct(topPosts[0].views, now.views) : null, 0),
      formats: formats.slice(0, 4).map((f) => ({ format: f.format, posts: f.now, share: round(pct(f.now, now.posts), 0) ?? 0, share_prev: round(pct(f.prev, prev.posts), 0) ?? 0 })),
    },
    campaign: { tags },
    owned: OWNED_PLATFORMS.includes(platform) || now.owned_posts > 0 || prev.owned_posts > 0
      ? { posts: { now: round(pct(now.owned_posts, now.posts), 0), prev: round(pct(prev.owned_posts, prev.posts), 0) }, views: { now: round(pct(now.owned_views, now.views), 0), prev: round(pct(prev.owned_views, prev.views), 0) } }
      : null,
    action: CART_PLATFORMS.includes(platform)
      ? { cart_share: { now: round(pct(now.cart_posts, now.cart_known), 0), prev: round(pct(prev.cart_posts, prev.cart_known), 0) }, products }
      : null,
    distribution: { boosted: now.views >= rules.boosted_min_views && now.er != null && now.er < rules.boosted_er_pct, er: now.er, views: now.views },
  };
}

type Reach = { workspaceId: string; tz: string; platforms: Platform[]; groups: Group[]; at: string; toExcl: string };

/**
 * The top-creators slide: earned posts across the brands the deck covers, the
 * creators who brought the most views in the period on each platform (views are
 * not compared across platforms: ten split evenly between them), and whether
 * each is new to those brands (no post for them since the start of the lookback).
 */
async function topCreators(db: SkillDb, o: Reach & { from: string }): Promise<CreatorRow[]> {
  const pairs = o.groups.flatMap((g) => g.brand_ids.map((b) => [g.key, b] as const));
  if (!pairs.length) return [];
  const rows = await db.q<{ handle: string; platform: Platform; tier: string | null; followers: number | null; posts: number; views: number; eng: number | null; vr: number | null; gkeys: string[]; seen: boolean; top_url: string | null; top_views: number | null }>(
    `with g as (select * from unnest($2::text[], $3::text[]) as t(gkey, brand_id)),
     d as (
       select distinct on (p.platform, p.url, g.gkey) g.gkey, p.platform, p.url, p.creator_handle, p.tier, p.followers_at_post as followers, p.views, p.engagements, p.posted_at
       from posts p join g on g.brand_id = p.brand_id
       where p.workspace_id = $1 and p.relevant is not false and p.platform = any($5::text[]) and p.source = 'earned' and p.creator_handle is not null
         and p.posted_at >= ($6::date::timestamp at time zone $4) and p.posted_at < ($8::date::timestamp at time zone $4)
       order by p.platform, p.url, g.gkey, p.views desc nulls last
     ),
     cur as (select * from d where posted_at >= ($7::date::timestamp at time zone $4)),
     one as (select distinct on (platform, url) * from cur order by platform, url, views desc nulls last),
     agg as (
       select platform, creator_handle as handle, count(*)::int as posts, coalesce(sum(views), 0)::float8 as views,
              sum(engagements) filter (where ${RATED})::float8 as eng, sum(views) filter (where ${RATED})::float8 as vr,
              max(followers)::int as followers, (array_agg(tier order by followers desc nulls last))[1] as tier,
              (array_agg(url order by views desc nulls last))[1] as top_url, (array_agg(views order by views desc nulls last))[1]::float8 as top_views
       from one group by 1, 2
     ),
     gk as (select platform, creator_handle as handle, gkey, count(*) as n from cur group by 1, 2, 3),
     top as (select a.*, row_number() over (partition by a.platform order by a.views desc, a.posts desc, a.handle) as rn from agg a)
     select a.*,
            (select array_agg(gkey order by n desc, gkey) from gk where gk.platform = a.platform and gk.handle = a.handle) as gkeys,
            exists (select 1 from d where d.platform = a.platform and d.creator_handle = a.handle and d.posted_at < ($7::date::timestamp at time zone $4)) as seen
     from top a where a.rn <= $9 order by array_position($5::text[], a.platform), a.rn`,
    [o.workspaceId, pairs.map((p) => p[0]), pairs.map((p) => p[1]), o.tz, o.platforms, o.from, o.at, o.toExcl, Math.floor(10 / Math.max(1, o.platforms.length))],
  );
  const name = new Map(o.groups.map((g) => [g.key, g.name]));
  return rows.map((r) => ({
    handle: r.handle,
    platform: r.platform,
    tier: r.tier,
    followers: r.followers,
    posts: r.posts,
    views: r.views,
    er: round(r.vr ? pct(r.eng ?? 0, r.vr) : null, 1),
    brands: (r.gkeys ?? []).map((k) => name.get(k) ?? k),
    first_time: !r.seen,
    top_post: r.top_url ? { url: r.top_url, views: r.top_views } : null,
  }));
}

/** The top-content slide: the period's most-viewed posts across the brands the deck covers, six split evenly between the platforms, cited as evidence. */
async function topContent(db: SkillDb, o: Reach, evidence: EvidencePost[]): Promise<EvidencePost[]> {
  const pairs = o.groups.flatMap((g) => g.brand_ids.map((b) => [g.key, b] as const));
  if (!pairs.length) return [];
  const rows = await db.q<PostRow & { gkey: string; platform: Platform }>(
    `with g as (select * from unnest($2::text[], $3::text[]) as t(gkey, brand_id)),
     d as (
       select distinct on (p.platform, p.url) g.gkey, p.platform, p.url, p.creator_handle, p.source, p.tier, p.followers_at_post as followers,
              to_char(p.posted_at at time zone $4, 'YYYY-MM-DD') as posted_at, p.views::float8 as views, p.engagements::float8 as engagements,
              p.content_format, p.has_cart, p.product_name, p.caption
       from posts p join g on g.brand_id = p.brand_id
       where p.workspace_id = $1 and p.relevant is not false and p.platform = any($5::text[])
         and p.posted_at >= ($6::date::timestamp at time zone $4) and p.posted_at < ($7::date::timestamp at time zone $4)
       order by p.platform, p.url, p.views desc nulls last, g.gkey
     ),
     top as (select d.*, row_number() over (partition by platform order by views desc nulls last, url) as rn from d)
     select * from top where rn <= $8 order by array_position($5::text[], platform), rn`,
    [o.workspaceId, pairs.map((p) => p[0]), pairs.map((p) => p[1]), o.tz, o.platforms, o.at, o.toExcl, Math.floor(6 / Math.max(1, o.platforms.length))],
  );
  const name = new Map(o.groups.map((g) => [g.key, g.name]));
  return rows.map((p) => {
    // a post a driver slide already cites keeps its ref
    const cited = evidence.find((e) => e.url === p.url);
    if (cited) return cited;
    const e: EvidencePost = {
      ref: `P${evidence.length + 1}`,
      url: p.url,
      platform: p.platform,
      group: name.get(p.gkey) ?? p.gkey,
      creator_handle: p.creator_handle,
      source: p.source,
      tier: p.tier,
      followers: p.followers,
      posted_at: p.posted_at,
      views: p.views,
      er: p.views && p.views > 0 && p.engagements != null && p.engagements <= p.views ? round((p.engagements / p.views) * 100, 1) : null,
      content_format: p.content_format,
      has_cart: p.has_cart,
      product_name: p.product_name,
      caption: p.caption ? p.caption.replace(/\s+/g, " ").trim().slice(0, 220) : null,
    };
    evidence.push(e);
    return e;
  });
}
