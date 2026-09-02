#!/usr/bin/env python3
"""Fair Intel loader: Refal's cleaned exports -> Neon Postgres.

  python3 etl/load.py --all                       # brands + the three raw files + refresh views
  python3 etl/load.py --brands                    # brand mapping only
  python3 etl/load.py --file data/raw/tiktok_q2_2026.csv.gz --platform tiktok
  python3 etl/load.py --refresh                   # refresh materialized views only
  add --dry-run to validate and print the report without writing

The loader does not guess: rows with an unknown brand slug, no url, or an
unparseable date are rejected and reported. Tiers are recomputed from
followers (etl/config.py mirrors src/config/thresholds.ts). Timestamps are
read as SOURCE_TZ local time and stored in UTC.

Talks to Neon over its HTTPS SQL endpoint (etl/neon_http.py) so it works from
sandboxes that block port 5432.
"""
import argparse, calendar, json, os, re, sys, time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from config import (BRAND_NAME_STRIP, CATEGORY_BROAD_MAP, DEFAULT_WORKSPACE_ID,
                    DEFAULT_WORKSPACE_NAME, SOURCE_TZ, tier_for_followers)
from neon_http import NeonHttp

ROOT = Path(__file__).resolve().parent.parent
SEED = ROOT / "data" / "seed" / "brand_mapping_master.csv"
RAW = ROOT / "data" / "raw"
CONTRACTS = Path(__file__).parent / "contracts"
DEFAULT_FILES = [("tiktok_q2_2026.csv.gz", "tiktok"), ("instagram_q2_2026.csv.gz", "instagram"),
                 ("instagram_q1_2026.csv.gz", "instagram")]
CHUNK = 2000

def log(*a):
    print(*a, file=sys.stderr, flush=True)

# ----------------------------------------------------------------- helpers
def nn(v):
    """NaN/NaT/None -> None, numpy scalars -> python."""
    if v is None:
        return None
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    if hasattr(v, "item"):
        return v.item()
    return v

def to_int(v):
    v = nn(v)
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if f != f or f in (float("inf"), float("-inf")):
        return None
    return int(round(f))

def to_num(v):
    v = nn(v)
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if f != f or f in (float("inf"), float("-inf")):
        return None
    return f

def to_str(v):
    v = nn(v)
    if v is None:
        return None
    s = str(v).strip()
    return s or None

def display_name(slug):
    s = slug.lower().strip().strip("._")
    changed = True
    while changed:
        changed = False
        s = s.rstrip("._")
        for suf in BRAND_NAME_STRIP:
            if s.endswith(suf) and len(s) > len(suf) + 2:
                s = s[: -len(suf)].rstrip("._")
                changed = True
                break
    return re.sub(r"[._]+", " ", s).strip().title() or slug

HASHTAG = re.compile(r"#([\w]+)", re.UNICODE)
IG_SHORTCODE = re.compile(r"instagram\.com/(?:[^/]+/)?(?:p|reel|reels|tv)/([A-Za-z0-9_-]+)")

def hashtags(caption):
    if not caption:
        return None
    seen, out = set(), []
    for h in HASHTAG.findall(caption):
        h = h.lower()
        if h not in seen:
            seen.add(h); out.append(h)
    return out or None

def month_days(month_str):
    y, m = int(month_str[:4]), int(month_str[5:7])
    return calendar.monthrange(y, m)[1]

# --------------------------------------------------------------- contracts
def check_contract(df, name):
    c = json.loads((CONTRACTS / f"{name}.json").read_text())
    missing = [col for col in c["required"] if col not in df.columns]
    if missing:
        raise SystemExit(f"contract {name}: missing required columns {missing}")
    extra = [col for col in df.columns if col not in c["required"] + c["optional"]]
    return extra

# ------------------------------------------------------------------ brands
def read_seed():
    seed = pd.read_csv(SEED, dtype=str, keep_default_na=False)
    check_contract(seed, "brands")
    seed["brand"] = seed["brand"].str.strip()
    return seed

def brand_maps(seed):
    """raw slug -> canonical id, per platform. TikTok raw = brand id or tiktok_handle;
    Instagram raw = instagram_handle (or the id itself)."""
    tt, ig = {}, {}
    for r in seed.itertuples(index=False):
        tt[r.brand] = r.brand; ig[r.brand] = r.brand
        if r.tiktok_handle:
            tt[r.tiktok_handle] = r.brand
        if r.instagram_handle:
            ig[r.instagram_handle] = r.brand
    return {"tiktok": tt, "instagram": ig}

def load_brands(db, ws, seed, dry):
    rows = []
    for r in seed.itertuples(index=False):
        tracked = r.tracked_on.strip().lower()
        tracked = {"both": "both", "instagram only": "instagram", "tiktok only": "tiktok"}.get(tracked, tracked)
        name = (getattr(r, "display_name", "") or "").strip() or display_name(r.brand)
        rows.append({
            "id": r.brand, "workspace_id": ws, "name": name,
            "tiktok_handle": r.tiktok_handle or None, "instagram_handle": r.instagram_handle or None,
            "tracked_on": tracked,
            "owned_handles": {"tiktok": [r.tiktok_handle] if r.tiktok_handle else [],
                              "instagram": [r.instagram_handle] if r.instagram_handle else [], "threads": [], "x": []},
            "notes": r.notes or None,
        })
    log(f"brands: {len(rows)} rows in seed")
    if dry:
        return len(rows)
    db.query("""
      insert into brands (id, workspace_id, name, tiktok_handle, instagram_handle, tracked_on, owned_handles, notes)
      select id, workspace_id, name, tiktok_handle, instagram_handle, tracked_on, owned_handles, notes
      from jsonb_to_recordset($1::jsonb) as r(id text, workspace_id text, name text, tiktok_handle text,
           instagram_handle text, tracked_on text, owned_handles jsonb, notes text)
      on conflict (id) do update set
        name = excluded.name, tiktok_handle = excluded.tiktok_handle, instagram_handle = excluded.instagram_handle,
        tracked_on = excluded.tracked_on, owned_handles = excluded.owned_handles, notes = excluded.notes
    """, [json.dumps(rows)])
    return len(rows)

# ------------------------------------------------------------------- posts
def normalise(df, platform, bmap, source_file):
    """Return (rows, rejects, extras). rows are dicts ready for jsonb_to_recordset."""
    rejects = {}
    def reject(reason, example):
        d = rejects.setdefault(reason, {"count": 0, "examples": []})
        d["count"] += 1
        if len(d["examples"]) < 5:
            d["examples"].append(example)

    dt = pd.to_datetime(df["date_posted"], format="mixed", errors="coerce")
    dt_local = dt.dt.tz_localize(SOURCE_TZ, ambiguous="NaT", nonexistent="shift_forward")
    dt_utc = dt_local.dt.tz_convert("UTC")
    month_local = dt_local.dt.strftime("%Y-%m-01")
    day_local = dt_local.dt.strftime("%Y-%m-%d")

    is_tt = platform == "tiktok"
    unknown_cats = {}
    rows = []
    for i, r in enumerate(df.itertuples(index=False)):
        url = to_str(r.url)
        if not url:
            reject("missing url", str(r.brand)); continue
        if pd.isna(dt_utc.iloc[i]):
            reject("unparseable date_posted", f"{url} {r.date_posted!r}"); continue
        raw_brand = to_str(r.brand)
        brand_id = bmap.get(raw_brand)
        if not brand_id:
            reject(f"unknown brand slug '{raw_brand}'", url); continue

        followers = to_int(r.followers_numeric)
        if followers is not None and followers <= 0:
            followers = None
        handle = to_str(r.creator_username)
        if is_tt:
            owned = to_int(r.is_owned_account) == 1
            account_type = to_str(r.account_type)
            ycs = to_num(r.yc_status_raw)
            has_cart = None if ycs is None else bool(to_int(r.yc_flag))
            ppid = to_str(r.content_id) if "content_id" in df.columns else None
            shares, saves = to_int(r.shares), to_int(r.saves)
        else:
            owned, account_type, has_cart, shares, saves = False, None, None, None, None
            m = IG_SHORTCODE.search(url)
            ppid = m.group(1) if m else None
        cat_raw = to_str(getattr(r, "category", None))
        cat = None
        if cat_raw:
            cat = CATEGORY_BROAD_MAP.get(cat_raw.lower())
            if cat is None:
                cat = cat_raw
                unknown_cats[cat_raw] = unknown_cats.get(cat_raw, 0) + 1
        caption = to_str(r.description)
        views = to_int(r.views)
        rows.append({
            "platform": platform,
            "platform_post_id": ppid,
            "creator_handle": handle,
            "creator_key": None if (owned or not handle) else handle,   # resolved to creator_id in SQL
            "brand_id": brand_id,
            "source": "owned" if owned else "earned",
            "collection": "owned" if owned else ("keyword" if is_tt else "tagged"),
            "account_type": account_type,
            "posted_at": dt_utc.iloc[i].isoformat(),
            "month": month_local.iloc[i],
            "local_day": day_local.iloc[i],   # report only; ignored by jsonb_to_recordset
            "url": url,
            "caption": caption,
            "hashtags": hashtags(caption),
            "has_cart": has_cart,
            "is_reseller": account_type == "reseller",
            "followers_at_post": followers,
            "tier": tier_for_followers(followers),
            "universe": to_str(getattr(r, "universe", None)),
            "category_broad": cat,
            "product_category": (to_str(getattr(r, "category_new", None)) or "").lower() or None,
            "content_format": (to_str(getattr(r, "content_format", None)) or "").lower() or None,
            "content_type": (to_str(r.content_type) or "").lower() or None,
            "product_name": to_str(getattr(r, "product_name", None)) if is_tt else None,
            "product_url": to_str(getattr(r, "product_url", None)) if is_tt else None,
            "price": to_num(getattr(r, "price", None)) if is_tt else None,
            "price_original": to_num(getattr(r, "price_original", None)) if is_tt else None,
            "discount_percent": to_num(getattr(r, "discount_percent", None)) if is_tt else None,
            "views": views,
            "likes": to_int(r.likes),
            "comments_count": to_int(r.comments),
            "shares": shares,
            "saves": saves,
            "engagements": to_int(r.engagement_platform_native),
            "engagements_lc": to_int(r.engagement_likes_comments_only),
            "source_file": source_file,
        })
    return rows, rejects, unknown_cats

def upsert_creators(db, ws, platform, rows, dry):
    """One creator per (platform, handle) among earned posts; followers from the latest post."""
    best = {}
    for r in rows:
        k = r["creator_key"]
        if not k:
            continue
        cur = best.get(k)
        if cur is None or r["posted_at"] > cur["last"]:
            best[k] = {"handle": k, "followers": r["followers_at_post"], "last": r["posted_at"],
                       "first": r["posted_at"] if cur is None else min(cur["first"], r["posted_at"])}
        else:
            cur["first"] = min(cur["first"], r["posted_at"])
    payload = [{"workspace_id": ws, "platform": platform, "handle": v["handle"],
                "followers_latest": v["followers"], "tier_latest": tier_for_followers(v["followers"]),
                "first_seen": v["first"][:10], "last_seen": v["last"][:10]} for v in best.values()]
    log(f"  creators: {len(payload)} distinct handles")
    if dry:
        return len(payload)
    for i in range(0, len(payload), 5000):
        db.query("""
          insert into creators (workspace_id, platform, handle, followers_latest, tier_latest, first_seen, last_seen)
          select workspace_id, platform, handle, followers_latest, tier_latest, first_seen, last_seen
          from jsonb_to_recordset($1::jsonb) as r(workspace_id text, platform text, handle text,
               followers_latest int, tier_latest text, first_seen date, last_seen date)
          on conflict (workspace_id, platform, handle) do update set
            followers_latest = case when excluded.last_seen >= coalesce(creators.last_seen, '1900-01-01')
                                    then excluded.followers_latest else creators.followers_latest end,
            tier_latest = case when excluded.last_seen >= coalesce(creators.last_seen, '1900-01-01')
                               then excluded.tier_latest else creators.tier_latest end,
            first_seen = least(creators.first_seen, excluded.first_seen),
            last_seen = greatest(creators.last_seen, excluded.last_seen)
        """, [json.dumps(payload[i:i + 5000])])
    return len(payload)

POST_COLS = ["platform_post_id", "creator_handle", "creator_key", "brand_id", "source", "collection", "account_type",
             "posted_at", "month", "url", "caption", "hashtags", "has_cart", "is_reseller", "followers_at_post", "tier",
             "universe", "category_broad", "product_category", "content_format", "content_type", "product_name",
             "product_url", "price", "price_original", "discount_percent", "views", "likes", "comments_count", "shares",
             "saves", "engagements", "engagements_lc", "source_file"]
POST_TYPES = ("platform_post_id text, creator_handle text, creator_key text, brand_id text, source text, collection text, "
              "account_type text, posted_at timestamptz, month date, url text, caption text, hashtags text[], has_cart boolean, "
              "is_reseller boolean, followers_at_post int, tier text, universe text, category_broad text, product_category text, "
              "content_format text, content_type text, product_name text, product_url text, price numeric, price_original numeric, "
              "discount_percent numeric, views bigint, likes int, comments_count int, shares int, saves int, engagements int, "
              "engagements_lc int, source_file text")
UPDATE_COLS = [c for c in POST_COLS if c not in ("creator_key",)]

UPSERT_SQL = f"""
  insert into posts (workspace_id, platform, load_id, creator_id, {", ".join(UPDATE_COLS)})
  select $2, r.platform, $3::uuid, c.id, {", ".join("r." + c for c in UPDATE_COLS)}
  from jsonb_to_recordset($1::jsonb) as r(platform text, {POST_TYPES})
  left join creators c on c.workspace_id = $2 and c.platform = r.platform and c.handle = r.creator_key
  on conflict (workspace_id, platform, url, brand_id) do update set
    load_id = excluded.load_id, creator_id = excluded.creator_id,
    {", ".join(f"{c} = excluded.{c}" for c in UPDATE_COLS if c not in ("url", "brand_id"))}
"""

def upsert_posts(db, ws, load_id, rows, dry):
    if dry:
        return len(rows)
    n = 0
    t0 = time.time()
    for i in range(0, len(rows), CHUNK):
        chunk = rows[i:i + CHUNK]
        res = db.query(UPSERT_SQL, [json.dumps(chunk), ws, load_id])
        n += res.get("rowCount") or 0
        if (i // CHUNK) % 5 == 0:
            log(f"  posts: {min(i + CHUNK, len(rows))}/{len(rows)} ({time.time() - t0:.0f}s)")
    return n

def coverage(rows):
    """Per month: posts, distinct days captured / days in month."""
    days = {}
    for r in rows:
        m = r["month"]; d = days.setdefault(m, {"posts": 0, "days": set()})
        d["posts"] += 1; d["days"].add(r["local_day"])
    out = {}
    for m, d in sorted(days.items()):
        out[m] = {"posts": d["posts"], "days_captured": len(d["days"]), "days_in_month": month_days(m),
                  "coverage_pct": round(len(d["days"]) / month_days(m) * 100, 1)}
    return out

def load_file(db, ws, path, platform, bmap, dry):
    path = Path(path)
    t0 = time.time()
    log(f"\n== {path.name} ({platform})")
    df = pd.read_csv(path, compression="gzip" if path.suffix == ".gz" else None, low_memory=False)
    extras = check_contract(df, f"posts_{platform}")
    log(f"  rows in: {len(df):,}; extra columns ignored: {extras or 'none'}")
    rows, rejects, unknown_cats = normalise(df, platform, bmap, path.name)
    load_id = None
    if not dry:
        load_id = db.scalar("""insert into data_loads (workspace_id, file, platform, kind, rows_in)
                               values ($1, $2, $3, 'posts', $4) returning id""", [ws, path.name, platform, len(df)])
    n_creators = upsert_creators(db, ws, platform, rows, dry)
    n_posts = upsert_posts(db, ws, load_id, rows, dry)
    cov = coverage(rows)
    n_rej = sum(v["count"] for v in rejects.values())
    report = {
        "file": path.name, "platform": platform, "rows_in": len(df), "rows_upserted": n_posts,
        "rows_rejected": n_rej, "rejects": rejects, "creators_upserted": n_creators,
        "months": cov, "unknown_categories_kept_as_is": unknown_cats, "extra_columns_ignored": extras,
        "source_tz_assumed": SOURCE_TZ, "duration_s": round(time.time() - t0, 1),
    }
    if not dry:
        db.query("""update data_loads set rows_loaded = $2, rows_rejected = $3, report = $4::jsonb, finished_at = now()
                    where id = $1""", [load_id, n_posts, n_rej, json.dumps(report)])
    return report

def refresh_views(db):
    t0 = time.time()
    for stmt in (ROOT / "src" / "db" / "refresh.sql").read_text().split(";"):
        stmt = stmt.strip()
        if stmt:
            db.query(stmt)
    log(f"materialized views refreshed ({time.time() - t0:.0f}s)")

def print_report(reports):
    print("\n=== LOAD REPORT ===")
    for r in reports:
        print(f"\n{r['file']} [{r['platform']}]  in={r['rows_in']:,}  upserted={r['rows_upserted']:,}  "
              f"rejected={r['rows_rejected']:,}  creators={r['creators_upserted']:,}  {r['duration_s']}s")
        for m, c in r["months"].items():
            print(f"  {m[:7]}: {c['posts']:>7,} posts  {c['days_captured']:>2}/{c['days_in_month']} days captured ({c['coverage_pct']}%)")
        for reason, d in r["rejects"].items():
            print(f"  REJECT {d['count']:,} x {reason}; e.g. {d['examples'][:2]}")
        if r["unknown_categories_kept_as_is"]:
            print(f"  category values not in map (kept as-is): {r['unknown_categories_kept_as_is']}")
    print(f"\nsource timestamps read as {SOURCE_TZ} local, stored UTC")

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--all", action="store_true"); ap.add_argument("--brands", action="store_true")
    ap.add_argument("--file"); ap.add_argument("--platform", choices=["tiktok", "instagram"])
    ap.add_argument("--refresh", action="store_true"); ap.add_argument("--no-refresh", action="store_true")
    ap.add_argument("--workspace", default=DEFAULT_WORKSPACE_ID); ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    if not (a.all or a.brands or a.file or a.refresh):
        ap.error("nothing to do: use --all, --brands, --file, or --refresh")
    if a.file and not a.platform:
        ap.error("--platform is required with --file")

    db = NeonHttp()
    ws = a.workspace
    if not a.dry_run:
        db.query("""insert into workspaces (id, name, category) values ($1, $2, 'beauty')
                    on conflict (id) do nothing""", [ws, DEFAULT_WORKSPACE_NAME])
    seed = read_seed()
    bmap = brand_maps(seed)
    reports = []
    if a.all or a.brands:
        load_brands(db, ws, seed, a.dry_run)
    files = DEFAULT_FILES if a.all else ([(a.file, a.platform)] if a.file else [])
    for f, platform in files:
        p = Path(f) if Path(f).exists() else RAW / f
        reports.append(load_file(db, ws, p, platform, bmap[platform], a.dry_run))
    if reports:
        print_report(reports)
    if not a.dry_run and (a.refresh or (files and not a.no_refresh)):
        refresh_views(db)

if __name__ == "__main__":
    main()
