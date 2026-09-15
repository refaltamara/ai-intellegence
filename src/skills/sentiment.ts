import { EvidenceList, aggregateEvidence, commentEvidence } from "./common";
import { SUBJECT_REPLIES_CAVEAT, commentWhere, commentWindow, labelCaveat, offTopicCaveat, offTopicCount, pct } from "./comments-common";
import { limitOf, resolvePlatforms } from "./params";
import type { SkillImpl } from "./runner";
import type { Row } from "./types";

type Bucket = { bucket: string; comments: number; negative: number; neutral: number; positive: number; unlabelled: number; authors: number; likes: number };

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** /sentiment — comments split by sentiment over time, with the spike. */
export const sentiment: SkillImpl = async (db, ctx, _def, params) => {
  const platforms = resolvePlatforms(params.platform);
  const w = await commentWindow(db, ctx, params.window, 30, platforms);
  const days = Math.round((Date.parse(w.to) - Date.parse(w.from)) / 86400000) + 1;
  const bucket = params.bucket === "auto" || !params.bucket ? (days <= 3 ? "hour" : "day") : String(params.bucket);
  const minNeg = Number(params.min_negative ?? 20);
  const multiple = Number(params.multiple_of_baseline ?? 3);
  const limit = limitOf(params, 200);

  const p: unknown[] = [];
  const where = commentWhere(ctx, w, platforms, p);
  const pTz = `$${p.push(ctx.tz)}`;
  const pBucket = `$${p.push(bucket)}`;
  const buckets = await db.q<Bucket>(
    `select to_char(date_trunc(${pBucket}, c.posted_at at time zone ${pTz}), 'YYYY-MM-DD"T"HH24:MI') as bucket,
            count(*)::int as comments,
            count(*) filter (where c.sentiment = 'negative')::int as negative,
            count(*) filter (where c.sentiment = 'neutral')::int as neutral,
            count(*) filter (where c.sentiment = 'positive')::int as positive,
            count(*) filter (where c.sentiment is null)::int as unlabelled,
            count(distinct c.author_handle)::int as authors,
            coalesce(sum(c.likes), 0)::int as likes
     from comments c where ${where}
     group by 1 order by 1`,
    p,
  );
  const perPlatform = await db.q<Row>(
    `select c.platform, count(*)::int as comments,
            count(*) filter (where c.sentiment = 'negative')::int as negative,
            count(*) filter (where c.sentiment = 'neutral')::int as neutral,
            count(*) filter (where c.sentiment = 'positive')::int as positive,
            count(*) filter (where c.sentiment is null)::int as unlabelled,
            count(distinct c.author_handle)::int as authors,
            to_char(min(c.posted_at at time zone ${pTz}), 'YYYY-MM-DD HH24:MI') as first_comment,
            to_char(max(c.posted_at at time zone ${pTz}), 'YYYY-MM-DD HH24:MI') as last_comment
     from comments c where ${where} group by 1 order by comments desc`,
    p.slice(0, p.length - 1),
  );
  const total = buckets.reduce((a, b) => a + b.comments, 0);
  const neg = buckets.reduce((a, b) => a + b.negative, 0);
  const neu = buckets.reduce((a, b) => a + b.neutral, 0);
  const pos = buckets.reduce((a, b) => a + b.positive, 0);
  const unl = buckets.reduce((a, b) => a + b.unlabelled, 0);
  const labelled = total - unl;

  // spike: negative count at or above max(min_negative, multiple × median of the other buckets)
  const negs = buckets.map((b) => b.negative);
  const peak = buckets.reduce((best, b) => (b.negative > (best?.negative ?? -1) ? b : best), null as Bucket | null);
  const baseline = median(negs.filter((_, i) => buckets[i] !== peak));
  const threshold = Math.max(minNeg, multiple * baseline);
  const spikes = buckets.filter((b) => b.negative >= threshold);
  const spikeStart = spikes[0]?.bucket ?? null;

  const ev = new EvidenceList(160);
  const rows = buckets.slice(0, limit).map((b) => {
    const id = ev.push((eid) => aggregateEvidence(eid, `comments by sentiment, ${bucket} starting ${b.bucket} (${ctx.tz})`, `${b.bucket} · ${b.comments} comments`, { negative: b.negative, neutral: b.neutral, positive: b.positive, unlabelled: b.unlabelled, negative_pct: pct(b.negative, b.comments - b.unlabelled) }));
    return { bucket: b.bucket, comments: b.comments, negative: b.negative, neutral: b.neutral, positive: b.positive, unlabelled: b.unlabelled, negative_pct: pct(b.negative, b.comments - b.unlabelled), authors: b.authors, likes: b.likes, spike: b.negative >= threshold, evidence_ids: id ? [id] : [] };
  });

  // the loudest comments in the window, as evidence the model can quote
  const q: unknown[] = [];
  const whereQ = commentWhere(ctx, w, platforms, q);
  const samples = await db.q<Row>(
    `(select c.id, c.author_handle, c.platform, c.posted_at, c.likes, c.text, c.sentiment, p.url as post_url from comments c join posts p on p.id = c.post_id
      where ${whereQ} and c.sentiment = 'negative' order by c.likes desc nulls last, c.posted_at limit 6)
     union all
     (select c.id, c.author_handle, c.platform, c.posted_at, c.likes, c.text, c.sentiment, p.url as post_url from comments c join posts p on p.id = c.post_id
      where ${whereQ} and c.sentiment = 'positive' order by c.likes desc nulls last, c.posted_at limit 4)`,
    q,
  );
  const sampleIds: Record<string, string[]> = { negative: [], positive: [] };
  for (const s of samples) {
    const id = ev.push((eid) => commentEvidence(eid, s));
    if (id) sampleIds[s.sentiment as string].push(id);
  }
  const offTopic = await offTopicCount(db, ctx, w, platforms);
  const chart = buckets.length >= 3 ? {
    type: "stacked_bar" as const,
    x: buckets.map((b) => (bucket === "hour" ? b.bucket.replace("T", " ") : b.bucket.slice(0, 10))),
    series: [
      { name: "Negative", data: buckets.map((b) => b.negative), stack: "s" },
      { name: "Neutral", data: buckets.map((b) => b.neutral), stack: "s" },
      { name: "Positive", data: buckets.map((b) => b.positive), stack: "s" },
      ...(unl ? [{ name: "Unlabelled", data: buckets.map((b) => b.unlabelled), stack: "s" }] : []),
    ],
    y_label: "comments",
    title: `Comments by sentiment per ${bucket}`,
  } : undefined;
  return {
    params_resolved: { ...params, window: { from: w.from, to: w.to }, platform: params.platform ?? "all", bucket, min_negative: minNeg, multiple_of_baseline: multiple, limit },
    summary: {
      window: w.label, bucket, comments: total, labelled, unlabelled: unl, off_topic_set_aside: offTopic,
      negative: neg, neutral: neu, positive: pos,
      negative_pct: pct(neg, labelled), neutral_pct: pct(neu, labelled), positive_pct: pct(pos, labelled),
      spike_started: spikeStart, peak_bucket: peak?.bucket ?? null, peak_negative: peak?.negative ?? 0, spike_threshold: Math.round(threshold * 10) / 10, buckets_in_spike: spikes.length,
      per_platform: perPlatform.map((r) => ({ ...r, negative_pct: pct(r.negative as number, (r.comments as number) - (r.unlabelled as number)) })),
      loudest_negative: sampleIds.negative, loudest_positive: sampleIds.positive,
      rule: `a ${bucket} is a spike when its negative comments >= max(${minNeg}, ${multiple} × median ${bucket} negative count)`,
    },
    rows,
    chart,
    evidence: ev.list,
    matched: total,
    data_window: { from: w.from, to: w.to },
    caveats: [...labelCaveat(total, unl), ...offTopicCaveat(offTopic), SUBJECT_REPLIES_CAVEAT, "Comment times are when the comment was posted; the export captured each post once, so comments posted after the export are not here."],
  };
};
