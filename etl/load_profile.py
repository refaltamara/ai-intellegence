#!/usr/bin/env python3
"""Profile loader: one subject's contents and comments, five platforms -> Neon.

  python3 etl/load_profile.py etl/profiles/maudy-ayunda.json            # load everything the contract lists
  python3 etl/load_profile.py etl/profiles/maudy-ayunda.json --dry-run  # validate and print the report only
  add --no-refresh to skip the materialized views

A profile workspace (DECISIONS "Workspaces as subjects") is contents + comments +
sentiment about one subject. This loader reads Fair Listening's per-platform
exports (one contents file and one comments file per platform), keeps the rows
that are about the subject, and writes posts, creators and comments for the
workspace named in the contract. Sentiment is not computed here: comments land
with sentiment null and /api/cron/label fills them in.

What gets dropped, and reported per file:
  contents  - listed in drop_urls (captured wrong, e.g. a different singer)
            - link spam (spam_min_links or more links in the caption, spam_platforms only)
            - no subject keyword in the caption, on keyword_platforms only
              (Threads replies rarely repeat the name, so Threads is exempt)
  comments  - empty text, emoji or symbol only text
            - duplicate comment id inside the file
            - comments on a dropped post
The subject's own posts are never dropped and never labelled. The subject's own
replies are kept with sentiment_source 'subject' so the labeller skips them.

Comments whose post is not in the contents export get a stub post (url, handle
from the url, posted_at = first comment) so nothing is orphaned; the report
lists them.
"""
import argparse, hashlib, json, re, sys, time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import pandas as pd
from dateutil import parser as dtparse
from dateutil import tz as dttz

sys.path.insert(0, str(Path(__file__).parent))
from config import SOURCE_TZ, tier_for_followers
from neon_http import NeonHttp

ROOT = Path(__file__).resolve().parent.parent
CHUNK = 1000
PLATFORMS = ("youtube", "tiktok", "instagram", "threads", "x")
PLATFORM_ALIASES = {"youtube": "youtube", "tiktok": "tiktok", "instagram": "instagram", "threads": "threads",
                    "x": "x", "x/twitter": "x", "twitter": "x", "twitter/x": "x"}

def log(*a):
    print(*a, file=sys.stderr, flush=True)

# ----------------------------------------------------------------- scalars
def to_str(v):
    if v is None:
        return None
    s = str(v).strip()
    return s or None

NUM = re.compile(r"^-?\d[\d,\.]*$")

def to_int(v):
    """'174,000' -> 174000; '' / 'modmedia' -> None."""
    s = to_str(v)
    if s is None:
        return None
    s = s.replace(" ", "")
    if not NUM.match(s):
        return None
    try:
        return int(round(float(s.replace(",", ""))))
    except ValueError:
        return None

def first_int(*vals):
    for v in vals:
        n = to_int(v)
        if n is not None:
            return n
    return None

def norm_handle(h):
    s = to_str(h)
    if not s:
        return None
    return s.lstrip("@").strip().lower() or None

# -------------------------------------------------------------------- urls
INVISIBLE = "⁠﻿​‌‍\xa0"

def canon_url(raw, platform):
    """Identity form of a post url: scheme+host lowercased, www dropped, query and
    fragment dropped, comment suffix (/c/<id>) dropped, trailing slash dropped.
    YouTube keeps its video id (the query is the identity there)."""
    s = to_str(raw)
    if not s:
        return None
    s = s.strip(INVISIBLE + " ")
    i = s.lower().find("http")
    if i > 0:
        s = s[i:]
    if not re.match(r"^https?://", s, re.I):
        s = "https://" + s
    u = urlsplit(s)
    host = (u.hostname or "").lower()
    host = re.sub(r"^(www|m|mobile)\.", "", host)
    if host == "twitter.com":
        host = "x.com"
    if host == "threads.net":
        host = "threads.com"
    path = re.sub(r"/+$", "", u.path)
    if platform == "youtube":
        vid = None
        if host == "youtu.be":
            vid = path.strip("/").split("/")[0]
        else:
            vid = (parse_qs(u.query).get("v") or [None])[0]
            m = re.match(r"^/(?:shorts|embed|v)/([A-Za-z0-9_-]{6,})", path)
            if not vid and m:
                vid = m.group(1)
        return f"https://www.youtube.com/watch?v={vid}" if vid else f"https://{host}{path}"
    if platform == "instagram":
        path = re.sub(r"/c/\d+$", "", path)
    return f"https://{host}{path}"

def post_id_from_url(url, platform):
    if not url:
        return None
    if platform == "youtube":
        return (parse_qs(urlsplit(url).query).get("v") or [None])[0]
    m = {
        "tiktok": r"/video/(\d+)", "instagram": r"/(?:p|reel|reels|tv)/([A-Za-z0-9_-]+)",
        "threads": r"/post/([A-Za-z0-9_-]+)", "x": r"/status/(\d+)",
    }.get(platform)
    r = re.search(m, url) if m else None
    return r.group(1) if r else None

def handle_from_url(url):
    m = re.search(r"/@([A-Za-z0-9_.\-]+)", url or "")
    if m:
        return m.group(1).lower()
    m = re.match(r"^https://x\.com/([A-Za-z0-9_]+)/status/", url or "")
    return m.group(1).lower() if m else None

# ------------------------------------------------------------------- dates
LOCAL_TZ = dttz.gettz(SOURCE_TZ)
RELATIVE = re.compile(r"^(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago", re.I)
UNIT_SECONDS = {"second": 1, "minute": 60, "hour": 3600, "day": 86400, "week": 604800, "month": 2592000, "year": 31536000}

def parse_when(raw, anchor, naive_tz=None):
    """Returns (aware UTC datetime or None, how). Numeric >= 12 digits: epoch ms.
    'N units ago': anchor minus N units (YouTube exports relative times).
    Anything else: dateutil; naive values are read as naive_tz (default SOURCE_TZ local)."""
    s = to_str(raw)
    if not s:
        return None, "empty"
    s = re.sub(r"\(edited\)", "", s, flags=re.I).strip()
    if re.fullmatch(r"\d{12,}", s):
        return datetime.fromtimestamp(int(s) / 1000, tz=timezone.utc), "epoch_ms"
    if re.fullmatch(r"\d{9,11}", s):
        return datetime.fromtimestamp(int(s), tz=timezone.utc), "epoch_s"
    m = RELATIVE.match(s)
    if m:
        secs = int(m.group(1)) * UNIT_SECONDS[m.group(2).lower()]
        return (anchor - timedelta(seconds=secs)).astimezone(timezone.utc), "relative"
    try:
        d = dtparse.parse(s.replace(",", " "))
    except (ValueError, OverflowError):
        return None, "unparseable"
    if d.tzinfo is None:
        d = d.replace(tzinfo=naive_tz or LOCAL_TZ)
        return d.astimezone(timezone.utc), "naive_local" if (naive_tz or LOCAL_TZ) is LOCAL_TZ else f"naive_{naive_tz.tzname(d) or 'tz'}"
    return d.astimezone(timezone.utc), "aware"

def month_of(d_utc):
    return d_utc.astimezone(LOCAL_TZ).strftime("%Y-%m-01")

# -------------------------------------------------------------------- text
HASHTAG = re.compile(r"#([\w]+)", re.UNICODE)
WORDISH = re.compile(r"[^\W_]", re.UNICODE)   # a letter or a digit in any script
LINK = re.compile(r"https?://\S+")

def hashtags(caption):
    if not caption:
        return None
    seen, out = set(), []
    for h in HASHTAG.findall(caption):
        h = h.lower()
        if h not in seen:
            seen.add(h); out.append(h)
    return out or None

def has_words(text):
    return bool(text) and WORDISH.search(text) is not None

def author_hash(platform, handle):
    return hashlib.sha256(f"{platform}{handle or ''}".encode()).hexdigest()

# ---------------------------------------------------------------- contract
class Profile:
    def __init__(self, path):
        c = json.loads(Path(path).read_text())
        self.raw = c
        self.workspace = c["workspace"]
        self.brand_id = c["subject"]["brand_id"]
        self.name = c["subject"]["name"]
        self.owned = {p: {norm_handle(h) for h in hs} for p, hs in c["subject"].get("owned_handles", {}).items()}
        self.followers = c["subject"].get("followers", {})
        self.anchor = dtparse.parse(c["export_time"])
        if self.anchor.tzinfo is None:
            self.anchor = self.anchor.replace(tzinfo=LOCAL_TZ)
        self.naive_tz = {p: dttz.gettz(z) for p, z in c.get("naive_dates_tz", {}).items()}
        self.keyword_re = re.compile("|".join(c.get("keywords", [])), re.I) if c.get("keywords") else None
        self.keyword_platforms = set(c.get("keyword_platforms", []))
        self.spam_min_links = int(c.get("spam_min_links", 0) or 0)
        self.spam_platforms = set(c.get("spam_platforms", PLATFORMS))
        self.drop = {}
        for d in c.get("drop_urls", []):
            for p in PLATFORMS:
                self.drop[canon_url(d["url"], p)] = d.get("reason", "listed in drop_urls")
        self.files = c["files"]
        self.data_dir = ROOT / c.get("data_dir", "data/raw")
        self.root_url = c.get("root_url")

    def is_owned(self, platform, handle):
        return bool(handle) and norm_handle(handle) in self.owned.get(platform, set())

    def why_drop(self, platform, url, handle, caption):
        if url in self.drop:
            return self.drop[url]
        if self.is_owned(platform, handle):
            return None
        if self.spam_min_links and platform in self.spam_platforms and len(LINK.findall(caption or "")) >= self.spam_min_links:
            return f"link spam ({len(LINK.findall(caption))} links in the caption)"
        if platform in self.keyword_platforms and self.keyword_re:
            if not caption:
                return "no caption to match a subject keyword"
            if not self.keyword_re.search(caption):
                return "no subject keyword in the caption"
        return None

# ------------------------------------------------------------------ report
class Tally:
    def __init__(self):
        self.d = {}
    def add(self, reason, example):
        e = self.d.setdefault(reason, {"count": 0, "examples": []})
        e["count"] += 1
        if len(e["examples"]) < 8:
            e["examples"].append(example)
    def total(self):
        return sum(v["count"] for v in self.d.values())

def read_csv(path):
    df = pd.read_csv(path, dtype=str, keep_default_na=False, encoding="utf-8-sig")
    df.columns = [str(c).strip().lower() for c in df.columns]
    return df.loc[:, [c for c in df.columns if c and not c.startswith("unnamed")]]

def col(df, *names):
    for n in names:
        if n in df.columns:
            return df[n]
    return pd.Series([""] * len(df), index=df.index, dtype=str)

# ---------------------------------------------------------------- contents
def normalise_contents(df, platform, prof, source_file):
    """-> rows (post dicts), drops (Tally), dropped_urls (set)."""
    drops, rows, dropped = Tally(), [], set()
    urls = col(df, "url"); accounts = col(df, "account_name", "account", "author")
    dates = col(df, "date_posted", "date"); descs = col(df, "description", "caption", "text")
    ctypes = col(df, "content_type"); views = col(df, "views"); likes = col(df, "likes", "like")
    replies = col(df, "replies/comments", "replies", "comments", "reply"); reposts = col(df, "retweet/repost", "reposts")
    shares = col(df, "share", "shares"); followers = col(df, "followers")
    for i in range(len(df)):
        url = canon_url(urls.iloc[i], platform)
        if not url:
            drops.add("missing url", accounts.iloc[i]); continue
        handle = norm_handle(accounts.iloc[i]) or handle_from_url(url)
        caption = to_str(descs.iloc[i])
        when, how = parse_when(dates.iloc[i], prof.anchor, prof.naive_tz.get(platform))
        if when is None:
            drops.add(f"unparseable date_posted ({how})", f"{url} {dates.iloc[i]!r}"); continue
        why = prof.why_drop(platform, url, handle, caption)
        if why:
            drops.add(why, f"@{handle} {url}"); dropped.add(url); continue
        owned = prof.is_owned(platform, handle)
        f = to_int(followers.iloc[i])
        if (f is None or f <= 0) and owned:
            f = prof.followers.get(platform)
        if f is not None and f <= 0:
            f = None
        n_likes, n_comments = to_int(likes.iloc[i]), to_int(replies.iloc[i])
        n_shares = first_int(shares.iloc[i], reposts.iloc[i])
        n_reposts = to_int(reposts.iloc[i])
        eng = sum(x for x in (n_likes, n_comments, n_shares) if x is not None) if any(x is not None for x in (n_likes, n_comments, n_shares)) else None
        eng_lc = sum(x for x in (n_likes, n_comments) if x is not None) if any(x is not None for x in (n_likes, n_comments)) else None
        rows.append({
            "platform": platform, "platform_post_id": post_id_from_url(url, platform),
            "creator_handle": handle, "creator_key": None if owned else handle,
            "brand_id": prof.brand_id, "source": "owned" if owned else "earned",
            "collection": "owned" if owned else "keyword",
            "posted_at": when.isoformat(), "month": month_of(when), "url": url, "caption": caption,
            "hashtags": hashtags(caption), "followers_at_post": f, "tier": tier_for_followers(f),
            "content_type": (to_str(ctypes.iloc[i]) or "").lower() or None,
            "views": to_int(views.iloc[i]), "likes": n_likes, "comments_count": n_comments,
            "shares": n_shares if platform == "tiktok" else n_reposts,
            "engagements": eng, "engagements_lc": eng_lc, "source_file": source_file, "date_how": how,
        })
    return rows, drops, dropped

POST_COLS = ["platform_post_id", "creator_handle", "creator_key", "brand_id", "source", "collection", "posted_at", "month",
             "url", "caption", "hashtags", "followers_at_post", "tier", "content_type", "views", "likes", "comments_count",
             "shares", "engagements", "engagements_lc", "source_file"]
POST_TYPES = ("platform_post_id text, creator_handle text, creator_key text, brand_id text, source text, collection text, "
              "posted_at timestamptz, month date, url text, caption text, hashtags text[], followers_at_post int, tier text, "
              "content_type text, views bigint, likes int, comments_count int, shares int, engagements int, engagements_lc int, "
              "source_file text")
UPDATE_COLS = [c for c in POST_COLS if c != "creator_key"]

def upsert_sql(stub):
    on_conflict = ("do nothing" if stub else
                   "do update set load_id = excluded.load_id, creator_id = excluded.creator_id, " +
                   ", ".join(f"{c} = excluded.{c}" for c in UPDATE_COLS if c not in ("url", "brand_id")))
    return f"""
      insert into posts (workspace_id, platform, load_id, creator_id, {", ".join(UPDATE_COLS)})
      select $2, r.platform, $3::uuid, c.id, {", ".join("r." + c for c in UPDATE_COLS)}
      from jsonb_to_recordset($1::jsonb) as r(platform text, {POST_TYPES})
      left join creators c on c.workspace_id = $2 and c.platform = r.platform and c.handle = r.creator_key
      on conflict (workspace_id, platform, url, brand_id) {on_conflict}
    """

def upsert_creators(db, ws, platform, rows, dry):
    best = {}
    for r in rows:
        k = r["creator_key"]
        if not k:
            continue
        cur = best.get(k)
        if cur is None:
            best[k] = {"handle": k, "followers": r["followers_at_post"], "last": r["posted_at"], "first": r["posted_at"]}
        else:
            if r["posted_at"] > cur["last"]:
                cur["last"], cur["followers"] = r["posted_at"], r["followers_at_post"] or cur["followers"]
            cur["first"] = min(cur["first"], r["posted_at"])
    payload = [{"workspace_id": ws, "platform": platform, "handle": v["handle"], "followers_latest": v["followers"],
                "tier_latest": tier_for_followers(v["followers"]), "first_seen": v["first"][:10], "last_seen": v["last"][:10]}
               for v in best.values()]
    if dry or not payload:
        return len(payload)
    db.query("""
      insert into creators (workspace_id, platform, handle, followers_latest, tier_latest, first_seen, last_seen)
      select workspace_id, platform, handle, followers_latest, tier_latest, first_seen, last_seen
      from jsonb_to_recordset($1::jsonb) as r(workspace_id text, platform text, handle text,
           followers_latest int, tier_latest text, first_seen date, last_seen date)
      on conflict (workspace_id, platform, handle) do update set
        followers_latest = coalesce(excluded.followers_latest, creators.followers_latest),
        tier_latest = coalesce(excluded.tier_latest, creators.tier_latest),
        first_seen = least(creators.first_seen, excluded.first_seen),
        last_seen = greatest(creators.last_seen, excluded.last_seen)
    """, [json.dumps(payload)])
    return len(payload)

def upsert_posts(db, ws, load_id, rows, dry, stub=False):
    if dry or not rows:
        return len(rows)
    n = 0
    for i in range(0, len(rows), CHUNK):
        chunk = [{k: v for k, v in r.items() if k != "date_how"} for r in rows[i:i + CHUNK]]
        res = db.query(upsert_sql(stub), [json.dumps(chunk), ws, load_id])
        n += res.get("rowCount") or 0
    return n

def load_contents(db, ws, prof, platform, path, dry):
    t0 = time.time()
    log(f"\n== {path.name} ({platform} contents)")
    df = read_csv(path)
    rows, drops, dropped = normalise_contents(df, platform, prof, path.name)
    load_id = None
    if not dry:
        load_id = db.scalar("""insert into data_loads (workspace_id, file, platform, kind, rows_in)
                               values ($1, $2, $3, 'posts', $4) returning id""", [ws, path.name, platform, len(df)])
    n_creators = upsert_creators(db, ws, platform, rows, dry)
    n_posts = upsert_posts(db, ws, load_id, rows, dry)
    owned = sum(1 for r in rows if r["source"] == "owned")
    hows = {}
    for r in rows:
        hows[r["date_how"]] = hows.get(r["date_how"], 0) + 1
    span = (min(r["posted_at"] for r in rows)[:10], max(r["posted_at"] for r in rows)[:10]) if rows else None
    report = {"file": path.name, "platform": platform, "kind": "posts", "rows_in": len(df), "rows_loaded": len(rows),
              "rows_upserted": n_posts, "rows_dropped": drops.total(), "drops": drops.d, "owned_posts": owned,
              "creators_upserted": n_creators, "date_formats": hows, "posted_span": span,
              "tz_assumed_for_naive_dates": str(prof.raw.get("naive_dates_tz", {}).get(platform, SOURCE_TZ)), "duration_s": round(time.time() - t0, 1)}
    if not dry:
        db.query("""update data_loads set rows_loaded = $2, rows_rejected = $3, report = $4::jsonb, finished_at = now()
                    where id = $1""", [load_id, len(rows), drops.total(), json.dumps(report)])
    return report, {r["url"] for r in rows}, dropped

# ---------------------------------------------------------------- comments
def normalise_comments(df, platform, prof, known_urls, dropped_urls, source_file):
    """-> rows (comment dicts), drops (Tally), stubs (url -> stub post dict)."""
    drops, rows, stubs, seen_ids = Tally(), [], {}, set()
    urls = col(df, "post_url", "url"); ids = col(df, "comment_id", "id"); authors = col(df, "author", "account_name")
    texts = col(df, "comment_text", "text"); dates = col(df, "date", "date_posted"); views = col(df, "views")
    likes = col(df, "like", "likes"); replies = col(df, "reply", "replies"); sents = col(df, "sentiment")
    for i in range(len(df)):
        url = canon_url(urls.iloc[i], platform)
        if not url:
            drops.add("missing post url", to_str(texts.iloc[i]) or ""); continue
        text = to_str(texts.iloc[i])
        if not text:
            drops.add("empty text", url); continue
        if not has_words(text):
            drops.add("emoji or symbol only", text[:40]); continue
        if url in dropped_urls:
            drops.add("comment on a dropped post", f"{url} {text[:50]!r}"); continue
        handle = norm_handle(authors.iloc[i])
        when, how = parse_when(dates.iloc[i], prof.anchor, prof.naive_tz.get(platform))
        if when is None and to_str(dates.iloc[i]):
            drops.add(f"unparseable date ({how})", f"{url} {dates.iloc[i]!r}"); continue
        raw_id = to_str(ids.iloc[i])
        if raw_id and re.fullmatch(r"[\d.]+E\+\d+", raw_id, re.I):
            raw_id = None   # the spreadsheet rounded the id to scientific notation; fall back to the hash
        if raw_id:
            cid = f"{platform}:{raw_id}"
        else:
            digest = hashlib.sha1(f"{url}|{handle}|{dates.iloc[i]}|{text}".encode()).hexdigest()[:24]
            cid = f"{platform}:h:{digest}"
        if cid in seen_ids:
            drops.add("duplicate comment id in file", cid); continue
        seen_ids.add(cid)
        owned = prof.is_owned(platform, handle)
        sent = (to_str(sents.iloc[i]) or "").lower()
        sent = sent if sent in ("positive", "neutral", "negative") else None
        if url not in known_urls and url not in stubs:
            stubs[url] = {"platform": platform, "platform_post_id": post_id_from_url(url, platform),
                          "creator_handle": handle_from_url(url), "creator_key": handle_from_url(url),
                          "brand_id": prof.brand_id, "source": "earned", "collection": "keyword",
                          "posted_at": when.isoformat() if when else prof.anchor.astimezone(timezone.utc).isoformat(),
                          "month": month_of(when or prof.anchor), "url": url, "caption": None, "hashtags": None,
                          "followers_at_post": None, "tier": None, "content_type": "stub", "views": None, "likes": None,
                          "comments_count": None, "shares": None, "engagements": None, "engagements_lc": None,
                          "source_file": source_file, "date_how": "stub"}
        elif url in stubs and when and when.isoformat() < stubs[url]["posted_at"]:
            stubs[url]["posted_at"], stubs[url]["month"] = when.isoformat(), month_of(when)
        rows.append({
            "platform": platform, "url": url, "platform_comment_id": cid, "author_handle": handle,
            "author_hash": author_hash(platform, handle), "text": text,
            "posted_at": when.isoformat() if when else None, "likes": first_int(likes.iloc[i], replies.iloc[i]),
            "views": to_int(views.iloc[i]), "sentiment": None if owned else sent,
            "sentiment_source": "subject" if owned else ("listening" if sent else None), "date_how": how,
        })
    return rows, drops, stubs

COMMENT_SQL = """
  insert into comments (workspace_id, post_id, platform, platform_comment_id, author_handle, author_hash, text, posted_at,
                        likes, views, sentiment, sentiment_source)
  select $2, p.id, r.platform, r.platform_comment_id, r.author_handle, r.author_hash, r.text, r.posted_at, r.likes, r.views,
         r.sentiment, r.sentiment_source
  from jsonb_to_recordset($1::jsonb) as r(platform text, url text, platform_comment_id text, author_handle text,
       author_hash text, text text, posted_at timestamptz, likes int, views bigint, sentiment text, sentiment_source text)
  join posts p on p.workspace_id = $2 and p.platform = r.platform and p.url = r.url and p.brand_id = $3
  on conflict (workspace_id, platform_comment_id) do update set
    post_id = excluded.post_id, platform = excluded.platform, author_handle = excluded.author_handle,
    author_hash = excluded.author_hash, text = excluded.text, posted_at = excluded.posted_at, likes = excluded.likes,
    views = excluded.views,
    sentiment = case when comments.sentiment_source = 'model' and excluded.sentiment is null then comments.sentiment
                     else excluded.sentiment end,
    sentiment_source = case when comments.sentiment_source = 'model' and excluded.sentiment is null
                            then comments.sentiment_source else excluded.sentiment_source end
"""

def load_comments(db, ws, prof, platform, path, known_urls, dropped_urls, dry):
    t0 = time.time()
    log(f"\n== {path.name} ({platform} comments)")
    df = read_csv(path)
    rows, drops, stubs = normalise_comments(df, platform, prof, known_urls, dropped_urls, path.name)
    load_id = None
    if not dry:
        load_id = db.scalar("""insert into data_loads (workspace_id, file, platform, kind, rows_in)
                               values ($1, $2, $3, 'comments', $4) returning id""", [ws, path.name, platform, len(df)])
    stub_rows = list(stubs.values())
    if stub_rows:
        upsert_creators(db, ws, platform, stub_rows, dry)
        upsert_posts(db, ws, load_id, stub_rows, dry, stub=True)
    n = 0
    if not dry:
        for i in range(0, len(rows), CHUNK):
            chunk = [{k: v for k, v in r.items() if k != "date_how"} for r in rows[i:i + CHUNK]]
            res = db.query(COMMENT_SQL, [json.dumps(chunk), ws, prof.brand_id])
            n += res.get("rowCount") or 0
    per_post = {}
    for r in rows:
        per_post[r["url"]] = per_post.get(r["url"], 0) + 1
    hows = {}
    for r in rows:
        hows[r["date_how"]] = hows.get(r["date_how"], 0) + 1
    subject_replies = sum(1 for r in rows if r["sentiment_source"] == "subject")
    with_labels = sum(1 for r in rows if r["sentiment"])
    span = [x for x in (r["posted_at"] for r in rows) if x]
    report = {"file": path.name, "platform": platform, "kind": "comments", "rows_in": len(df), "rows_loaded": len(rows),
              "rows_upserted": n if not dry else len(rows), "rows_dropped": drops.total(), "drops": drops.d,
              "posts_with_comments": len(per_post), "stub_posts_created": sorted(stubs.keys()),
              "subject_replies": subject_replies, "labels_from_export": with_labels, "date_formats": hows,
              "posted_span": (min(span)[:19], max(span)[:19]) if span else None,
              "top_posts": sorted(per_post.items(), key=lambda kv: -kv[1])[:10], "duration_s": round(time.time() - t0, 1)}
    if not dry:
        db.query("""update data_loads set rows_loaded = $2, rows_rejected = $3, report = $4::jsonb, finished_at = now()
                    where id = $1""", [load_id, len(rows), drops.total(), json.dumps(report)])
    return report

# ------------------------------------------------------------------- setup
def ensure_subject(db, ws, prof, dry):
    row = db.rows("select id, kind from workspaces where id = $1", [ws])
    if not row:
        raise SystemExit(f"workspace '{ws}' does not exist; create it first: pnpm workspace add {ws} --kind profile ...")
    if row[0]["kind"] != "profile":
        raise SystemExit(f"workspace '{ws}' is kind '{row[0]['kind']}', not 'profile'")
    if dry:
        return
    owned = {p: sorted(h for h in prof.owned.get(p, set()) if h) for p in PLATFORMS}
    db.query("""
      insert into brands (id, workspace_id, name, is_client, tiktok_handle, instagram_handle, tracked_on, owned_handles, keywords)
      values ($1, $2, $3, true, $4, $5, 'both', $6::jsonb, $7::jsonb)
      on conflict (id) do update set name = excluded.name, is_client = true, tiktok_handle = excluded.tiktok_handle,
        instagram_handle = excluded.instagram_handle, owned_handles = excluded.owned_handles, keywords = excluded.keywords
    """, [prof.brand_id, ws, prof.name, (owned["tiktok"] or [None])[0], (owned["instagram"] or [None])[0],
          json.dumps(owned), json.dumps(prof.raw.get("keywords", []))])
    db.query("update workspaces set client_brand_id = $2 where id = $1", [ws, prof.brand_id])

def refresh_views(db):
    t0 = time.time()
    for stmt in (ROOT / "src" / "db" / "refresh.sql").read_text().split(";"):
        stmt = stmt.strip()
        if stmt:
            db.query(stmt)
    log(f"materialized views refreshed ({time.time() - t0:.0f}s)")

def print_report(reports):
    print("\n=== PROFILE LOAD REPORT ===")
    for r in reports:
        print(f"\n{r['file']} [{r['platform']} {r['kind']}]  in={r['rows_in']:,}  loaded={r['rows_loaded']:,}  "
              f"dropped={r['rows_dropped']:,}  {r['duration_s']}s  span={r['posted_span']}  dates={r['date_formats']}")
        if r["kind"] == "posts":
            print(f"  owned posts: {r['owned_posts']}, creators: {r['creators_upserted']}")
        else:
            print(f"  posts with comments: {r['posts_with_comments']}, stub posts: {len(r['stub_posts_created'])}, "
                  f"subject replies: {r['subject_replies']}, labels from export: {r['labels_from_export']}")
            for u, n in r["top_posts"][:5]:
                print(f"    {n:>5}  {u}")
        for reason, d in r["drops"].items():
            print(f"  DROP {d['count']:,} x {reason}")
            for e in d["examples"][:8]:
                print(f"       {e}")
        if r["kind"] == "comments" and r["stub_posts_created"]:
            for u in r["stub_posts_created"][:12]:
                print(f"  STUB {u}")

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("contract"); ap.add_argument("--dry-run", action="store_true"); ap.add_argument("--no-refresh", action="store_true")
    ap.add_argument("--only", help="comma-separated platforms")
    a = ap.parse_args()
    prof = Profile(a.contract)
    only = set(a.only.split(",")) if a.only else None
    db = NeonHttp()
    ws = prof.workspace
    ensure_subject(db, ws, prof, a.dry_run)
    known, dropped, reports = {}, {}, []
    for f in prof.files:
        p = f["platform"]
        if p not in PLATFORMS:
            raise SystemExit(f"unknown platform {p!r} in contract")
        if only and p not in only:
            continue
        path = prof.data_dir / f["file"]
        if f["kind"] == "contents":
            rep, urls, drop = load_contents(db, ws, prof, p, path, a.dry_run)
            known.setdefault(p, set()).update(urls); dropped.setdefault(p, set()).update(drop)
        else:
            if p not in known and not a.dry_run:
                known[p] = {r["url"] for r in db.rows("select url from posts where workspace_id = $1 and platform = $2", [ws, p])}
            rep = load_comments(db, ws, prof, p, path, known.get(p, set()), dropped.get(p, set()), a.dry_run)
        reports.append(rep)
    print_report(reports)
    if not a.dry_run and not a.no_refresh:
        refresh_views(db)
    if not a.dry_run:
        print("\nnext: comments carry sentiment null until /api/cron/label runs on Vercel")

if __name__ == "__main__":
    main()
