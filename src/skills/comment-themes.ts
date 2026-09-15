import { EvidenceList, commentEvidence } from "./common";
import { SUBJECT_REPLIES_CAVEAT, commentWhere, commentWindow, labelCaveat, offTopicCaveat, offTopicCount, pct } from "./comments-common";
import { limitOf, resolvePlatforms } from "./params";
import type { SkillImpl } from "./runner";
import { STOPWORDS } from "./stopwords";
import type { Row } from "./types";

/** /comment-themes — the words and phrases that recur in comments of one sentiment, with the comments behind them. */
export const commentThemes: SkillImpl = async (db, ctx, _def, params) => {
  const platforms = resolvePlatforms(params.platform);
  const w = await commentWindow(db, ctx, params.window, 30, platforms);
  const sentiment = String(params.sentiment ?? "negative");
  const minComments = Math.max(2, Number(params.min_comments ?? 5));
  const limit = limitOf(params, 40);

  const p: unknown[] = [];
  const where = commentWhere(ctx, w, platforms, p) + (sentiment === "all" ? "" : ` and c.sentiment = $${p.push(sentiment)}`);
  // the subject's own name is in most comments by construction; drop its parts with the stopwords
  const subjectWords = ctx.brands.flatMap((b) => `${b.name} ${b.id}`.toLowerCase().split(/[^a-z0-9]+/)).filter((x) => x.length >= 3);
  const pStop = `$${p.push([...STOPWORDS, ...subjectWords])}`;
  const pMin = `$${p.push(minComments)}`;
  const pLimit = `$${p.push(limit)}`;
  const raw = await db.q<Row>(
    `with c as (select c.id, coalesce(c.likes, 0) as likes, lower(c.text) as text from comments c where ${where} and c.text is not null),
     tok as (select c.id, c.likes, w.word, w.ord from c, lateral regexp_split_to_table(c.text, '[^[:alnum:]]+') with ordinality as w(word, ord) where w.word <> ''),
     ok as (select * from tok where length(word) >= 3 and word !~ '^[0-9]+$' and word <> all(${pStop}::text[])),
     uni as (select word as term, 'word' as kind, count(distinct id)::int as comments, sum(likes)::int as likes from ok group by 1),
     bi as (select a.word || ' ' || b.word as term, 'phrase' as kind, count(distinct a.id)::int as comments, sum(a.likes)::int as likes
            from ok a join ok b on b.id = a.id and b.ord = a.ord + 1 group by 1),
     total as (select count(*)::int as n from c)
     select t.term, t.kind, t.comments, t.likes, round(t.comments * 100.0 / nullif(total.n, 0), 1)::float8 as share_pct, total.n as total_comments
     from (select * from uni union all select * from bi) t, total
     where t.comments >= ${pMin}
     order by t.comments desc, t.kind desc, t.likes desc
     limit ${pLimit}`,
    p,
  );
  // a word carried almost entirely by one phrase ("deaf" inside "tone deaf") is the phrase; keep the phrase
  const phrases = raw.filter((r) => r.kind === "phrase");
  const rows = raw.filter((r) => r.kind === "phrase" || !phrases.some((ph) => String(ph.term).split(" ").includes(String(r.term)) && Number(ph.comments) >= 0.8 * Number(r.comments)));
  const total = raw.length ? Number(raw[0].total_comments) : Number((await db.one<{ n: number }>(`select count(*)::int as n from comments c where ${where}`, p.slice(0, p.length - 3)))?.n ?? 0);
  const unl = sentiment === "all" ? Number((await db.one<{ n: number }>(`select count(*)::int as n from comments c where ${where} and c.sentiment is null`, p.slice(0, p.length - 3)))?.n ?? 0) : 0;
  if (total === 0 && sentiment !== "all") {
    const all = await db.one<{ n: number; unl: number }>(`select count(*)::int as n, count(*) filter (where c.sentiment is null)::int as unl from comments c where ${commentWhere(ctx, w, platforms, [])}`, (() => { const q: unknown[] = []; commentWhere(ctx, w, platforms, q); return q; })());
    if (all?.n && all.unl === all.n) return { status: "unavailable", message: `No comment in this window has a sentiment label yet; labelling runs in the background, ask again shortly or use sentiment "all".`, params_resolved: { ...params, window: { from: w.from, to: w.to } }, summary: { comments: all.n, unlabelled: all.unl }, rows: [], evidence: [] };
  }

  const offTopic = await offTopicCount(db, ctx, w, platforms);
  const ev = new EvidenceList(160);
  const out: Row[] = [];
  if (rows.length) {
    const q: unknown[] = [];
    const whereQ = commentWhere(ctx, w, platforms, q) + (sentiment === "all" ? "" : ` and c.sentiment = $${q.push(sentiment)}`);
    const pTerms = `$${q.push(rows.map((r) => r.term))}`;
    const per = rows.length > 25 ? 1 : 2;
    const pPer = `$${q.push(per)}`;
    const samples = await db.q<Row>(
      `select s.* from unnest(${pTerms}::text[]) as t(term), lateral (
         select t.term as term, c.id, c.author_handle, c.platform, c.posted_at, c.likes, c.text, c.sentiment, p.url as post_url
         from comments c join posts p on p.id = c.post_id
         where ${whereQ} and c.text ~* ('(^|[^[:alnum:]])' || regexp_replace(t.term, '([.^$|()\\[\\]{}*+?\\\\])', '\\\\\\1', 'g') || '($|[^[:alnum:]])')
         order by c.likes desc nulls last, c.posted_at limit ${pPer}) s`,
      q,
    );
    const byTerm = new Map<string, Row[]>();
    for (const s of samples) byTerm.set(s.term as string, [...(byTerm.get(s.term as string) ?? []), s]);
    for (const r of rows) {
      const ids: string[] = [];
      const examples: string[] = [];
      for (const s of byTerm.get(r.term as string) ?? []) {
        const id = ev.push((eid) => commentEvidence(eid, s, { term: r.term as string }));
        if (id) ids.push(id);
        examples.push(String(s.text).replace(/\s+/g, " ").slice(0, 160));
      }
      out.push({ term: r.term, kind: r.kind, comments: r.comments, share_pct: r.share_pct, likes: r.likes, examples, evidence_ids: ids });
    }
  }
  return {
    params_resolved: { ...params, window: { from: w.from, to: w.to }, platform: params.platform ?? "all", sentiment, min_comments: minComments, limit },
    summary: { window: w.label, sentiment, comments_read: total, unlabelled: unl, off_topic_set_aside: offTopic, terms: out.length, words_folded_into_phrases: raw.length - rows.length, top_terms: out.slice(0, 8).map((r) => `${r.term} (${r.comments})`), rule: `words and two-word phrases carried by at least ${minComments} ${sentiment === "all" ? "" : sentiment + " "}comments; stopwords removed; share is of all ${sentiment === "all" ? "" : sentiment + " "}comments in the window` },
    rows: out,
    evidence: ev.list,
    matched: total,
    data_window: { from: w.from, to: w.to },
    caveats: [...labelCaveat(total, unl), ...offTopicCaveat(offTopic), SUBJECT_REPLIES_CAVEAT, "Terms are counted per comment (a word repeated inside one comment counts once); phrases are adjacent word pairs, so a theme can appear as both a word and a phrase."],
  };
};
