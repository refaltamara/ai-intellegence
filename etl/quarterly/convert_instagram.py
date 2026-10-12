#!/usr/bin/env python3
"""Fair's scraper export for Instagram (Q3 2026 onwards) -> the beauty loader's contract.

  python3 etl/quarterly/convert_instagram.py <export.csv> <out.csv> [--after <an earlier converted file>] [--followers <known.json>]
  python3 etl/load.py --file <out.csv> --platform instagram

Loading again upserts on (platform, url, brand), so a corrected export simply replaces the rows.
- TikTok links in the file are left out (they belong to the TikTok batch)
- content_type: blank -> reel when it has views, carousel when not (Refal, 6 Oct); photo -> image
- followers 0 -> unknown; 'Hair Care' -> Haircare
- a post tagging several brands carries one set of numbers on every brand row: the highest
  views, likes and comments seen for it (counts only grow, so the highest is the latest
  capture), the highest followers, the earliest date
- --after: a later export of posts an earlier file already brought keeps the same rule across the two files (Refal's
  last Q3 file, 12 Oct, read 1,309 posts lower than the file loaded that morning): the highest views, likes, comments
  and followers of either, the earliest date. Both files arrive the same day, so they give the same reading.
- --followers: a post the export gives no followers takes the same Instagram account's count from its post nearest in
  time (Refal, 12 Oct: "check in our history whether we have it; if we have it, use the same"), from this file or from
  what the workspace already holds; a tie goes to the later post. known.json is that history, one row per account and day:
    select lower(creator_handle) as handle, to_char(posted_at at time zone 'Asia/Jakarta', 'YYYY-MM-DD') as date,
           max(followers_at_post) as followers from posts where workspace_id = 'beauty-id' and platform = 'instagram'
       and brought_in_by = 'panel' and followers_at_post > 0 and creator_handle is not null group by 1, 2
  An account with no Instagram count anywhere stays without one (a TikTok account of the same name is not used).
- engagement = likes + comments (as in Q2); tier is recomputed by the loader"""
import sys, pandas as pd
args = [a for a in sys.argv[1:]]
after = known = None
if "--after" in args:
    i = args.index("--after"); after = args[i + 1]; del args[i:i + 2]
if "--followers" in args:
    i = args.index("--followers"); known = args[i + 1]; del args[i:i + 2]
src, out = args[0], args[1]
df = pd.read_csv(src, dtype=str, keep_default_na=False)
df = df[df.url.str.startswith("https://www.instagram.com/")].copy()
num = lambda c: pd.to_numeric(df[c], errors="coerce")
for c in ("views", "likes", "comments", "followers_numeric"): df[c] = num(c)
df.loc[df.followers_numeric == 0, "followers_numeric"] = float("nan")
g = df.groupby("url")
for c in ("views", "likes", "comments", "followers_numeric"): df[c] = g[c].transform("max")
df["date_posted"] = g["date_posted"].transform("min")
if after:
    e = pd.read_csv(after, dtype=str, keep_default_na=False)
    for c in ("views", "likes", "comments", "followers_numeric"):
        before = pd.to_numeric(e[c], errors="coerce").groupby(e.url).max()
        df[c] = pd.concat([df[c], df.url.map(before)], axis=1).max(axis=1)
    first = e[e.date_posted != ""].groupby("url").date_posted.min()
    was = df.url.map(first)
    df["date_posted"] = df.date_posted.where(was.isna() | (df.date_posted <= was), was)
if known:
    import json
    hist = pd.DataFrame(json.load(open(known)), columns=["handle", "date", "followers"])
    own = pd.DataFrame({"handle": df.creator_username.str.strip().str.lower(), "date": df.date_posted, "followers": df.followers_numeric})
    hist = pd.concat([hist, own[own.followers > 0]]).dropna()
    hist = hist.assign(d=pd.to_datetime(hist.date), followers=pd.to_numeric(hist.followers)).sort_values(["d", "followers"])
    hist = hist.drop_duplicates(["handle", "d"], keep="last")[["handle", "d", "followers"]]
    gap = df[df.followers_numeric.isna()].assign(handle=lambda x: x.creator_username.str.strip().str.lower(), d=lambda x: pd.to_datetime(x.date_posted))
    # nearest in time, the later post on a tie: look back and forward, keep the closer
    gap = gap.reset_index().sort_values("d")
    back = pd.merge_asof(gap, hist.rename(columns={"followers": "fb", "d": "db"}), left_on="d", right_on="db", by="handle", direction="backward")
    fwd = pd.merge_asof(gap, hist.rename(columns={"followers": "ff", "d": "df"}), left_on="d", right_on="df", by="handle", direction="forward")
    near = back.set_index("index")[["d", "db", "fb"]].join(fwd.set_index("index")[["df", "ff"]])
    use_f = near.ff.notna() & (near.fb.isna() | ((near["df"] - near.d) <= (near.d - near.db)))
    filled = near.ff.where(use_f, near.fb)
    df.loc[filled.index, "followers_numeric"] = filled
    print(f"followers filled from the account's nearest post: {int(filled.notna().sum())} of {len(gap)} rows without them")
t = df.content_type.str.lower().replace({"photo": "image"})
t[(t == "") & (df.views > 0)] = "reel"
t[t == ""] = "carousel"
df["content_type"] = t
df["category"] = df.category.replace({"Hair Care": "Haircare"})
df["engagement_platform_native"] = df.likes.fillna(0) + df.comments.fillna(0)
df["engagement_likes_comments_only"] = df.engagement_platform_native
df["tier"] = ""
for c in ("views", "likes", "comments", "followers_numeric", "engagement_platform_native", "engagement_likes_comments_only"):
    df[c] = df[c].astype("Int64")
df.to_csv(out, index=False)
print(len(df), "rows;", df.content_type.value_counts().to_dict())
