"""Mirror of src/config/thresholds.ts for the Python loader. Keep in sync."""

# (tier, label, min_followers, max_followers or None). Followers 0/None -> tier None.
TIER_BANDS = [
    ("nano", "Nano", 1, 10_000),
    ("micro", "Micro", 10_001, 50_000),
    ("mid", "Mid-Tier", 50_001, 500_000),
    ("macro", "Macro", 500_001, 1_000_000),
    ("mega", "Mega & Celebrities", 1_000_001, None),
]

AFFILIATE_RULE = {"min_cart_posts": 1}

SOURCE_TZ = "Asia/Jakarta"   # assumed; see docs/DECISIONS.md "Open"
DEFAULT_WORKSPACE_ID = "beauty-id"
DEFAULT_WORKSPACE_NAME = "Indonesian beauty"

# Raw -> canonical broad category
CATEGORY_BROAD_MAP = {
    "makeup": "Makeup",
    "skincare": "Skincare",
    "both skincare & makeup": "Both Skincare & Makeup",
    "parfume": "Fragrance",
    "fragrance/perfume": "Fragrance",
    "perfume": "Fragrance",
    "fragrance": "Fragrance",
    "haircare": "Haircare",
    "scalp/haircare": "Haircare",
    "deo": "Deodorant",
    "deodorant": "Deodorant",
}

# Display-name suffixes stripped from brand slugs (DECISIONS "Brand identity")
BRAND_NAME_STRIP = ["official", "cosmetics", "cosmetic", "beauty", "indonesia", "id", "ind", "idn", "co"]


def tier_for_followers(followers):
    try:
        f = float(followers)
    except (TypeError, ValueError):
        return None
    if f != f or f <= 0:  # NaN or non-positive
        return None
    for tier, _label, lo, hi in TIER_BANDS:
        if f >= lo and (hi is None or f <= hi):
            return tier
    return None
