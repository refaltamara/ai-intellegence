#!/usr/bin/env python3
"""Listening loader: a Fair Listening database dump (one CSV per table) -> one category workspace.

  python3 etl/load_listening.py etl/listening/fintech-id.json <dump_dir>            # load
  python3 etl/load_listening.py etl/listening/fintech-id.json <dump_dir> --dry-run  # report only
  add --no-refresh to skip the materialized views

The complete listening product (DECISIONS 3 Oct 2026) fetches keyword contents and
the brands' own accounts every day, tracks each content for up to 30 days, fetches
its comments and labels each comment (five-point sentiment with CSAT, theme,
purchase intent, topic). This loader keeps that schema as it comes:

  _content_                 -> posts (one row per platform + url + brand)
  creator                   -> creators (tier recomputed from followers, src/config)
  brand                     -> brands, grouped by the contract (listening brands are per-platform handles)
  content_hashtag           -> posts.hashtags
  content_metric_snapshot   -> post_snapshots (day 0-30)
  _comment_ + comment_sentiment (is_latest) -> comments, labelled (sentiment_source 'listening')
  topic                     -> topics (the workspace's own taxonomy)

Not loaded: content_sentiment_daily (rolled up from comments), content_media,
content_audio, topic_theme_map (themes arrive mapped). content_tagged_user is read
only to judge relevance.
The beauty-only columns (category, product_type, format_content) are dropped.

Duplicates: the same post captured by several queries for one brand is one row
(the capture tracked last wins); a post captured for two brands is two rows.
A post is owned when its author is one of its brand's handles. A post is
relevant (about its brand) when it is owned or its caption names the brand (the
contract's terms and handles) or it tags one of the brand's accounts; the rest stay stored with relevant = false and
are left out of every reputation number. A comment by one
of the post's brand handles is the brand's reply (sentiment_source 'subject',
never counted). Re-running is idempotent (upserts on the natural keys).
"""
import argparse, glob, json, re, sys, time
from datetime import datetime
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from config import tier_for_followers
from neon_http import NeonHttp
from load_profile import LOCAL_TZ, author_hash, hashtags as caption_hashtags, refresh_views

CHUNK = 1000
PLATFORM = {"tiktok": "tiktok", "instagram": "instagram", "threads": "threads", "twitter": "x", "x": "x", "youtube": "youtube"}

def log(*a):
    print(*a, file=sys.stderr, flush=True)

def read(dump, table):
    hits = sorted(glob.glob(str(Path(dump) / f"{table}_[0-9]*.csv")))
    if not hits:
        raise SystemExit(f"no {table}_<stamp>.csv in {dump}")
    return pd.read_csv(hits[-1], low_memory=False, keep_default_na=False, na_values=[""]), Path(hits[-1]).name

def s(v):
    if v is None or (isinstance(v, float) and v != v):
        return None
    t = str(v).strip()
    return t or None

def i(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if f != f else int(round(f))

def b(v):
    t = s(v)
    return None if t is None else t.lower() == "true"

def when(v):
    t = s(v)
    if not t:
        return None
    d = pd.to_datetime(t, utc=True, format="mixed", errors="coerce")
    return None if pd.isna(d) else d.to_pydatetime()

def handle(v):
    t = s(v)
    t = t.lstrip("@").strip().lower() if t else None
    return t or None

class Contract:
    def __init__(self, path):
        self.raw = json.loads(Path(path).read_text())
        self.ws = self.raw["workspace"]
        self.brands = self.raw["brands"]
        self.client = self.raw.get("client")
        self.by_handle = {h.lower(): bid for bid, br in self.brands.items() for h in br["handles"]}
        self.handles = {bid: {h.lower() for h in br["handles"]} for bid, br in self.brands.items()}
        self.sentiment = self.raw["sentiment_map"]
        self.terms = {bid: br.get("terms", []) for bid, br in self.brands.items()}
        self.matchers = {bid: term_matcher(self.terms[bid] + br["handles"]) for bid, br in self.brands.items()}

def term_matcher(terms):
    """One regex per brand: a term at the start of a word, case-insensitive; a term written in capitals
    ("DANA") matches only in capitals and as a whole word, because the lowercase word means something else."""
    loose = [t.lower() for t in terms if not (t.isupper() and any(ch.isalpha() for ch in t))]
    strict = [t for t in terms if t.isupper() and any(ch.isalpha() for ch in t)]
    parts = []
    if loose:
        parts.append(r"(?i:(?<![a-z0-9])(?:" + "|".join(re.escape(t) for t in sorted(set(loose), key=len, reverse=True)) + "))")
    if strict:
        parts.append(r"(?<![A-Za-z0-9])(?:" + "|".join(re.escape(t) for t in sorted(set(strict), key=len, reverse=True)) + r")(?![A-Za-z0-9])")
    return re.compile("|".join(parts)) if parts else None

# --------------------------------------------------------------- workspace
def ensure_workspace(db, k, dry):
    row = db.rows("select id, kind from workspaces where id = $1", [k.ws])
    if row and row[0]["kind"] != "category":
        raise SystemExit(f"workspace '{k.ws}' is kind '{row[0]['kind']}', not 'category'")
    clash = db.rows("select id, workspace_id from brands where id = any($1::text[]) and workspace_id <> $2", [list(k.brands), k.ws])
    if clash:
        raise SystemExit(f"brand ids already used by another workspace: {clash}")
    if dry:
        return
    db.query("""insert into workspaces (id, name, category, kind, settings) values ($1, $2, $3, 'category', $4::jsonb)
                on conflict (id) do update set name = excluded.name, category = excluded.category,
                  settings = workspaces.settings || excluded.settings""",
             [k.ws, k.raw["name"], k.raw.get("category"), json.dumps(k.raw.get("settings", {}))])

def upsert_brands(db, k, seen, dry):
    """seen: brand id -> platform -> set of listening handles that brand was captured under."""
    rows = []
    for bid, br in k.brands.items():
        on = seen.get(bid, {})
        owned = {p: sorted(h.lower() for h in br["handles"]) for p in ("tiktok", "instagram", "threads", "x")}
        first = lambda p: sorted(on.get(p, set()))[0].lower() if on.get(p) else None
        rows.append({"id": bid, "name": br["name"], "is_client": bid == k.client, "tiktok_handle": first("tiktok"),
                     "instagram_handle": first("instagram"), "owned_handles": owned, "keywords": br.get("terms", [])})
    if dry:
        return len(rows)
    db.query("""
      insert into brands (id, workspace_id, name, is_client, tiktok_handle, instagram_handle, tracked_on, owned_handles, keywords)
      select r.id, $2, r.name, r.is_client, r.tiktok_handle, r.instagram_handle, 'both', r.owned_handles, r.keywords
      from jsonb_to_recordset($1::jsonb) as r(id text, name text, is_client boolean, tiktok_handle text, instagram_handle text, owned_handles jsonb, keywords jsonb)
      on conflict (id) do update set name = excluded.name, is_client = excluded.is_client, tiktok_handle = excluded.tiktok_handle,
        instagram_handle = excluded.instagram_handle, owned_handles = excluded.owned_handles, keywords = excluded.keywords
    """, [json.dumps(rows), k.ws])
    db.query("update workspaces set client_brand_id = $2 where id = $1", [k.ws, k.client])
    return len(rows)

def upsert_topics(db, k, df, dry):
    ids, rows = {}, []
    for _, r in df.iterrows():
        tid = f"{k.ws}:{s(r['slug'])}"
        ids[i(r["id"])] = tid
        rows.append({"id": tid, "label": s(r["name"]), "sort_order": i(r["sort_order"]) or 0,
                     "is_catch_all": bool(b(r["is_catch_all"]))})
    if not dry and rows:
        db.query("""
          insert into topics (id, workspace_id, label, kind, sort_order, is_catch_all)
          select r.id, $2, r.label, 'general', r.sort_order, r.is_catch_all
          from jsonb_to_recordset($1::jsonb) as r(id text, label text, sort_order int, is_catch_all boolean)
          on conflict (id) do update set label = excluded.label, sort_order = excluded.sort_order, is_catch_all = excluded.is_catch_all
        """, [json.dumps(rows), k.ws])
    return ids, rows

def ledger(db, k, file, kind, n_in, dry):
    if dry:
        return None
    return db.scalar("insert into data_loads (workspace_id, file, platform, kind, rows_in) values ($1, $2, null, $3, $4) returning id",
                     [k.ws, file, kind, n_in])

def close(db, load_id, n_loaded, n_rejected, report):
    if load_id:
        db.query("update data_loads set rows_loaded = $2, rows_rejected = $3, report = $4::jsonb, finished_at = now() where id = $1",
                 [load_id, n_loaded, n_rejected, json.dumps(report, default=str)])

def chunks(db, sql, rows, params, size=CHUNK):
    n = 0
    for at in range(0, len(rows), size):
        n += db.query(sql, [json.dumps(rows[at:at + size], default=str), *params]).get("rowCount") or 0
        if at and at % (size * 20) == 0:
            log(f"  {at:,}/{len(rows):,}")
    return n

# ------------------------------------------------------------------- posts
POST_COLS = ["platform_post_id", "creator_handle", "brand_id", "source", "collection", "posted_at", "month", "url", "caption",
             "hashtags", "is_paid", "followers_at_post", "tier", "content_type", "views", "likes", "comments_count", "shares",
             "saves", "engagements", "engagements_lc", "captured_days", "relevant", "source_file"]
POST_TYPES = ("platform_post_id text, creator_handle text, brand_id text, source text, collection text, posted_at timestamptz, "
              "month date, url text, caption text, hashtags text[], is_paid boolean, followers_at_post int, tier text, "
              "content_type text, views bigint, likes int, comments_count int, shares int, saves int, engagements int, "
              "engagements_lc int, captured_days int, relevant boolean, source_file text")
POST_SQL = f"""
  insert into posts (workspace_id, platform, load_id, creator_id, {", ".join(POST_COLS)})
  select $2, r.platform, $3::uuid, c.id, {", ".join("r." + c for c in POST_COLS)}
  from jsonb_to_recordset($1::jsonb) as r(platform text, {POST_TYPES})
  left join creators c on c.workspace_id = $2 and c.platform = r.platform and c.handle = r.creator_handle
  on conflict (workspace_id, platform, url, brand_id) do update set load_id = excluded.load_id, creator_id = excluded.creator_id,
    {", ".join(f"{c} = excluded.{c}" for c in POST_COLS if c not in ("url", "brand_id"))}
"""

CONTENT_TYPE = {"reel": "reel", "video": "video", "photo": "photo", "image": "image", "carousel": "carousel", "text": "text"}

def engagements(platform, likes, comments, shares, saves, total):
    l, c, sh, sv = likes or 0, comments or 0, shares or 0, saves or 0
    if platform == "tiktok":
        return l + c + sh + sv
    if platform == "instagram":
        return l + c
    return total if total is not None else l + c + sh

def build_posts(k, content, creators, tags, snaps_per, tagged):
    """-> rows (one per platform+url+brand), key_of (source content id -> post key), seen handles, drops."""
    drops = {}
    def drop(reason, ex):
        d = drops.setdefault(reason, {"count": 0, "examples": []})
        d["count"] += 1
        if len(d["examples"]) < 5:
            d["examples"].append(ex)
    cr = {i(r["id"]): r for _, r in creators.iterrows()}
    brand_handle = {}
    best = {}      # key -> (rank, row)
    members = {}   # key -> [source content ids]
    seen = {}
    for _, r in content.iterrows():
        platform = PLATFORM.get((s(r["platform"]) or "").lower())
        url = s(r["url"])
        src_brand = (s(r["brand_name"]) or "").lower()
        bid = k.by_handle.get(src_brand)
        if not platform or not url:
            drop("no platform or url", r["id"]); continue
        if not bid:
            drop("brand not in the contract", src_brand); continue
        posted = when(r["date_posted"])
        if not posted:
            drop("no date_posted", url); continue
        seen.setdefault(bid, {}).setdefault(platform, set()).add(src_brand)
        key = (platform, url, bid)
        cid = i(r["id"])
        members.setdefault(key, []).append(cid)
        rank = (s(r["last_snapshot_at"]) or "", s(r["updated_at"]) or "", cid)
        if key not in best or rank > best[key][0]:
            best[key] = (rank, r, posted)
    rows, key_of = [], {}
    for key, (_, r, posted) in best.items():
        platform, url, bid = key
        for cid in members[key]:
            key_of[cid] = key
        c = cr.get(i(r["creator_id"]))
        who = handle(c["username"]) if c is not None else None
        followers = i(c["followers"]) if c is not None else None
        likes, comments, shares, saves = i(r["likes"]), i(r["comments_count"]), i(r["shares"]), i(r["saves"])
        views = max([v for v in (i(r["video_view_count"]), i(r["video_play_count"])) if v is not None], default=None)
        owned = who is not None and who in k.handles[bid]
        m = k.matchers[bid]
        relevant = owned or bool(tagged.get(i(r["id"]), set()) & k.handles[bid]) or bool(m and m.search(s(r["description"]) or ""))
        cid = i(r["id"])
        tag_list = tags.get(cid) or caption_hashtags(s(r["description"]))
        ct = CONTENT_TYPE.get((s(r["content_type"]) or "").lower())
        rows.append({
            "platform": platform, "platform_post_id": s(r["post_id"]) or s(r["shortcode"]), "creator_handle": who,
            "brand_id": bid, "source": "owned" if owned else "earned", "collection": "owned" if owned else "keyword",
            "posted_at": posted.isoformat(), "month": posted.astimezone(LOCAL_TZ).strftime("%Y-%m-01"), "url": url,
            "caption": s(r["description"]), "hashtags": tag_list or None, "is_paid": b(r["is_paid_partnership"]),
            "followers_at_post": followers, "tier": tier_for_followers(followers), "content_type": ct, "views": views,
            "likes": likes, "comments_count": comments, "shares": shares, "saves": saves,
            "engagements": engagements(platform, likes, comments, shares, saves, i(r["engagement_total"])),
            "engagements_lc": (likes or 0) + (comments or 0), "captured_days": snaps_per.get(cid),
            "relevant": relevant, "source_file": None, "_cid": cid,
        })
    return rows, key_of, seen, drops

def upsert_creators(db, k, rows, creators, dry):
    cr = {}
    for _, r in creators.iterrows():
        p = PLATFORM.get((s(r["platform"]) or "").lower()); h = handle(r["username"])
        if p and h:
            cr[(p, h)] = r
    used = {(r["platform"], r["creator_handle"]) for r in rows if r["creator_handle"]}
    out = []
    for p, h in sorted(used):
        r = cr.get((p, h))
        f = i(r["followers"]) if r is not None else None
        first = when(r["first_seen_at"]) if r is not None else None
        last = when(r["last_seen_at"]) if r is not None else None
        out.append({"platform": p, "handle": h, "display_name": s(r["display_name"]) if r is not None else None,
                    "followers_latest": f, "tier_latest": tier_for_followers(f),
                    "first_seen": first.date().isoformat() if first else None, "last_seen": last.date().isoformat() if last else None})
    if not dry:
        chunks(db, """
          insert into creators (workspace_id, platform, handle, display_name, followers_latest, tier_latest, first_seen, last_seen)
          select $2, platform, handle, display_name, followers_latest, tier_latest, first_seen, last_seen
          from jsonb_to_recordset($1::jsonb) as r(platform text, handle text, display_name text, followers_latest int,
               tier_latest text, first_seen date, last_seen date)
          on conflict (workspace_id, platform, handle) do update set
            display_name = coalesce(excluded.display_name, creators.display_name),
            followers_latest = coalesce(excluded.followers_latest, creators.followers_latest),
            tier_latest = coalesce(excluded.tier_latest, creators.tier_latest),
            first_seen = least(creators.first_seen, excluded.first_seen),
            last_seen = greatest(creators.last_seen, excluded.last_seen)
        """, out, [k.ws])
    return len(out)

# --------------------------------------------------------------- snapshots
SNAP_SQL = """
  insert into post_snapshots (post_id, day_n, captured_at, views, likes, comments_count, shares, saves)
  select p.id, r.day_n, r.captured_at, r.views, r.likes, r.comments_count, r.shares, r.saves
  from jsonb_to_recordset($1::jsonb) as r(platform text, url text, brand_id text, day_n smallint, captured_at timestamptz,
       views bigint, likes int, comments_count int, shares int, saves int)
  join posts p on p.workspace_id = $2 and p.platform = r.platform and p.url = r.url and p.brand_id = r.brand_id
  on conflict (post_id, day_n) do update set captured_at = excluded.captured_at, views = excluded.views, likes = excluded.likes,
    comments_count = excluded.comments_count, shares = excluded.shares, saves = excluded.saves
"""

def build_snapshots(snaps, kept_cids):
    """One row per kept post per day; the kept capture's own series (duplicates track the same post)."""
    out, drops = {}, 0
    for _, r in snaps.iterrows():
        cid = i(r["content_id"])
        key = kept_cids.get(cid)
        if key is None:
            drops += 1; continue
        day = i(r["day_index"])
        if day is None or not 0 <= day <= 30:
            drops += 1; continue
        views = max([v for v in (i(r["video_view_count"]), i(r["video_play_count"])) if v is not None], default=None)
        at = when(r["source_fetched_at"]) or when(r["snapshot_date"])
        k2 = (key, day)
        row = {"platform": key[0], "url": key[1], "brand_id": key[2], "day_n": day, "captured_at": at.isoformat() if at else None,
               "views": views, "likes": i(r["likes"]), "comments_count": i(r["comments_count"]), "shares": i(r["shares"]),
               "saves": i(r["saves"])}
        if k2 not in out or (row["captured_at"] or "") > (out[k2]["captured_at"] or ""):
            out[k2] = row
    return [v for v in out.values() if v["captured_at"]], drops

# ---------------------------------------------------------------- comments
COMMENT_SQL = """
  insert into comments (workspace_id, post_id, platform, platform_comment_id, author_handle, author_hash, text, posted_at, likes,
                        sentiment, sentiment_source, sentiment_confidence, sentiment_detail, csat, theme, purchase_intent,
                        translation, topic_id, classified_at)
  select $2, p.id, r.platform, r.platform_comment_id, r.author_handle, r.author_hash, r.text, r.posted_at, r.likes,
         r.sentiment, r.sentiment_source, r.confidence, r.sentiment_detail, r.csat, r.theme, r.purchase_intent,
         r.translation, r.topic_id, now()
  from jsonb_to_recordset($1::jsonb) as r(platform text, url text, brand_id text, platform_comment_id text, author_handle text,
       author_hash text, text text, posted_at timestamptz, likes int, sentiment text, sentiment_source text, confidence numeric,
       sentiment_detail text, csat smallint, theme text, purchase_intent boolean, translation text, topic_id text)
  join posts p on p.workspace_id = $2 and p.platform = r.platform and p.url = r.url and p.brand_id = r.brand_id
  on conflict (workspace_id, platform_comment_id) do update set
    post_id = excluded.post_id, platform = excluded.platform, author_handle = excluded.author_handle,
    author_hash = excluded.author_hash, text = excluded.text, posted_at = excluded.posted_at, likes = excluded.likes,
    sentiment = excluded.sentiment, sentiment_source = excluded.sentiment_source,
    sentiment_confidence = excluded.sentiment_confidence, sentiment_detail = excluded.sentiment_detail, csat = excluded.csat,
    theme = excluded.theme, purchase_intent = excluded.purchase_intent, translation = excluded.translation,
    topic_id = excluded.topic_id, classified_at = excluded.classified_at
"""

def build_comments(k, comments, labels, key_of, topic_ids):
    lab = {}
    for _, r in labels.iterrows():
        if b(r["is_latest"]):
            lab[i(r["comment_id"])] = r
    out, drops, unknown_detail = {}, {}, set()
    def drop(reason):
        drops[reason] = drops.get(reason, 0) + 1
    for _, r in comments.iterrows():
        key = key_of.get(i(r["content_id"]))
        if key is None:
            drop("post not loaded"); continue
        ext = s(r["external_comment_id"])
        if not ext:
            drop("no comment id"); continue
        platform, url, bid = key
        who = handle(r["commentor"])
        l = lab.get(i(r["id"]))
        detail = s(l["sentiment"]) if l is not None else None
        if detail is not None and detail not in k.sentiment:
            unknown_detail.add(detail)
        brand_reply = who is not None and who in k.handles[bid]
        posted = when(r["commented_at"])
        row = {"platform": platform, "url": url, "brand_id": bid, "platform_comment_id": ext, "author_handle": who,
               "author_hash": author_hash(platform, who), "text": s(r["comment_text"]),
               "posted_at": posted.isoformat() if posted else None, "likes": i(r["like_count"]),
               "sentiment": None if brand_reply else k.sentiment.get(detail),
               "sentiment_source": "subject" if brand_reply else ("listening" if l is not None else None),
               "confidence": float(l["csat_confidence"]) if l is not None and s(l["csat_confidence"]) else None,
               "sentiment_detail": detail, "csat": i(l["csat"]) if l is not None else None,
               "theme": s(l["theme"]) if l is not None else None,
               "purchase_intent": b(l["purchase_intent"]) if l is not None else None,
               "translation": s(l["translation"]) if l is not None else None,
               "topic_id": topic_ids.get(i(l["topic_id"])) if l is not None else None}
        prev = out.get(ext)
        if prev is None:
            out[ext] = row
        else:
            drop("same comment on another capture")
            # a comment under a post captured for two brands lands once; the client's row wins, then the first seen
            if prev["brand_id"] != k.client and bid == k.client:
                out[ext] = row
    if unknown_detail:
        raise SystemExit(f"sentiment labels missing from sentiment_map: {sorted(unknown_detail)}")
    return list(out.values()), drops

# -------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("contract"); ap.add_argument("dump")
    ap.add_argument("--dry-run", action="store_true"); ap.add_argument("--no-refresh", action="store_true")
    a = ap.parse_args()
    k = Contract(a.contract)
    db = NeonHttp()
    t0 = time.time()
    ensure_workspace(db, k, a.dry_run)

    content, f_content = read(a.dump, "_content_")
    brands, _ = read(a.dump, "brand")
    creators, f_creator = read(a.dump, "creator")
    tags_df, _ = read(a.dump, "content_hashtag")
    snaps, f_snap = read(a.dump, "content_metric_snapshot")
    comments, f_comment = read(a.dump, "_comment_")
    labels, _ = read(a.dump, "comment_sentiment")
    topics, _ = read(a.dump, "topic")
    tagged_df, _ = read(a.dump, "content_tagged_user")
    tagged = {}
    for _, r in tagged_df.iterrows():
        h = handle(r["username"])
        if h:
            tagged.setdefault(i(r["content_id"]), set()).add(h)
    content = content.merge(brands[["id", "name"]].rename(columns={"id": "brand_id", "name": "brand_name"}), on="brand_id", how="left")
    missing = sorted({(s(n) or "").lower() for n in brands["name"]} - set(k.by_handle))
    if missing:
        raise SystemExit(f"listening brands not grouped in the contract: {missing}")

    tags = {}
    for _, r in tags_df.iterrows():
        t = (s(r["hashtag"]) or "").lstrip("#").lower()
        if t:
            lst = tags.setdefault(i(r["content_id"]), [])
            if t not in lst:
                lst.append(t)
    snaps_per = snaps.groupby("content_id")["day_index"].nunique().to_dict()

    topic_ids, topic_rows = upsert_topics(db, k, topics, a.dry_run)
    rows, key_of, seen, post_drops = build_posts(k, content, creators, tags, snaps_per, tagged)
    n_brands = upsert_brands(db, k, seen, a.dry_run)

    load_id = ledger(db, k, f_content, "posts", len(content), a.dry_run)
    for r in rows:
        r["source_file"] = f_content
    n_creators = upsert_creators(db, k, rows, creators, a.dry_run)
    n_posts = len(rows) if a.dry_run else chunks(db, POST_SQL, [{x: v for x, v in r.items() if x != "_cid"} for r in rows], [k.ws, load_id])
    by = lambda f: dict(sorted(pd.Series([f(r) for r in rows]).value_counts().to_dict().items()))
    post_report = {
        "rows_in": len(content), "posts": len(rows), "upserted": n_posts, "duplicates_merged": len(content) - len(rows) - sum(d["count"] for d in post_drops.values()),
        "drops": post_drops, "creators": n_creators, "by_platform": by(lambda r: r["platform"]), "by_brand": by(lambda r: r["brand_id"]),
        "owned_by_brand": dict(sorted(pd.Series([r["brand_id"] for r in rows if r["source"] == "owned"]).value_counts().to_dict().items())),
        "by_month": by(lambda r: r["month"][:7]),
        "not_about_brand": dict(sorted(pd.Series([r["platform"] for r in rows if not r["relevant"]]).value_counts().to_dict().items())),
        "not_about_brand_by_brand": dict(sorted(pd.Series([r["brand_id"] for r in rows if not r["relevant"]]).value_counts().to_dict().items())), "posted_span": (min(r["posted_at"] for r in rows)[:10], max(r["posted_at"] for r in rows)[:10]),
        "views": int(sum(r["views"] or 0 for r in rows)), "brands": n_brands, "topics": [t["label"] for t in topic_rows],
    }
    close(db, load_id, len(rows), sum(d["count"] for d in post_drops.values()), post_report)

    kept = {r["_cid"]: (r["platform"], r["url"], r["brand_id"]) for r in rows}
    snap_rows, snap_drops = build_snapshots(snaps, kept)
    load_id = ledger(db, k, f_snap, "snapshots", len(snaps), a.dry_run)
    n_snaps = len(snap_rows) if a.dry_run else chunks(db, SNAP_SQL, snap_rows, [k.ws], size=2000)
    snap_report = {"rows_in": len(snaps), "snapshots": len(snap_rows), "upserted": n_snaps,
                   "not_on_kept_capture": snap_drops, "posts_with_snapshots": len({(r["platform"], r["url"], r["brand_id"]) for r in snap_rows}),
                   "max_day": max((r["day_n"] for r in snap_rows), default=None)}
    close(db, load_id, len(snap_rows), snap_drops, snap_report)

    com_rows, com_drops = build_comments(k, comments, labels, key_of, topic_ids)
    load_id = ledger(db, k, f_comment, "comments", len(comments), a.dry_run)
    n_com = len(com_rows) if a.dry_run else chunks(db, COMMENT_SQL, com_rows, [k.ws])
    sent = pd.Series([r["sentiment"] or "-" for r in com_rows if r["sentiment_source"] != "subject"]).value_counts().to_dict()
    com_report = {"rows_in": len(comments), "comments": len(com_rows), "upserted": n_com, "drops": com_drops,
                  "brand_replies": sum(1 for r in com_rows if r["sentiment_source"] == "subject"),
                  "without_label": sum(1 for r in com_rows if r["sentiment_source"] is None),
                  "sentiment": sent, "detail": pd.Series([r["sentiment_detail"] or "-" for r in com_rows]).value_counts().to_dict(),
                  "with_topic": sum(1 for r in com_rows if r["topic_id"]), "without_text": sum(1 for r in com_rows if not r["text"]),
                  "posts_with_comments": len({(r["platform"], r["url"], r["brand_id"]) for r in com_rows}),
                  "by_platform": pd.Series([r["platform"] for r in com_rows]).value_counts().to_dict()}
    close(db, load_id, len(com_rows), sum(com_drops.values()), com_report)

    print(f"\n=== LISTENING LOAD REPORT: {k.ws} {'(dry run)' if a.dry_run else ''} ===")
    for name, rep in (("posts", post_report), ("snapshots", snap_report), ("comments", com_report)):
        print(f"\n{name}:")
        for x, v in rep.items():
            print(f"  {x}: {v}")
    if not a.dry_run and not a.no_refresh:
        refresh_views(db)
    print(f"\n{time.time() - t0:.0f}s")

if __name__ == "__main__":
    main()
