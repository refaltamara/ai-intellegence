/**
 * Moving an export reading to the time its file was read (DECISIONS, 10 Oct 2026, step 4). Until 10 Oct every profile file
 * read as exported at its contract's first export time (src/loader/adapters/profile.ts, readTimeOf), so a later batch's
 * readings came before their own posts. Given a staged load of the same files, each post's export reading is moved to the
 * time the load gives it, with its age and day index, in place: the reading is the same reading, only its time was wrong.
 * Promoting the load then writes the posts' read time and finds every reading already where it belongs.
 */
import { sql } from "../db/client";

export async function moveExportReadings(loadId: string): Promise<{ moved: number }> {
  const l = ((await sql.query(`select workspace_id, source from staging.loads where id = $1`, [loadId])) as { workspace_id: string; source: string }[])[0];
  if (!l) throw new Error(`no staged load ${loadId}`);
  if (l.source !== "profile") throw new Error(`load ${loadId} is ${l.source}: only profile exports had their read times wrong`);
  const r = (await sql.query(
    `with s as (
       select distinct on (platform, url, brand_id) platform, url, brand_id, read_at from staging.posts
        where load_id = $1 and not stub and read_at is not null order by platform, url, brand_id, read_at desc
     ), moved as (
       update post_readings r set read_at = s.read_at,
              age_hours = round(extract(epoch from (s.read_at - p.posted_at)) / 3600)::int,
              day_n = greatest(0, floor(extract(epoch from (s.read_at - p.posted_at)) / 86400))::smallint
         from posts p join s on s.platform = p.platform and s.url = p.url and s.brand_id = p.brand_id
        where p.workspace_id = $2 and r.post_id = p.id and r.source = 'export' and r.read_at is distinct from s.read_at
          and not exists (select 1 from post_readings x where x.post_id = r.post_id and x.read_at = s.read_at)
       returning 1
     ) select count(*)::int as n from moved`,
    [loadId, l.workspace_id],
  )) as { n: number }[];
  return { moved: r[0].n };
}
