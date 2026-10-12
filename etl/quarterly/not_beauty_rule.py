#!/usr/bin/env python3
"""Posts that are not about beauty or personal care (Refal, 12 Oct: "take out anything that is not beauty", that is, posts
not attached to the panel's beauty brands, such as a Fruta Gummy unboxing filed under Goute).

A link is set aside only on evidence that its post is about something else:
- the caption never names its own brand and names no beauty or personal care word, and
- it names another topic (games, food, cars, gadgets, clothes, pets, home, fandom, sport, travel...), or it is written in
  another script or language (Vietnamese, Arabic, Thai, French, German, Italian, Spanish...).
A vague caption ("bentar lagi naik kelas", "#fyp #viral") is kept: a brand's skit often says nothing in its caption.
Own posts (the brand's own accounts) are never set aside. Same treatment as cleaning_rule.py: relevant = false, never deleted.
usage: python3 etl/quarterly/not_beauty_rule.py <converted.csv> <label> [<flagged.csv>] [--skip <already set aside.csv>]"""
import sys, re
import pandas as pd
sys.path.insert(0, "etl/quarterly")
from cleaning_rule import own_rx, squash  # noqa: E402

def alternation(terms): return "|".join(sorted({re.escape(t) for t in terms}, key=len, reverse=True))

# beauty and personal care, Indonesian and English: matched inside words and hashtags (#lipcreamomg names lipcream)
BEAUTY_LONG = """makeup skincare beauty kosmetik cosmetic kecantikan cantik glowing kusam jerawat acne bruntusan beruntusan
komedo blackhead flek kulit wajah facial cleanser cleansing micellar toner serum essence ampoule moisturizer moisturiser
pelembab pelembap sunscreen sunblock sunserum tabirsurya lipstick lipstik lipcream liptint lipgloss gloss lipbalm lipserum
lipstain lipmatte lipliner lipoil ombrelips bibir cushion foundation concealer bedak powder blush perona mascara maskara
eyeliner eyeshadow eyebrow primer settingspray fixingspray masker sheetmask lotion handbody bodylotion bodyserum bodywash
bodyscrub bodycare bodymist haircare hairserum hairoil hairtonic shampoo sampo conditioner rambut ketombe rontok pomade
grooming cukur jenggot kumis parfum perfume fragrance cologne wangi harum deodorant deodoran ketiak sabun mandi niacinamide
retinol retinal ceramide centella hyaluronic salicylic glycolic collagen kolagen vitaminc vitamine peeling exfoliat swatch undertone
skintone dewy matte transferproof smudgeproof tutorialmakeup makeuptutorial grwm skintint twowaycake loosepowder contour
highlighter bronzer nailpolish kutek eyelash bulumata softlens scalp mekap skinbarier skinbarrier barrier antiperspirant
antiperspiran hairdo hairstyle catok blowdry salon creambath smoothing keratin facewash cucimuka skinroutine glassskin
dupe fragrant""".split()
BEAUTY_SHORT = ["lip", "lips", "spf", "edp", "edt", "aha", "bha", "pha", "alis", "tint", "shade", "muka", "glow", "spa",
                "nail", "hair", "meap", "mukap", "kuku", "glam", "pori", "scent"]
BEAUTY_LONG_RX = re.compile(alternation(squash(t) for t in BEAUTY_LONG))
BEAUTY_SHORT_RX = re.compile(r"(?<![a-z])(?:" + alternation(BEAUTY_SHORT) + r")")

# other topics: evidence that the post is about something else
OTHER_LONG = """makanan kuliner resep recipe recette masak masakan jajan jajanan minuman kopi coffee cafe warteg seblak nyeblak
bakso ayam cookies cookie dessert snack cemilan sambal nasi dapur kitchen minyakbawang handphone smartphone samsung iphone
laptop gadget charger android xiaomi realme headset earphone mobil motor honda yamaha toyota giias filano vespa otomotif
gaming gamer mobilelegends jjmlbb freefire fortnite roblox minecraft pokemon palworld valorant geometrydash blockblast pubg
anime manga drakor movie nonton konser concert musik music outfit ootd baju dress celana kemeja kaos sepatu skirt kulot
setelan fashion gamis dekor decor roomdecor kasur mattress sofa pembersih kerak laundry deterjen kucing catlover anjing
fitness ironman tennis raket football sepakbola futsal badminton travel liburan staycation wisata trading crypto saham
investasi bracelet gelang kalung cincin aksesoris accessories kacamata eyewear crystals pondphuwin phuwin naravit
streamer jkt48 lomba vaksin sunat booktok bookworm tokobunga tanaman philodendron lego frutagummy gummy permen yogurt
eskrim icecream tokopedia samsung""".split()
OTHER_SHORT = ["hp", "ev", "gym", "game", "games", "ff", "mlbb", "film", "lagu", "song", "tas", "bag", "kue", "mie",
               "da7", "dog", "cat", "bike", "lari", "running", "sholat", "ngaji", "dzikir", "amalkan", "sejarah"]
OTHER_LONG_RX = re.compile(alternation(squash(t) for t in OTHER_LONG))
OTHER_SHORT_RX = re.compile(r"(?<![a-z])(?:" + alternation(OTHER_SHORT) + r")(?![a-z])")

# another script, or another language in Latin script
SCRIPT_RX = re.compile(r"[؀-ۿ฀-๿Ѐ-ӿ぀-ヿ一-鿿가-힯]|"
                       r"[ơưạảấầẩẫậắằẳẵặđếềểễệốồổỗộớờởỡợứừửữựịỉĩọỏụủũỳỷỹ]")
FOREIGN = {w: lang for lang, ws in {
    "fr": "et le la les des pour avec une est pas dans sur aujourd mais très".split(),
    "de": "und nicht ist ich auf mit geht das die der ein eine wir unser".split(),
    "it": "che il non per sono della forse chi questo anche".split(),
    "es": "que el los las por para con una pero muy".split(),
}.items() for w in ws}
INDONESIAN = set("yang aku ini itu ga gak nih banget aja sih kamu dan di ke kok deh dong ya yg udah lagi buat bisa".split())

def foreign(caption):
    if SCRIPT_RX.search(caption.lower()): return True
    words = re.findall(r"[a-zà-ÿ]+", re.sub(r"[#@]\S+", " ", caption.lower()))
    hits = {w for w in words if w in FOREIGN}
    return len(hits) >= 3 and not any(w in INDONESIAN for w in words)

def not_beauty(brand, caption, owned):
    if owned: return None
    low, sq = caption.lower(), squash(caption)
    own = own_rx.get(brand)
    if own and (own.search(low) or own.search(sq)): return None
    if BEAUTY_LONG_RX.search(sq) or BEAUTY_SHORT_RX.search(low): return None
    if foreign(caption): return "another language"
    if OTHER_LONG_RX.search(sq) or OTHER_SHORT_RX.search(low): return "another topic"
    return None  # vague: kept

if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    skip_path = sys.argv[sys.argv.index("--skip") + 1] if "--skip" in sys.argv else None
    if skip_path: args = [a for a in args if a != skip_path]
    path, label = args[0], args[1]
    df = pd.read_csv(path, dtype=str, keep_default_na=False)
    seed = pd.read_csv("data/seed/brand_mapping_master.csv", dtype=str, keep_default_na=False)
    canon = {**{h: b for h, b in zip(seed.instagram_handle, seed.brand) if h}, **{h: b for h, b in zip(seed.tiktok_handle, seed.brand) if h},
             **{b: b for b in seed.brand}}  # a file names a brand by its id or by its handle on either platform
    df["b"] = df.brand.str.strip().map(canon)
    if skip_path:
        done = pd.read_csv(skip_path, dtype=str, keep_default_na=False)
        df = df[~(df.url + "|" + df.b).isin(set(done.url + "|" + done.b))]
    flagged_own = df.get("is_owned_account", pd.Series(["0"] * len(df), index=df.index)).astype(str).isin(["1", "1.0", "True", "true"])
    # a post from the brand's own account (Instagram has no owned flag: the account is the brand's handle)
    handles = {(b, h.lower()) for b, h in zip(seed.brand, seed.instagram_handle) if h} | {(b, h.lower()) for b, h in zip(seed.brand, seed.tiktok_handle) if h}
    owned = flagged_own.values | pd.Series([(b, u.strip().lower()) in handles for b, u in zip(df.b, df.creator_username)]).values
    df["why"] = [not_beauty(b, c, o) for b, c, o in zip(df.b, df.description, owned)]
    df["v"] = pd.to_numeric(df.views, errors="coerce").fillna(0)
    f = df[df.why.notna()]
    print(f"{label}: {len(f)} of {len(df)} links not beauty ({len(f)/max(len(df),1):.1%}), {f.v.sum()/max(df.v.sum(),1):.1%} of views;",
          f.why.value_counts().to_dict())
    if len(args) > 2:
        f[["url", "b", "creator_username", "v", "why", "description"]].sort_values("v", ascending=False).to_csv(args[2], index=False)
