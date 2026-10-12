#!/usr/bin/env python3
"""Fair's scraper export for TikTok (Q3 2026 onwards; the same 14 columns as the Instagram export) -> the beauty loader's
TikTok contract.

  python3 etl/quarterly/convert_tiktok.py <export.csv> <q2_roles.json> data/seed/brand_mapping_master.csv <out.csv> [<from> <to>]
  python3 etl/quarterly/cleaning_rule.py <out.csv> "<label>" <flagged.csv>     (Q2's cleaning rule; see docs/DATA_NOTES.md)
  pnpm raw manifest && pnpm load run beauty-id beauty beauty-id/<out.csv>

<q2_roles.json>: the accounts Q2 knew as a brand's own or a reseller, from the database:
  select brand_id, lower(creator_handle) as handle, account_type, count(*) as n from posts where workspace_id = 'beauty-id'
   and platform = 'tiktok' and account_type in ('owned_main', 'owned_sub', 'reseller') group by 1, 2, 3

Rules (Refal, 12 Oct):
- only the posts dated <from>..<to> (default 2026-07-01..2026-08-31; the July-August file held 134 posts of 1 Sep,
  which come with the September file)
- a short link (vt./t.tiktok.com) that is a copy of a video already in the file under its full link (same creator, day,
  caption start, views, likes and comments) takes that full link; short links copying each other take the first of them;
  then a (link, brand) seen twice is kept once. A copy filed under another brand stays as that brand's link to the video.
- own accounts and resellers as Q2 knew them: a (brand, account) that was the brand's own in Q2 (owned_main/owned_sub)
  is own again, an account that was a reseller in Q2 is a reseller; every other account is an influencer (earned)
- the file has no shares or saves: left blank (unknown), so engagement = likes + comments
- the cart is is_tiktok_shop when the export carries it (sent 12 Oct), the way Q2's yc_flag was; without it the cart is unknown
- content_id = the video id from a full link; tier is worked out by the loader; everything else as received
"""
import sys, json
import pandas as pd

src, roles_path, seed_path, out = sys.argv[1:5]
day_from, day_to = (sys.argv[5], sys.argv[6]) if len(sys.argv) > 6 else ("2026-07-01", "2026-08-31")
df = pd.read_csv(src, dtype=str, keep_default_na=False)
n0 = len(df)
seed = pd.read_csv(seed_path, dtype=str, keep_default_na=False)
canon = {**{b: b for b in seed.brand}, **{h: b for h, b in zip(seed.tiktok_handle, seed.brand) if h}}

df = df[(df.date_posted >= day_from) & (df.date_posted <= day_to)].copy()
outside = n0 - len(df)

df["_brand"] = df.brand.str.strip().map(canon)
df["_h"] = df.creator_username.str.lower().str.strip()
df["_cap"] = df.description.str.strip().str[:60]
key = ["_h", "date_posted", "_cap", "views", "likes", "comments"]
short = df.url.str.contains(r"//(?:vt|t)\.tiktok\.com/")

# a short link copying a full one takes the full link
full_of = df[~short].drop_duplicates(key)[key + ["url"]].rename(columns={"url": "_full"})
df = df.merge(full_of, on=key, how="left")
short = df.url.str.contains(r"//(?:vt|t)\.tiktok\.com/")
to_full = short & df._full.notna()
df.loc[to_full, "url"] = df.loc[to_full, "_full"]
# short links copying each other (no full link in the file) take the first of them
left = short & ~to_full
first_short = df[left].groupby(key, sort=False).url.transform("first")
collapsed = int((df.loc[left, "url"] != first_short).sum())
df.loc[left, "url"] = first_short
before = len(df)
df = df.drop_duplicates(["url", "_brand"], keep="first")
dropped_copies = before - len(df)

# own accounts and resellers as Q2 knew them
roles = pd.DataFrame(json.load(open(roles_path)))
own_type = {}
for b, h, t in zip(roles.brand_id, roles.handle, roles.account_type):
    if t in ("owned_main", "owned_sub") and own_type.get((b, h)) != "owned_main":
        own_type[(b, h)] = t  # an account Q2 saw as both is the brand's main one
resellers = set(roles[roles.account_type == "reseller"].handle)
pairs = list(zip(df._brand, df._h))
acct = [own_type.get(p) or ("reseller" if p[1] in resellers else "influencer") for p in pairs]
df["account_type"] = acct
df["is_owned_account"] = [1 if a.startswith("owned") else 0 for a in acct]

df["content_id"] = df.url.str.extract(r"/video/(\d+)")[0].fillna("")
for c in ("shares", "saves", "tier"):
    df[c] = ""
# the cart: is_tiktok_shop when the export has it (12 Oct), true when any copy of the video says so; else unknown
if "is_tiktok_shop" in df.columns:
    shop = df.is_tiktok_shop.str.strip().str.lower().isin(["true", "1", "yes"])
    shop = shop.groupby(df.url).transform("max")
    df["yc_status_raw"] = "1"
    df["yc_flag"] = shop.astype(int).astype(str)
else:
    df["yc_status_raw"] = ""
    df["yc_flag"] = ""
lc = pd.to_numeric(df.likes, errors="coerce").fillna(0) + pd.to_numeric(df.comments, errors="coerce").fillna(0)
df["engagement_platform_native"] = lc.astype("int64")
df["engagement_likes_comments_only"] = df.engagement_platform_native

cols = ["brand", "account_name_raw", "universe", "category", "content_format", "content_type", "tier", "followers_numeric",
        "creator_username", "account_type", "is_owned_account", "date_posted", "views", "likes", "comments", "shares", "saves",
        "engagement_platform_native", "engagement_likes_comments_only", "yc_status_raw", "yc_flag", "description", "url", "content_id"]
df[cols].to_csv(out, index=False)
print(json.dumps({
    "rows_received": n0, "outside_the_dates": outside, "short_links_to_their_full_link": int(to_full.sum()),
    "short_links_onto_an_earlier_short_link": collapsed, "copies_dropped": dropped_copies, "rows_out": len(df),
    "videos": int(df.url.nunique()), "short_links_left": int(df.url.str.contains(r"//(?:vt|t)\.tiktok\.com/").sum()),
    "accounts": pd.Series(acct).value_counts().to_dict(), "brands": int(df._brand.nunique()),
    "months": df.date_posted.str[:7].value_counts().sort_index().to_dict(),
}, indent=1))
