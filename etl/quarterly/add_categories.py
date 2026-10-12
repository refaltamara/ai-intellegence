#!/usr/bin/env python3
"""Product category and content format, added by hand to an exported clean file, onto a converted file for the loader.

Refal categorised the clean TikTok Q3 file (12 Oct) in Q2's words: `product_category` (lip, sunscreen, cushion...; blank
when the post names no product) and `format_content` (review, tutorial, product_showcase, grwm... or other). The loader
reads them as `category_new` and `content_format` (src/loader/adapters/beauty.ts), as it read Q2's.

Rows are matched on (url, brand); a converted row the categorised file lacks (a link set aside, so not in the clean file)
keeps its own values. Every categorised row must match one converted row, or nothing is written.
usage: python3 etl/quarterly/add_categories.py <converted.csv> <categorised.csv> <out.csv>"""
import sys
import pandas as pd

conv_path, cat_path, out = sys.argv[1:4]
conv = pd.read_csv(conv_path, dtype=str, keep_default_na=False)
cat = pd.read_csv(cat_path, dtype=str, keep_default_na=False)
if cat.duplicated(["url", "brand"]).any(): sys.exit("the categorised file repeats a (url, brand)")
key = lambda d: d.url + "\u0001" + d.brand
missing = ~key(cat).isin(set(key(conv)))
if missing.any(): sys.exit(f"{int(missing.sum())} categorised rows match no converted row, e.g. {cat[missing].url.iloc[0]}")
c = cat.set_index(key(cat))
k = key(conv)
for src, dst in (("product_category", "category_new"), ("format_content", "content_format")):
    if dst not in conv.columns: conv[dst] = ""
    got = k.map(c[src].str.strip().str.lower())
    conv[dst] = got.where(got.notna(), conv[dst]).fillna("")
conv.to_csv(out, index=False)
print(f"{len(conv)} rows; {int(k.isin(c.index).sum())} categorised;",
      "product:", int((conv.category_new != "").sum()), "format:", int((conv.content_format != "").sum()))
