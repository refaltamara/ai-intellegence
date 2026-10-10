/**
 * A Fair Listening dump (13 CSV tables) → staged rows. The mapping is the listening loader's (src/onboard/listening.ts,
 * itself ported row for row from etl/load_listening.py): posts per brand, the capture tracked last wins; readings day
 * 0 to 30; comments with the dump's labels; creators; the dump's own topics. Tables the loader does not read
 * (content_media, content_audio, daily sentiment, the topic-theme map) stay in the raw file only.
 */
import path from "node:path";
import { contractFromDb, type StoredFile } from "../../onboard/contract";
import { buildComments, buildPosts, buildSnapshots, creatorRows, parseCsv, primeTable, table, topicRows } from "../../onboard/listening";
import { DUMP_TABLES, tableOf } from "../../onboard/storage";
import { flagsOf } from "./beauty";
import { ruleVersion } from "../../labels/record";
import { emptyStaged, type AdapterInput, type FileReport, type Staged, type StagedPost } from "../types";

export async function readListening(input: AdapterInput): Promise<Staged> {
  const st = emptyStaged();
  const k = await contractFromDb(input.workspace);
  if (!k || !Object.keys(k.brands).length) throw new Error(`${input.workspace} has no brands to map the dump's accounts to yet (CMS → the workspace → Brands).`);
  const files: Record<string, StoredFile> = {};
  const rawOf: Record<string, string | null> = {};
  for (const { raw, bytes } of input.files) {
    const name = path.basename(raw.path);
    const t = tableOf(name);
    if (!t || !(DUMP_TABLES as readonly string[]).includes(t)) {
      st.files.push({ file: name, kind: "other", platform: null, rows_in: 0, staged: 0, merged: 0, dropped: 0, drops: {}, notes: { kept_raw_only: true } });
      continue;
    }
    const url = `raw://${raw.sha256}`;
    primeTable(url, parseCsv(bytes.toString("utf8")));
    files[t] = { table: t, name, url, size: bytes.length, at: "" };
    rawOf[t] = raw.sha256;
  }
  const missing = DUMP_TABLES.filter((t) => !files[t]);
  if (missing.length) throw new Error(`The dump has no ${missing.join(", ")} file${missing.length === 1 ? "" : "s"}.`);

  const built = await buildPosts(k, files);
  const content = await table(files, "_content_");
  const postDrops = Object.values(built.drops).reduce((a, d) => a + d.count, 0);
  st.posts = built.rows.map(({ _cid, ...r }): StagedPost => ({
    platform: r.platform, url: r.url, brand_id: r.brand_id, platform_post_id: r.platform_post_id, creator_handle: r.creator_handle,
    // a listening post's creator is whoever posted it, the brand's own accounts included
    creator_key: r.creator_handle, source: r.source as "owned" | "earned", collection: r.collection, account_type: null, posted_at: r.posted_at,
    month: r.month, caption: r.caption, hashtags: r.hashtags, tagged_handles: r.tagged_handles, is_paid: r.is_paid, has_cart: null, is_reseller: null,
    followers_at_post: r.followers_at_post, tier: r.tier, universe: null, category_broad: null, product_category: null, content_format: null,
    content_type: r.content_type, product_name: null, product_url: null, price: null, price_original: null, discount_percent: null, views: r.views,
    likes: r.likes, comments_count: r.comments_count, shares: r.shares, saves: r.saves, engagements: r.engagements, engagements_lc: r.engagements_lc,
    captured_days: r.captured_days, relevant: r.relevant, stub: false, flags: flagsOf(r.followers_at_post, r.views, r.content_type), source_file: r.source_file,
  }));
  st.files.push({ file: files._content_.name, kind: "posts", platform: null, rows_in: content.length, staged: built.rows.length, merged: content.length - built.rows.length - postDrops, dropped: postDrops, drops: built.drops, notes: { naive_times: built.rows.length } });

  const kept = new Map(built.rows.map((r) => [r._cid, `${r.platform}\u0001${r.url}\u0001${r.brand_id}`]));
  const sn = await buildSnapshots(files, kept);
  const snapsIn = (await table(files, "content_metric_snapshot")).length;
  st.readings = sn.rows.map((r) => ({ ...r }));
  // a post's numbers were read at its latest reading
  const lastRead = new Map<string, string>();
  for (const r of sn.rows) {
    const k = `${r.platform}\u0001${r.url}\u0001${r.brand_id}`;
    if (!lastRead.has(k) || r.captured_at > lastRead.get(k)!) lastRead.set(k, r.captured_at);
  }
  for (const p of st.posts) p.read_at = lastRead.get(`${p.platform}\u0001${p.url}\u0001${p.brand_id}`) ?? null;
  st.files.push({ file: files.content_metric_snapshot.name, kind: "snapshots", platform: null, rows_in: snapsIn, staged: sn.rows.length, merged: snapsIn - sn.rows.length - sn.drops, dropped: sn.drops, drops: sn.drops ? { "not on a kept capture, or a day outside 0 to 30": { count: sn.drops, examples: [] } } : {}, notes: { merged_means: "a later reading of the same post and day, or a reading without a time" } });

  const t = await topicRows(input.workspace, files);
  st.topics = t.rows;
  const cm = await buildComments(k, files, built.keyOf, t.ids);
  const commentsIn = (await table(files, "_comment_")).length;
  const sameComment = cm.drops["same comment on another capture"] ?? 0;
  const otherDrops = Object.entries(cm.drops).filter(([w]) => w !== "same comment on another capture");
  st.comments = cm.rows.map((r) => ({
    platform: r.platform, url: r.url, brand_id: r.brand_id, platform_comment_id: r.platform_comment_id, author_handle: r.author_handle, author_hash: r.author_hash,
    text: r.text, posted_at: r.posted_at, likes: r.likes, views: null, sentiment: r.sentiment, sentiment_source: r.sentiment_source, sentiment_confidence: r.confidence,
    sentiment_detail: null, csat: null, theme: r.theme, purchase_intent: r.purchase_intent, translation: r.translation, topic_id: r.topic_id, flags: null,
    source_file: files._comment_.name,
  }));
  st.files.push({
    file: files._comment_.name, kind: "comments", platform: null, rows_in: commentsIn, staged: cm.rows.length, merged: sameComment,
    dropped: otherDrops.reduce((a, [, n]) => a + n, 0), drops: Object.fromEntries(otherDrops.map(([w, n]) => [w, { count: n, examples: [] }])),
  });

  st.accounts = await creatorRows(files, built.rows);
  const brandCaptures = Object.fromEntries([...built.seen].map(([id, byP]) => [id, Object.fromEntries([...byP].map(([p, hs]) => [p, [...hs].sort()]))]));
  // which terms judged relevance at this load: the rule's version on every relevance label it writes
  const termsVersion = ruleVersion(Object.fromEntries(Object.entries(k.brands).map(([id, br]) => [id, { terms: br.terms, never: br.never ?? [], handles: br.handles }])));
  st.facts = { client: k.client, unmapped_accounts: built.unmapped, unknown_labels: cm.unknownLabels, brand_captures: brandCaptures, raw_tables: rawOf, terms_version: termsVersion };
  for (const f of st.files as FileReport[]) f.platform = f.platform ?? null;
  return st;
}
