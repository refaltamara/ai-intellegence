#!/usr/bin/env python3
"""Exports from Fair's own database ("lmd": account_name, url, video_view_count, likes, num_comments, share_count, save_count,
user_posted, followers, date_posted, description, content_type, format_content, category; sometimes a platform column)
-> Fair's scraper export columns, one file per platform, so convert_tiktok.py / convert_instagram.py and the rules run as usual.

  python3 etl/quarterly/lmd_to_scraper.py <export.csv>[,<export.csv>...] <held.json> data/seed/brand_mapping_master.csv <brandcats.json> <tt.csv> <ig.csv>
  python3 etl/quarterly/convert_tiktok.py <tt.csv> <q2_roles.json> data/seed/brand_mapping_master.csv <out.csv> 2026-07-01 "2026-09-30 99"
  (then add category_new from <tt.csv>.products.csv by url and brand)

<held.json>: [{url}] the links the workspace already holds (Refal, 14 Oct: "remove the duplicate links"); they are left out.
<brandcats.json>: [{brand_id, platform, universe, cat}] each brand's usual universe and broad category, from the database.

Rules (Refal, 14 Oct 2026):
- date_posted is UTC (it matches each TikTok video id and Instagram shortcode to the second): written as Jakarta time
- several exports of the same brands: one row per (link, account), with the highest reading and followers of any (counts
  only grow) and the earliest time
- the account is mapped to its brand through the seed (id, TikTok or Instagram handle), plus mop.beauty, mykonosfragrances
  and hmns; an account that is not a Beauty brand (Alchemist) is left out
- only 1 July to 30 September (Jakarta), only links not held yet
- the export's own category (lip, perfume...) is the product category (category_new), in Q2's words; format_content is the
  content format; the broad category and universe are the brand's usual ones
"""
import sys, json
import pandas as pd

srcs, held_path, seed_path, cats_path, out_tt, out_ig = sys.argv[1].split(","), *sys.argv[2:7]
frames = [pd.read_csv(f, dtype=str, keep_default_na=False) for f in srcs]
D = pd.concat([f.drop(columns=[c for c in ("platform",) if c in f.columns]) for f in frames], ignore_index=True)
n0 = len(D)
for c in ("video_view_count", "likes", "num_comments", "share_count", "save_count", "followers"):
    v = pd.to_numeric(D[c], errors="coerce")
    D[c] = v.groupby([D.url, D.account_name]).transform("max").map(lambda x: "" if pd.isna(x) else str(int(x)))
D["date_posted"] = D.groupby(["url", "account_name"]).date_posted.transform("min")
D = D.sort_values("description", key=lambda s: s.str.len(), ascending=False).drop_duplicates(["url", "account_name"]).sort_index()

held = {r["url"] for r in json.load(open(held_path))}
seed = pd.read_csv(seed_path, dtype=str, keep_default_na=False)
canon = {**{b: b for b in seed.brand}, **{h: b for h, b in zip(seed.instagram_handle, seed.brand) if h},
         **{h: b for h, b in zip(seed.tiktok_handle, seed.brand) if h}, "mop.beauty": "mopbeauty", "mykonosfragrances": "mykonos", "hmns": "hmns.id"}
cats = {(r["brand_id"], r["platform"]): r for r in json.load(open(cats_path))}

D["platform"] = D.url.map(lambda u: "tiktok" if "tiktok.com" in u else "instagram" if "instagram.com" in u else "")
D["brand"] = D.account_name.str.strip().map(canon)
D["date_posted"] = (pd.to_datetime(D.date_posted) + pd.Timedelta(hours=7)).dt.strftime("%Y-%m-%d %H:%M:%S")
rep = {"rows": n0, "rows_after_merging": len(D), "not_a_panel_brand": D[D.brand.isna()].account_name.value_counts().to_dict()}
D = D[D.brand.notna()]
inq = (D.date_posted >= "2026-07-01") & (D.date_posted < "2026-10-01")
rep["outside_jul_sep"] = int((~inq).sum()); D = D[inq]
rep["already_held"] = int(D.url.isin(held).sum()); D = D[~D.url.isin(held)]

X = D.rename(columns={"account_name": "account_name_raw", "format_content": "content_format", "user_posted": "creator_username",
                      "followers": "followers_numeric", "video_view_count": "views", "num_comments": "comments", "category": "product_category"})
X["universe"] = [cats.get((b, p), {}).get("universe", "") for b, p in zip(X.brand, X.platform)]
X["category"] = [cats.get((b, p), {}).get("cat", "") for b, p in zip(X.brand, X.platform)]
X["content_type"] = X.content_type.str.lower()
cols = ["brand", "account_name_raw", "universe", "category", "content_format", "content_type", "creator_username", "followers_numeric",
        "date_posted", "url", "description", "views", "likes", "comments"]
for p, out in (("tiktok", out_tt), ("instagram", out_ig)):
    x = X[X.platform == p]
    x[cols].to_csv(out, index=False)
    x[["url", "brand", "product_category"]].to_csv(out + ".products.csv", index=False)
    rep[p] = {"rows": len(x), "links": int(x.url.nunique()), "brands": x.brand.value_counts().to_dict(), "months": x.date_posted.str[:7].value_counts().sort_index().to_dict()}
print(json.dumps(rep, indent=1))
