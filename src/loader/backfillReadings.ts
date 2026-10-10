/**
 * Readings for what was loaded before readings kept their time (DECISIONS, 10 Oct 2026): the same rules the adapters now
 * follow, applied to the posts already in the core, so a reload changes nothing.
 *   listening  posts.read_at = the post's latest dump reading
 *   profile    posts.read_at = the time of the export that last wrote the post (the contract's per file), stubs none
 *   beauty     posts.read_at = the day the file reached us (raw_files), at the latest
 * Then one 'export' reading per non-listening post with a read_at. Safe to run again: it fills only a read time that is
 * missing, since a link now shares its post's read time (migration 0036) and the loader keeps it.
 */
import { sql } from "../db/client";
import { toJson } from "../db/json";
import { naiveLocal } from "./parse";
import { Profile, readContract } from "./adapters/profile";

const q = async <T>(text: string, params: unknown[] = []) => (await sql.query(text, params)) as T[];

export async function backfillReadings(log: (s: string) => void = () => {}): Promise<void> {
  const ws = await q<{ id: string; kind: string; tz: string }>(`select id, kind, tz from workspaces order by id`);
  for (const w of ws) {
    const listening = (await q<{ n: number }>(`select count(*)::int as n from post_readings r join posts p on p.id = r.post_id where p.workspace_id = $1 and r.source = 'listening'`, [w.id]))[0].n > 0;
    if (listening) {
      const r = await q(
        `update posts p set read_at = r.at from (select r.post_id, max(r.read_at) as at from post_readings r join posts p2 on p2.id = r.post_id
           where p2.workspace_id = $1 and r.source = 'listening' group by 1) r where p.id = r.post_id and p.read_at is null returning 1`, [w.id]);
      log(`${w.id}: read_at from the latest dump reading on ${r.length} posts`);
      continue;
    }
    let byFile: Record<string, string> = {};
    if (w.kind === "profile") {
      try {
        const c = readContract(w.id);
        const prof = new Profile(c);
        for (const f of c.files) if (f.kind === "contents") byFile[f.file.split("/").pop()!] = prof.anchorFor(f).toISOString();
      } catch { log(`${w.id}: no contract, skipped`); continue; }
    } else {
      const files = await q<{ path: string; received: string }>(`select path, received::text from raw_files where workspace_id = $1`, [w.id]);
      byFile = Object.fromEntries(files.map((f) => [f.path.split("/").pop()!, naiveLocal(f.received, w.tz)!.toISOString()]));
    }
    const r = await q(
      `update posts p set read_at = m.at::timestamptz from jsonb_each_text($2::jsonb) as m(file, at)
        where p.workspace_id = $1 and p.source_file = m.file and coalesce(p.content_type, '') <> 'stub' and p.read_at is null returning 1`,
      [w.id, toJson(byFile)]);
    const e = await q(
      `insert into post_readings (post_id, read_at, age_hours, day_n, source, views, likes, comments_count, shares, saves)
       select p.id, p.read_at, round(extract(epoch from (p.read_at - p.posted_at)) / 3600)::int, greatest(0, floor(extract(epoch from (p.read_at - p.posted_at)) / 86400))::smallint,
              'export', p.views, p.likes, p.comments_count, p.shares, p.saves
         from posts p where p.workspace_id = $1 and p.read_at is not null
       on conflict (post_id, read_at, day_n) do nothing returning 1`, [w.id]);
    log(`${w.id}: read_at on ${r.length} posts, ${e.length} export readings`);
  }
}
