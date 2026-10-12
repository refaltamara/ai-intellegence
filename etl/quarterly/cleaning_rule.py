#!/usr/bin/env python3
"""Q2's cleaning rule, as written in the Q2 README: a post whose caption names a different, unrelated beauty brand and
never the tracked brand itself does not count for that brand. Plus: a marketplace's own ad (posted by the marketplace's
account) whose caption never names the brand. Own posts (the brand's own accounts) are never set aside.
The links it lists are set aside, not deleted: posts.relevant = false, checked_by = 'rule:collision', with a label per link
(labeller rule:collision) and an audit row; Beauty loads never write `relevant`, so a reload keeps them aside.
usage: python3 etl/quarterly/cleaning_rule.py <converted.csv> <label> [<flagged.csv>]"""
import sys, re
import pandas as pd

# the names each TikTok brand goes by in captions (generous: a mention keeps the post)
OWN = {
    "amaterasun": ["amaterasun"], "avoskinbeauty": ["avoskin"], "azarinecosmetic": ["azarine"], "barenbliss_id": ["barenbliss"],
    "blpbeauty": ["blpbeauty", r"\bblp"], "cantikcitraid": ["cantikcitra", r"\bcitra"], "carasunid": ["carasun"],
    "crystallurebeauty": ["crystallure"], "dearmebeauty": ["dearme"], "eminacosmeticsid": ["emina"], "erhaskincare_id": [r"\berha"],
    "esqacosmeticsofficial": ["esqa"], "focallurebeauty": ["focallure"], "focalskinid": ["focalskin"],
    "forskinssake": ["forskinssake", "forskinsake"], "glad2glow_id": ["glad2glow", r"\bg2g"], "glamazingofficial": ["glamazing"],
    "gouteid": ["goute"], "gueleid": ["guele"], "imploracosmetics": ["implora"], "instaperfect_id": ["instaperfect"],
    "itsomgbeauty": [r"\bomg", "itsomg", "ohmyglam"], "jacquelle_official": ["jacquelle"], "judydollindonesia": ["judydoll"],
    "kahfeveryday": ["kahf"], "laboreskinexpert": ["labore"], "luxcrime_id": ["luxcrime"], "madamegiecosmetic": ["madamegie", "madamgie"],
    "makeoverid": ["makeover"], "mineralbotanica": ["mineralbotanica"], "mopbeauty": ["mopbeauty", r"\bmop\b"],
    "msglowbeauty": ["msglow"], "mustikaratuind_": ["mustikaratu"], "mykonos": ["mykonos"], "nivea_id": ["nivea"],
    "officialhanasui": ["hanasui"], "pinkflashbeauty": ["pinkflash"], "pixycosmeticsindonesia": ["pixy"], "pondsindonesia": ["ponds"],
    "pondsmen_id": ["ponds"], "rolloverreaction": ["rolloverreaction"], "rosealldayco": ["roseallday"], "skintific_official": ["skintific"],
    "somethincmakeup": ["somethinc"], "somethincofficial": ["somethinc"], "studiotropik": ["studiotropik"], "timephoriaid": ["timephoria"],
    "vaselineid": ["vaseline"], "velixirparfums": ["velixir"], "vivacosmetics": [r"\bviva"], "wardahofficial": ["wardah"],
    "whitelabid": ["whitelab"], "worldoftavi": ["worldoftavi", r"\btavi"], "youbeauty_id": ["youbeauty", r"\byou\s+beauty", r"\by\.o\.u\b"],
}
# names that mark another beauty brand: every tracked brand's specific names (no common words), the Instagram-only tracked
# brands, and the untracked beauty and personal care brands that show up in this panel's captions
OTHER_EXTRA = ["loreal", "larocheposay", "olay", "headandshoulders", "skin1004", "somebymi", "hmns", "lightplus", "makarizo",
               "facetology", "raecca", "theoriginote", "originote", "kimeskincare", "glowfx", "msglowformen", "niveamen",
               "pantene", "sunsilk", "garnier", "neutrogena", "scarlett", "rexona", "lifebuoy", "biore", "cetaphil", "hadalabo",
               "bioaqua", "emeron", "jiera", "elformula", "dazzleme", "eiembeauty", "barenbliss", "esqa", "madamgie"]
COMMON = {r"\bomg", r"\bmop\b", r"\bviva", r"\bcitra", "makeover", r"\byou\s+beauty", r"\by\.o\.u\b", r"\btavi", r"\berha", r"\bblp"}
MARKETPLACES = {"shopee indonesia", "shopee_id", "shopeeid", "tokopedia", "lazada id", "lazadaid", "blibli", "tiktok shop", "tiktokshop_id"}

def rx(terms):
    parts = []
    for t in terms:
        parts.append(t if "\\" in t or "(" in t or "[" in t else re.escape(t))
    return re.compile("|".join(parts)) if parts else None

def squash(s): return re.sub(r"[^a-z0-9]", "", s.lower())

own_rx = {b: rx(ts) for b, ts in OWN.items()}
other_terms = {t for ts in OWN.values() for t in ts if t not in COMMON} | set(OTHER_EXTRA)

def judge(brand, caption, creator, owned):
    low = caption.lower(); sq = squash(caption)
    if owned: return None
    own = own_rx.get(brand)
    mine = set(OWN.get(brand, []))
    names_own = bool(own and (own.search(low) or own.search(sq)))
    if names_own: return None
    if creator.strip().lower() in MARKETPLACES: return "marketplace ad"
    for t in sorted(other_terms - mine):
        if (t.startswith("\\") and re.search(t, low)) or (not t.startswith("\\") and t in sq):
            return "names " + t.replace("\\b", "")
    return None

if __name__ == "__main__":
    path, label = sys.argv[1], sys.argv[2]
    df = pd.read_csv(path, dtype=str, keep_default_na=False)
    seed = pd.read_csv("data/seed/brand_mapping_master.csv", dtype=str, keep_default_na=False)
    canon = {**{b: b for b in seed.brand}, **{h: b for h, b in zip(seed.tiktok_handle, seed.brand) if h}}
    df["b"] = df.brand.str.strip().map(canon)
    owned = df.get("is_owned_account", pd.Series(["0"] * len(df))).astype(str).isin(["1", "1.0", "True", "true"])
    df["why"] = [judge(b, c, u, o) for b, c, u, o in zip(df.b, df.description, df.creator_username, owned)]
    df["v"] = pd.to_numeric(df.views, errors="coerce").fillna(0)
    f = df[df.why.notna()]
    print(f"{label}: {len(f)} of {len(df)} links set aside ({len(f)/len(df):.1%}), {f.v.sum()/df.v.sum():.1%} of views")
    print("  by reason:", f.why.str.replace(r"^names .*", "names another brand", regex=True).value_counts().to_dict())
    if len(sys.argv) > 3:
        f[["url", "b", "creator_username", "v", "why", "description"]].sort_values("v", ascending=False).to_csv(sys.argv[3], index=False)
