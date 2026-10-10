/**
 * A staged load that passed its checks goes into the core (src/loader/; DECISIONS, 10 Oct 2026): the same writes the old
 * loaders made (columns and rules in src/loader/columns.ts), in batches a function's time can hold, resumable from where
 * a slice stopped. A row is written only when a value changes, so loading the same files twice changes nothing, and
 * every write says how many rows it changed. Each file gets a data_loads row pointing at its staged load and raw file.
 */
import { sql } from "../db/client";
import { toJson } from "../db/json";
import { POST_WRITE } from "./columns";
import { labellerId } from "../labels/record";
import type { FileReport, SourceKind } from "./types";

export type PromoteProgress = {
  phase: "prepare" | "creators" | "stubs" | "posts" | "export_readings" | "readings" | "comments" | "captions" | "finish" | "done";
  key?: string[];
  ledgers?: Record<string, string>;
  changed?: Record<string, number>;
};
type Load = { id: string; workspace_id: string; source: SourceKind; report: { files?: FileReport[]; facts?: Record<string, unknown> }; files: { raw_file_id: string | null; path: string }[] };

const BATCH = { creators: 5000, posts: 2000, readings: 5000, comments: 2000 } as const;
const q = async <T>(text: string, params: unknown[]) => (await sql.query(text, params)) as T[];

async function loadOf(id: string): Promise<Load> {
  const l = (await q<Load>(`select id, workspace_id, source, report, files from staging.loads where id = $1`, [id]))[0];
  if (!l) throw new Error(`no staged load ${id}`);
  return l;
}

/** one data_loads row per file the load writes from, as the old loaders kept them (the Data page lists these) */
async function openLedgers(l: Load): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const f of l.report.files ?? []) {
    if (f.kind === "other" || f.kind === "accounts") continue;
    const raw = l.files.find((x) => x.path.endsWith(f.file))?.raw_file_id ?? f.raw_file_id ?? null;
    const r = await q<{ id: string }>(
      `insert into data_loads (workspace_id, file, platform, kind, rows_in, rows_loaded, rows_rejected, report, staging_load_id, raw_file_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10) returning id`,
      [l.workspace_id, f.file, f.platform, f.kind, f.rows_in, f.staged, f.dropped, toJson({ ...f, staging_load: l.id }), l.id, raw],
    );
    out[f.file] = r[0].id;
  }
  return out;
}

// ---------------------------------------------------------------- creators
function creatorSql(source: SourceKind): string {
  const later = `excluded.last_seen >= coalesce(creators.last_seen, '1900-01-01')`;
  const followers = source === "beauty" ? `case when ${later} then excluded.followers_latest else creators.followers_latest end` : `coalesce(excluded.followers_latest, creators.followers_latest)`;
  const tier = source === "beauty" ? `case when ${later} then excluded.tier_latest else creators.tier_latest end` : `coalesce(excluded.tier_latest, creators.tier_latest)`;
  const display = source === "listening" ? `coalesce(excluded.display_name, creators.display_name)` : `creators.display_name`;
  return `
    insert into creators (workspace_id, platform, handle, display_name, followers_latest, tier_latest, first_seen, last_seen)
    select $2, s.platform, s.handle, s.display_name, s.followers_latest, s.tier_latest, s.first_seen, s.last_seen
      from staging.accounts s where s.load_id = $1 and (s.platform, s.handle) > ($3, $4) order by s.platform, s.handle limit ${BATCH.creators}
    on conflict (workspace_id, platform, handle) do update set
      display_name = ${display}, followers_latest = ${followers}, tier_latest = ${tier},
      first_seen = least(creators.first_seen, excluded.first_seen), last_seen = greatest(creators.last_seen, excluded.last_seen)
    where (creators.display_name, creators.followers_latest, creators.tier_latest, creators.first_seen, creators.last_seen)
          is distinct from (${display}, ${followers}, ${tier}, least(creators.first_seen, excluded.first_seen), greatest(creators.last_seen, excluded.last_seen))
    returning 1`;
}

// -------------------------------------------------------------------- posts
function postSql(source: SourceKind): string {
  const { cols, mode } = POST_WRITE[source];
  const val = (c: string) => (mode === "coalesce" ? `coalesce(excluded.${c}, posts.${c})` : `excluded.${c}`);
  return `
    with b as (
      select s.* from staging.posts s
       where s.load_id = $1 and not s.stub and (s.platform, s.url, s.brand_id) > ($3, $4, $5)
       order by s.platform, s.url, s.brand_id limit ${BATCH.posts}
    ), w as (
      insert into posts (workspace_id, platform, url, brand_id, load_id, creator_id, flags, ${cols.join(", ")})
      select $2, b.platform, b.url, b.brand_id, ($6::jsonb ->> b.source_file)::uuid, c.id, b.flags, ${cols.map((c) => `b.${c}`).join(", ")}
        from b left join creators c on c.workspace_id = $2 and c.platform = b.platform and c.handle = b.creator_key
      on conflict (workspace_id, platform, url, brand_id) do update set
        load_id = excluded.load_id, creator_id = excluded.creator_id, flags = excluded.flags,
        ${cols.map((c) => `${c} = ${val(c)}`).join(", ")}
      where (posts.creator_id, posts.flags, ${cols.map((c) => `posts.${c}`).join(", ")})
            is distinct from (excluded.creator_id, excluded.flags, ${cols.map(val).join(", ")})
      returning posts.id, ${cols.includes("relevant") ? "posts.relevant" : "null::boolean as relevant"}
    ), lb as (
      -- a listening post's relevance is the terms rule's judgment, kept with its author (labels)
      insert into labels (workspace_id, target, target_id, kind, value, labeller_id)
      select $2, 'post', w.id, 'relevant', case when w.relevant then 'yes' else 'no' end, $7::int from w where w.relevant is not null and $7::int is not null
      returning 1
    )
    select (select count(*) from w)::int as changed, (select count(*) from b)::int as rows, (select count(*) from lb)::int as labels,
           (select array[platform, url, brand_id] from b order by platform desc, url desc, brand_id desc limit 1) as last`;
}

/** a post only known from its comments: written when the post is not there yet, never over one (profiles) */
const STUB_SQL = (cols: string[]) => `
  insert into posts (workspace_id, platform, url, brand_id, load_id, creator_id, ${cols.join(", ")})
  select $2, s.platform, s.url, s.brand_id, ($3::jsonb ->> s.source_file)::uuid, c.id, ${cols.map((c) => `s.${c}`).join(", ")}
    from staging.posts s left join creators c on c.workspace_id = $2 and c.platform = s.platform and c.handle = s.creator_key
   where s.load_id = $1 and s.stub
  on conflict (workspace_id, platform, url, brand_id) do nothing
  returning 1`;

// ----------------------------------------------------------------- readings
/** an export's one reading per post: its numbers, when the file was made (Beauty: the day the file reached us, at the latest) */
const EXPORT_READING_SQL = `
  with b as (
    select s.platform, s.url, s.brand_id, s.read_at, s.views, s.likes, s.comments_count, s.shares, s.saves from staging.posts s
     where s.load_id = $1 and not s.stub and s.read_at is not null and (s.platform, s.url, s.brand_id) > ($3, $4, $5)
     order by s.platform, s.url, s.brand_id limit ${BATCH.posts}
  ), w as (
    insert into post_readings (post_id, read_at, age_hours, day_n, source, views, likes, comments_count, shares, saves, load_id)
    select p.id, b.read_at, round(extract(epoch from (b.read_at - p.posted_at)) / 3600)::int, greatest(0, floor(extract(epoch from (b.read_at - p.posted_at)) / 86400))::smallint,
           'export', b.views, b.likes, b.comments_count, b.shares, b.saves, $1::uuid
      from b join posts p on p.workspace_id = $2 and p.platform = b.platform and p.url = b.url and p.brand_id = b.brand_id
    on conflict (post_id, read_at, day_n) do update set views = excluded.views, likes = excluded.likes, comments_count = excluded.comments_count, shares = excluded.shares, saves = excluded.saves
    where (post_readings.views, post_readings.likes, post_readings.comments_count, post_readings.shares, post_readings.saves)
          is distinct from (excluded.views, excluded.likes, excluded.comments_count, excluded.shares, excluded.saves)
    returning 1
  )
  select (select count(*) from w)::int as changed, (select count(*) from b)::int as rows,
         (select array[platform, url, brand_id] from b order by platform desc, url desc, brand_id desc limit 1) as last`;

const READING_SQL = `
  with b as (
    select r.* from staging.readings r where r.load_id = $1 and (r.platform, r.url, r.brand_id, r.day_n) > ($3, $4, $5, $6::smallint)
     order by r.platform, r.url, r.brand_id, r.day_n limit ${BATCH.readings}
  ), w as (
    -- every reading is kept with its time (post_readings); the same reading loaded again changes nothing
    insert into post_readings (post_id, read_at, age_hours, day_n, source, views, likes, comments_count, shares, saves, load_id)
    select p.id, b.captured_at, round(extract(epoch from (b.captured_at - p.posted_at)) / 3600)::int, b.day_n, 'listening',
           b.views, b.likes, b.comments_count, b.shares, b.saves, $1::uuid
      from b join posts p on p.workspace_id = $2 and p.platform = b.platform and p.url = b.url and p.brand_id = b.brand_id
    on conflict (post_id, read_at, day_n) do update set views = excluded.views, likes = excluded.likes,
      comments_count = excluded.comments_count, shares = excluded.shares, saves = excluded.saves
    where (post_readings.views, post_readings.likes, post_readings.comments_count, post_readings.shares, post_readings.saves)
          is distinct from (excluded.views, excluded.likes, excluded.comments_count, excluded.shares, excluded.saves)
    returning 1
  )
  select (select count(*) from w)::int as changed, (select count(*) from b)::int as rows,
         (select array[platform, url, brand_id, day_n::text] from b order by platform desc, url desc, brand_id desc, day_n desc limit 1) as last`;

// ----------------------------------------------------------------- comments
function commentSql(source: SourceKind): string {
  if (source === "listening") {
    const cols = ["post_id", "platform", "author_handle", "author_hash", "text", "posted_at", "likes", "sentiment", "sentiment_source", "sentiment_confidence", "theme", "purchase_intent", "translation", "topic_id"];
    return `
      with b as (
        select s.* from staging.comments s where s.load_id = $1 and s.platform_comment_id > $3 order by s.platform_comment_id limit ${BATCH.comments}
      ), w as (
        insert into comments (workspace_id, post_id, platform, platform_comment_id, author_handle, author_hash, text, posted_at, likes,
                              sentiment, sentiment_source, sentiment_confidence, theme, purchase_intent, translation, topic_id, classified_at)
        select $2, p.id, b.platform, b.platform_comment_id, b.author_handle, b.author_hash, b.text, b.posted_at, b.likes,
               b.sentiment, b.sentiment_source, b.sentiment_confidence, b.theme, b.purchase_intent, b.translation, b.topic_id, now()
          from b join posts p on p.workspace_id = $2 and p.platform = b.platform and p.url = b.url and p.brand_id = b.brand_id
        on conflict (workspace_id, platform_comment_id) do update set
          ${cols.map((c) => `${c} = excluded.${c}`).join(", ")}, classified_at = excluded.classified_at
        where (${cols.map((c) => `comments.${c}`).join(", ")}) is distinct from (${cols.map((c) => `excluded.${c}`).join(", ")})
        returning comments.id, comments.sentiment, comments.sentiment_source, comments.sentiment_confidence, comments.theme, comments.purchase_intent, comments.translation, comments.topic_id
      ), lb as (
        -- the labels the dump brought, kept with their author (labels)
        insert into labels (workspace_id, target, target_id, kind, value, confidence, labeller_id)
        select $2, 'comment', w.id, v.kind, v.value, w.sentiment_confidence::real, $4::int
          from w cross join lateral (values ('sentiment', w.sentiment), ('theme', w.theme), ('intent', case when w.purchase_intent then 'yes' when not w.purchase_intent then 'no' end),
                                            ('translation', w.translation), ('topic', w.topic_id)) as v(kind, value)
         where w.sentiment_source = 'listening' and v.value is not null
        returning 1
      )
      select (select count(*) from w)::int as changed, (select count(*) from b)::int as rows, (select count(*) from lb)::int as labels, (select max(platform_comment_id) from b) as last`;
  }
  // a profile load keeps what our model decided (a label, or that it could not label) when the file brings no label
  const keep = (c: string) => `case when comments.sentiment_source like 'model%' and excluded.sentiment is null then comments.${c} else excluded.${c} end`;
  return `
    with b as (
      select s.* from staging.comments s where s.load_id = $1 and s.platform_comment_id > $3 order by s.platform_comment_id limit ${BATCH.comments}
    ), w as (
      insert into comments (workspace_id, post_id, platform, platform_comment_id, author_handle, author_hash, text, posted_at, likes, views, sentiment, sentiment_source)
      select $2, p.id, b.platform, b.platform_comment_id, b.author_handle, b.author_hash, b.text, b.posted_at, b.likes, b.views, b.sentiment, b.sentiment_source
        from b join posts p on p.workspace_id = $2 and p.platform = b.platform and p.url = b.url and p.brand_id = b.brand_id
      on conflict (workspace_id, platform_comment_id) do update set
        post_id = excluded.post_id, platform = excluded.platform, author_handle = excluded.author_handle, author_hash = excluded.author_hash,
        text = excluded.text, posted_at = excluded.posted_at, likes = excluded.likes, views = excluded.views,
        sentiment = ${keep("sentiment")}, sentiment_source = ${keep("sentiment_source")}
      where (comments.post_id, comments.platform, comments.author_handle, comments.author_hash, comments.text, comments.posted_at, comments.likes, comments.views, comments.sentiment, comments.sentiment_source)
            is distinct from (excluded.post_id, excluded.platform, excluded.author_handle, excluded.author_hash, excluded.text, excluded.posted_at, excluded.likes, excluded.views, ${keep("sentiment")}, ${keep("sentiment_source")})
      returning comments.id, comments.sentiment, comments.sentiment_source
    ), lb as (
      insert into labels (workspace_id, target, target_id, kind, value, labeller_id)
      select $2, 'comment', w.id, 'sentiment', w.sentiment, $4::int from w where w.sentiment_source = 'listening' and w.sentiment is not null
      returning 1
    )
    select (select count(*) from w)::int as changed, (select count(*) from b)::int as rows, (select count(*) from lb)::int as labels, (select max(platform_comment_id) from b) as last`;
}

type Step = { changed: number; rows: number; labels?: number; last: string[] | string | null };

/**
 * Promote a staged load, as far as `budgetMs` allows; call again with the progress it returns until done.
 * The CLI passes a large budget; a CMS job passes what one function call can hold.
 */
export async function promote(loadId: string, from: PromoteProgress = { phase: "prepare" }, budgetMs = 40_000): Promise<{ progress: PromoteProgress; done: boolean }> {
  const started = Date.now();
  const left = () => budgetMs - (Date.now() - started);
  const l = await loadOf(loadId);
  const ws = l.workspace_id;
  const p: PromoteProgress = { ...from, changed: { ...(from.changed ?? {}) } };
  const add = (k: string, n: number) => { p.changed![k] = (p.changed![k] ?? 0) + n; };
  const next = (phase: PromoteProgress["phase"]) => { p.phase = phase; p.key = undefined; };

  while (left() > 0 && p.phase !== "done") {
    if (p.phase === "prepare") {
      await q(`update staging.loads set status = 'promoting', decided_at = coalesce(decided_at, now()) where id = $1`, [loadId]);
      p.ledgers = await openLedgers(l);
      const facts = l.report.facts ?? {};
      if (l.source === "listening") {
        const { writeTopics, writeBrandCaptures } = await import("../onboard/listening");
        const topics = await q<{ id: string; label: string; sort_order: number; is_catch_all: boolean }>(`select id, label, sort_order, is_catch_all from staging.topics where load_id = $1`, [loadId]);
        await writeTopics(ws, topics);
        const caps = (facts.brand_captures ?? {}) as Record<string, Record<string, string[]>>;
        await writeBrandCaptures(ws, new Map(Object.entries(caps).map(([id, byP]) => [id, new Map(Object.entries(byP).map(([pl, hs]) => [pl, new Set(hs)]))])));
      }
      if (l.source === "profile" && facts.subject) {
        // the subject is the workspace's one brand, made or updated from the contract (etl/load_profile.py ensure_subject)
        const subj = facts.subject as { brand_id: string; name: string; owned_handles: Record<string, string[]>; keywords: string[] };
        const owned = Object.fromEntries(["youtube", "tiktok", "instagram", "threads", "x"].map((pl) => [pl, [...new Set((subj.owned_handles[pl] ?? []).map((h) => h.replace(/^@+/, "").trim().toLowerCase()).filter(Boolean))].sort()]));
        await q(
          `insert into brands (id, workspace_id, name, is_client, tiktok_handle, instagram_handle, tracked_on, owned_handles, keywords)
           values ($1, $2, $3, true, $4, $5, 'both', $6::jsonb, $7::jsonb)
           on conflict (id) do update set name = excluded.name, is_client = true, tiktok_handle = excluded.tiktok_handle,
             instagram_handle = excluded.instagram_handle, owned_handles = excluded.owned_handles, keywords = excluded.keywords`,
          [subj.brand_id, ws, subj.name, owned.tiktok[0] ?? null, owned.instagram[0] ?? null, toJson(owned), toJson(subj.keywords)],
        );
        await q(`update workspaces set client_brand_id = $2 where id = $1`, [ws, subj.brand_id]);
      }
      next("creators");
      continue;
    }
    if (p.phase === "creators") {
      const [pl, h] = p.key ?? ["", ""];
      const sqlText = creatorSql(l.source);
      // the batch's last key, read before the write (the insert returns only whether it changed a row)
      const lastRow = (await q<{ platform: string; handle: string }>(
        `select platform, handle from (select platform, handle from staging.accounts where load_id = $1 and (platform, handle) > ($2, $3) order by platform, handle limit ${BATCH.creators}) b order by platform desc, handle desc limit 1`,
        [loadId, pl, h]))[0];
      if (!lastRow) { next(l.source === "profile" ? "stubs" : "posts"); continue; }
      add("creators", (await q(sqlText, [loadId, ws, pl, h])).length);
      p.key = [lastRow.platform, lastRow.handle];
      continue;
    }
    if (p.phase === "stubs") {
      const cols = POST_WRITE.profile.cols;
      add("stub_posts", (await q(STUB_SQL(cols), [loadId, ws, toJson(p.ledgers ?? {})])).length);
      next("posts");
      continue;
    }
    if (p.phase === "posts") {
      const [pl, u, br] = p.key ?? ["", "", ""];
      const rule = l.source === "listening" ? await labellerId("rule:terms", String((l.report.facts ?? {}).terms_version ?? "")) : null;
      const r = (await q<Step>(postSql(l.source), [loadId, ws, pl, u, br, toJson(p.ledgers ?? {}), rule]))[0];
      add("posts", r.changed);
      if (r.labels) add("labels", r.labels);
      if (!r.rows) { next(l.source === "listening" ? "readings" : "export_readings"); continue; }
      p.key = r.last as string[];
      continue;
    }
    if (p.phase === "export_readings") {
      const [pl, u, br] = p.key ?? ["", "", ""];
      const r = (await q<Step>(EXPORT_READING_SQL, [loadId, ws, pl, u, br]))[0];
      add("readings", r.changed);
      if (!r.rows) { next(l.source === "profile" ? "comments" : "finish"); continue; }
      p.key = r.last as string[];
      continue;
    }
    if (p.phase === "readings") {
      const [pl, u, br, d] = p.key ?? ["", "", "", "-1"];
      const r = (await q<Step>(READING_SQL, [loadId, ws, pl, u, br, d]))[0];
      add("readings", r.changed);
      if (!r.rows) { next("comments"); continue; }
      p.key = r.last as string[];
      continue;
    }
    if (p.phase === "comments") {
      const vendor = await labellerId("vendor:fair-listening", "");
      const r = (await q<Step>(commentSql(l.source), [loadId, ws, p.key?.[0] ?? "", vendor]))[0];
      add("comments", r.changed);
      if (r.labels) add("labels", r.labels);
      if (!r.rows) { next(l.source === "profile" ? "captions" : "finish"); continue; }
      p.key = [r.last as string];
      continue;
    }
    if (p.phase === "captions") {
      // a url → text export fills captions that are empty, never one that is there
      const r = await q(
        `update posts p set caption = c.caption, hashtags = c.hashtags from staging.captions c
          where c.load_id = $1 and p.workspace_id = $2 and p.platform = c.platform and p.url = c.url and p.caption is null returning 1`,
        [loadId, ws]);
      add("captions", r.length);
      next("finish");
      continue;
    }
    if (p.phase === "finish") {
      // the ledgers record what each file changed; the views and statistics catch up with the load (src/db/refresh.sql)
      for (const id of Object.values(p.ledgers ?? {})) await q(`update data_loads set finished_at = now(), report = report || $2::jsonb where id = $1`, [id, toJson({ changed: p.changed })]);
      const { refreshViews } = await import("../onboard/load");
      await refreshViews();
      await q(`update staging.loads set status = 'live', live_at = now(), report = report || $2::jsonb where id = $1`, [loadId, toJson({ promoted: p.changed })]);
      p.phase = "done";
    }
  }
  return { progress: p, done: p.phase === "done" };
}
