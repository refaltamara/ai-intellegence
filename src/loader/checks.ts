/**
 * The checkpoint between staging and the core (DECISIONS, 10 Oct 2026, "Data architecture V1"). Two outcomes:
 *   hold   the load is broken: rows missing against the file, brands or labels the setup does not know, dates read
 *          wrong, one post under many urls, too much set aside, a file that yields nothing. It stays in staging with
 *          this report until data ops let it in or throw it away.
 *   warn   the load goes in: rows the source got wrong (0 followers, a video with 0 views) are flagged, stay out of
 *          rates and medians, and data ops and the scraper team are told.
 * Nobody reviews a daily load by hand; a person looks when a load is held. Thresholds: src/config/loads.ts.
 */
import { sql } from "../db/client";
import { toJson } from "../db/json";
import { LOAD_CHECKS as C } from "../config/loads";
import type { FileReport, SourceKind } from "./types";

export type Check = { key: string; label: string; outcome: "pass" | "hold" | "warn" | "info"; detail: string; count?: number; examples?: unknown[] };

const q = async <T>(text: string, params: unknown[]) => (await sql.query(text, params)) as T[];
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const fmt = (n: number) => n.toLocaleString("en-US");
const PL: Record<string, string> = { tiktok: "TikTok", instagram: "Instagram", threads: "Threads", x: "X", youtube: "YouTube" };

type LoadRow = { workspace_id: string; source: SourceKind; report: { files?: FileReport[]; staged?: Record<string, number>; facts?: Record<string, unknown> }; case_id: string | null };

export async function runChecks(loadId: string): Promise<{ checks: Check[]; held: boolean }> {
  const l = (await q<LoadRow>(`select workspace_id, source, report, case_id from staging.loads where id = $1`, [loadId]))[0];
  if (!l) throw new Error(`no staged load ${loadId}`);
  const ws = l.workspace_id;
  const tz = (await q<{ tz: string }>(`select tz from workspaces where id = $1`, [ws]))[0]?.tz ?? "Asia/Jakarta";
  const files = (l.report.files ?? []).filter((f) => f.kind !== "other");
  const facts = l.report.facts ?? {};
  const out: Check[] = [];

  // 1. every row the files hold is staged, merged or dropped with a reason, and staging holds what was staged
  const unaccounted = files.filter((f) => f.rows_in !== f.staged + f.merged + f.dropped);
  const counts = (await q<Record<string, number>>(
    `select (select count(*) from staging.posts where load_id = $1)::int as posts, (select count(*) from staging.comments where load_id = $1)::int as comments,
            (select count(*) from staging.readings where load_id = $1)::int as readings, (select count(*) from staging.accounts where load_id = $1)::int as accounts`, [loadId]))[0];
  const short = Object.entries(l.report.staged ?? {}).filter(([k, n]) => k in counts && counts[k] !== n);
  out.push(unaccounted.length || short.length
    ? { key: "accounted", label: "Every row accounted for", outcome: "hold", detail: [...unaccounted.map((f) => `${f.file}: ${fmt(f.rows_in)} rows, but ${fmt(f.staged + f.merged + f.dropped)} staged, merged or dropped`), ...short.map(([k, n]) => `${k}: ${fmt(n)} read, ${fmt(counts[k])} in staging`)].join("; ") + "." }
    : { key: "accounted", label: "Every row accounted for", outcome: "pass", detail: `${fmt(files.reduce((a, f) => a + f.rows_in, 0))} rows in ${files.length} file${files.length === 1 ? "" : "s"}: each staged, merged into another row, or dropped with its reason.` });

  // 2. brands, accounts and labels the setup does not know
  const unknownBrand = files.flatMap((f) => Object.entries(f.drops).filter(([w]) => /^unknown brand slug|^brand not in the contract/.test(w)).map(([w, d]) => `${w} (${fmt(d.count)})`));
  const unmapped = (facts.unmapped_accounts as string[] | undefined) ?? [];
  const labels = (facts.unknown_labels as string[] | undefined) ?? [];
  out.push(unknownBrand.length || unmapped.length || labels.length
    ? { key: "unknown", label: "Brands, accounts and labels known", outcome: "hold", detail: [unknownBrand.length ? `brands not set up: ${unknownBrand.slice(0, 6).join(", ")}` : "", unmapped.length ? `accounts under no brand: ${unmapped.slice(0, 8).map((h) => `@${h}`).join(", ")}` : "", labels.length ? `sentiment labels not mapped: ${labels.join(", ")}` : ""].filter(Boolean).join("; ") + ". Set them up in the CMS, then load again." }
    : { key: "unknown", label: "Brands, accounts and labels known", outcome: "pass", detail: "Every brand, account and label in the files is set up." });

  // 3. dates: nothing in the future or before social listening; comments not long before their post; hours where they were
  const dates = (await q<{ future: number; old: number; cfuture: number; examples: unknown[] | null }>(
    `select count(*) filter (where posted_at > now() + make_interval(hours => $2))::int as future,
            count(*) filter (where posted_at < make_date($3, 1, 1))::int as old,
            (select count(*) from staging.comments c where c.load_id = $1 and c.posted_at > now() + make_interval(hours => $2))::int as cfuture,
            (select json_agg(x) from (select url, posted_at from staging.posts where load_id = $1 and (posted_at > now() + make_interval(hours => $2) or posted_at < make_date($3, 1, 1)) limit 4) x) as examples
       from staging.posts where load_id = $1`, [loadId, C.futureSlackHours, C.oldestYear]))[0];
  out.push(dates.future || dates.old || dates.cfuture
    ? { key: "dates", label: "Dates in range", outcome: "hold", detail: `${fmt(dates.future)} posts and ${fmt(dates.cfuture)} comments dated in the future, ${fmt(dates.old)} posts before ${C.oldestYear}: dates were read wrong.`, examples: dates.examples ?? [] }
    : { key: "dates", label: "Dates in range", outcome: "pass", detail: "No post or comment dated in the future or before " + C.oldestYear + "." });

  const early = (await q<{ n: number; early: number; examples: unknown[] | null }>(
    `with c as (
       select c.url, c.posted_at, coalesce(sp.posted_at, p.posted_at) as post_at from staging.comments c
         left join staging.posts sp on sp.load_id = c.load_id and sp.platform = c.platform and sp.url = c.url and sp.brand_id = c.brand_id
         left join posts p on p.workspace_id = $2 and p.platform = c.platform and p.url = c.url and p.brand_id = c.brand_id
        where c.load_id = $1 and c.posted_at is not null)
     select count(*)::int as n, count(*) filter (where posted_at < post_at - interval '1 hour')::int as early,
            (select json_agg(x) from (select url, posted_at, post_at from c where posted_at < post_at - interval '1 hour' limit 3) x) as examples from c`, [loadId, ws]))[0];
  if (early.n) {
    const share = early.early / early.n;
    out.push({
      key: "comments_early", label: "Comments after their post", count: early.early, examples: early.examples ?? [],
      outcome: share > C.commentsEarly.hold ? "hold" : share > C.commentsEarly.warn ? "warn" : "pass",
      detail: `${fmt(early.early)} of ${fmt(early.n)} comments (${pct(early.early, early.n)}%) are dated more than an hour before their post${share > C.commentsEarly.hold ? ": a time zone was read wrong, check the file's zone" : share > C.commentsEarly.warn ? "; usually under " + C.commentsEarly.warn * 100 + "%" : ""}.`,
    });
  }

  // only times that came without a zone can be read in the wrong one: an X time from its status id, an ISO time with Z, never
  const naiveFiles = files.filter((f) => f.kind === "posts" && Number(f.notes?.naive_times ?? f.staged) >= Math.max(1, f.staged) / 2).map((f) => f.file);
  const hours = !naiveFiles.length ? [] : await q<{ side: string; platform: string; n: number; mid: number; sn: number; cs: number }>(
    `with s as (select platform, posted_at from staging.posts where load_id = $1 and not stub and source_file = any($4::text[])),
          b as (select p.platform, p.posted_at from posts p where p.workspace_id = $2
                  and not exists (select 1 from staging.posts x where x.load_id = $1 and x.platform = p.platform and x.url = p.url)),
          x as (select 'load' as side, platform, posted_at at time zone $3 as lt from s
                union all select 'core', platform, posted_at at time zone $3 from b)
     select side, platform, count(*)::int as n, avg((lt::time = '00:00')::int)::float8 as mid,
            avg(sin(2 * pi() * extract(hour from lt) / 24))::float8 as sn, avg(cos(2 * pi() * extract(hour from lt) / 24))::float8 as cs
       from x group by 1, 2`,
    [loadId, ws, tz, naiveFiles],
  );
  const meanHour = (r: { sn: number; cs: number }) => ((Math.atan2(r.sn, r.cs) * 24) / (2 * Math.PI) + 24) % 24;
  const shifted: string[] = [];
  for (const a of hours.filter((h) => h.side === "load")) {
    const b2 = hours.find((h) => h.side === "core" && h.platform === a.platform);
    const usable = (r: typeof a) => r.n >= C.hourShiftMinPosts && r.mid < C.dateOnlyShare && Math.hypot(r.sn, r.cs) > 0.1;
    if (!b2 || !usable(a) || !usable(b2)) continue;
    const d = Math.abs(meanHour(a) - meanHour(b2));
    const dist = Math.min(d, 24 - d);
    if (dist >= C.hourShiftHours) shifted.push(`${PL[a.platform] ?? a.platform}: posts here peak ${dist.toFixed(1)} hours away from earlier ones`);
  }
  if (shifted.length) out.push({ key: "hours", label: "Times of day as before", outcome: "hold", detail: `${shifted.join("; ")}. A time zone was read wrong.` });

  // 4. one post under several urls (the same id): the core would count it twice
  const dup = (await q<{ groups: number; rows: number; posts: number; examples: unknown[] | null }>(
    `with d as (select platform, platform_post_id, brand_id, array_agg(distinct url) as urls from staging.posts where load_id = $1 and platform_post_id is not null and not stub
                  group by 1, 2, 3 having count(distinct url) > 1)
     select (select count(*) from d)::int as groups, (select coalesce(sum(cardinality(urls)), 0) from d)::int as rows,
            (select count(*) from staging.posts where load_id = $1)::int as posts, (select json_agg(urls) from (select urls from d limit 3) x) as examples`, [loadId]))[0];
  if (dup.groups) out.push({
    key: "duplicates", label: "One url per post", count: dup.groups, examples: dup.examples ?? [],
    outcome: dup.rows / Math.max(dup.posts, 1) > C.duplicateIdShare ? "hold" : "warn",
    detail: `${fmt(dup.groups)} posts appear under more than one url (${fmt(dup.rows)} rows), so they would count more than once.`,
  });

  // 5. how much is set aside: posts not about their brand, contents a profile's rules drop. A case watches beyond the panel's
  // terms (step 5), so much of what it brings may not name a brand: for a case's load the share is reported, never held.
  const over = (bad: boolean): Check["outcome"] => (bad ? (l.case_id ? "info" : "hold") : "pass");
  if (l.source === "listening") {
    const s = (await q<{ n: number; off: number }>(`select count(*)::int as n, count(*) filter (where relevant = false)::int as off from staging.posts where load_id = $1`, [loadId]))[0];
    const bad = !!s.n && s.off / s.n > C.setAsideShare;
    out.push({ key: "set_aside", label: "Share set aside", count: s.off, outcome: over(bad), detail: `${fmt(s.off)} of ${fmt(s.n)} posts (${pct(s.off, s.n)}%) do not name their brand and are set aside${bad ? (l.case_id ? ": usual for a case, which watches beyond the brands' terms; the case keeps them and the panel never counts them" : ": check the brands' terms before letting this in") : ""}.` });
  }
  if (l.source === "profile") {
    const ruled = files.filter((f) => f.kind === "posts").map((f) => ({ f, n: Object.entries(f.drops).filter(([w]) => /^no subject keyword|^no caption to match|^link spam/.test(w)).reduce((a, [, d]) => a + d.count, 0) }));
    const bad = ruled.filter((r) => r.f.rows_in >= C.emptyFileMinRows && r.n / r.f.rows_in > C.droppedByRuleShare);
    const n = ruled.reduce((a, r) => a + r.n, 0), all = ruled.reduce((a, r) => a + r.f.rows_in, 0);
    out.push({ key: "set_aside", label: "Share set aside", count: n, outcome: over(bad.length > 0), detail: bad.length ? `${bad.map((r) => `${r.f.file}: ${pct(r.n, r.f.rows_in)}% dropped by the keyword and spam rules`).join("; ")}${l.case_id ? ": a profile keeps only posts that name its subject, a case's too" : ": check the contract's keywords"}.` : `${fmt(n)} of ${fmt(all)} posts (${pct(n, all)}%) dropped by the keyword and spam rules.` });
  }

  // 6. a file that yields nothing
  const empty = files.filter((f) => f.rows_in >= C.emptyFileMinRows && f.staged === 0 && f.merged === 0);
  if (empty.length) out.push({ key: "empty", label: "Every file yields rows", outcome: "hold", detail: `${empty.map((f) => f.file).join(", ")}: nothing could be read.` });

  // 7. warnings: rows the source got wrong go in flagged
  const flags = await q<{ flag: string; n: number; examples: unknown[] }>(
    `select f as flag, count(*)::int as n, (array_agg(url order by url))[1:3] as examples from staging.posts, unnest(flags) as f where load_id = $1 group by 1 order by 1`, [loadId]);
  const words: Record<string, string> = { zero_followers: "posts from accounts reporting 0 followers", zero_views: "videos reporting 0 views" };
  for (const f of flags) out.push({ key: `flag_${f.flag}`, label: words[f.flag] ? words[f.flag][0].toUpperCase() + words[f.flag].slice(1) : f.flag, outcome: "warn", count: f.n, examples: f.examples, detail: `${fmt(f.n)} ${words[f.flag] ?? f.flag}: loaded, flagged, kept out of rates and medians; the scraper team is told.` });

  // 8. for the record
  if (l.source === "profile") {
    const w = (await q<{ stubs: number; waiting: number }>(`select (select count(*) from staging.posts where load_id = $1 and stub)::int as stubs, (select count(*) from staging.comments where load_id = $1 and sentiment is null and sentiment_source is null)::int as waiting`, [loadId]))[0];
    out.push({ key: "labels", label: "Left for our labeller", outcome: "info", count: w.waiting, detail: `${fmt(w.waiting)} comments arrive without a label; our model labels the new ones (old ones keep theirs). ${fmt(w.stubs)} posts are known only from their comments.` });
  }
  const cats = files.flatMap((f) => Object.entries((f.notes?.unknown_categories_kept_as_is as Record<string, number> | undefined) ?? {}));
  if (cats.length) out.push({ key: "categories", label: "Categories mapped", outcome: "info", detail: `Kept as they are: ${cats.slice(0, 8).map(([c, n]) => `${c} (${fmt(n)})`).join(", ")}.` });

  const held = out.some((c) => c.outcome === "hold");
  // a held load that passes when checked again (after its setup was fixed) is ready to go in
  await q(`update staging.loads set checks = $2::jsonb, status = case when $3 then 'held' when status = 'held' then 'staged' else status end where id = $1`, [loadId, toJson(out), held]);
  return { checks: out, held };
}
