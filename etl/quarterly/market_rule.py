#!/usr/bin/env python3
"""Which posts are from outside the Indonesian market (Refal, 12 Oct: "take out the non Indonesian, e.g. Vaseline VN").
Diagnosis only: it reads posts (JSON rows of url, b, creator, caption, views, source) and says, per post, one of:
- "other script": the caption is written in Vietnamese, Thai, Arabic, Chinese, Korean, Japanese, Cyrillic, Sinhala, Tamil...
- "other language": Spanish/Portuguese, Tagalog, Malaysian Malay, French, German or Italian words, and no Indonesian ones
- "country tag": a hashtag or the account names another country or a brand's account for one (#VaselineVN,
  #VaselineProDermaPH, #shopeeMY, @vaselinevietnam, @vaseline_sl)
- "English only": English words and no Indonesian ones; often an Indonesian creator writing in English, so it is counted
  apart and never set aside on this alone
- None: Indonesian, or nothing to say otherwise
usage: python3 etl/quarterly/market_rule.py <posts.json> <label> [<flagged.csv>]"""
import sys, re, json
import pandas as pd

SCRIPT = re.compile(r"[؀-ۿ฀-๿Ѐ-ӿ぀-ヿ一-鿿가-힯඀-෿஀-௿ऀ-ॿ]|"
                    r"[ơưạảấầẩẫậắằẳẵặđếềểễệốồổỗộớờởỡợứừửữựịỉĩọỏụủũỳỷỹ]")
LANGS = {
    "Spanish/Portuguese": "que el los las por para con una pero muy del como más mi es tu você não uma com muito isso esta este".split(),
    "Tagalog": "mga talaga naman yung kasi sobrang ganda ang ng ako ko mo po din rin nyo lang".split(),
    "Malaysian Malay": "korang berbaloi awak percuma akak kat je dah lepas mcm sbb tau".split(),
    "French": "et le la les des pour avec une est pas dans sur mais très".split(),
    "German": "und nicht ist ich auf mit das die der ein eine wir".split(),
    "Italian": "che il non per sono della questo anche".split(),
}
STRONG = {"Malaysian Malay": {"korang", "berbaloi", "awak", "percuma"}, "Tagalog": {"mga", "talaga", "yung", "sobrang"}}
INDONESIAN = set("""yang aku ini itu ga gak nggak nih banget aja sih kamu dan di ke kok deh dong ya yg udah lagi buat bisa juga kalian
sama pake pakai beli mau sudah untuk dengan karena jadi kulit wajah cantik bikin gue gua lu lo kak bun nya bgt jg krn tp tapi
cobain wajib emang beneran banyak hari kali punya ada""".split())
# words Indonesians use and Malaysians do not: one of these and the caption is Indonesian whatever else it carries
INDONESIAN_ONLY = set("gak nggak ngga ga banget bgt aja sih dong deh gue gua kalian udah udh emang beneran kok nih loh".split())
ENGLISH = set("the and my with you this for is it to of in your our on that skin new so all get just".split())
COUNTRY = re.compile(r"(?:^|[^a-z])(?:vn|vietnam|xuhuong|ph|philippines|pinoy|shopeeph|my|malaysia|shopeemy|tiktokmalaysia|fypmalaysia|"
                     r"tiktokshopmy|th|thailand|thai|sg|singapore|lk|srilanka|sl|india|usa|uk|mexico|brasil|brazil)(?:$|[^a-z])")

def tags_and_handle(caption, creator):
    tags = [t.lower() for t in re.findall(r"#(\w+)", caption)]
    return tags, (creator or "").lower()

def market(caption, creator, source=""):
    c = caption.lower()
    plain = re.sub(r"[#@]\S+", " ", c)
    if any(w in INDONESIAN_ONLY for w in re.findall(r"[a-z]+", plain)): return None
    handle = (creator or "").lower()
    regional = re.search(r"(?:vietnam|[_.]vn|philippines|[_.]ph|malaysia|[_.]my|thailand|[_.]th|srilanka|[_.]sl|singapore|[_.]sg)$", handle)
    # a brand's own account counts only when it is the brand's account for another country (@wardahbeauty_my)
    if source == "owned": return "country tag" if regional else None
    # three or more letters of another script (one or two are decoration, as the シ in #fypシ)
    # three or more letters of another script (one or two are decoration, as the シ in #fypシ; mentions aside, as @클라라);
    # an Indonesian caption quoting a little Korean or Arabic stays Indonesian
    n_script = len(SCRIPT.findall(re.sub(r"[シ゚ツッ・ー]|@\S+", "", c)))
    n_latin = len(re.findall(r"[a-z]", plain))
    n_indo = sum(w in INDONESIAN for w in re.findall(r"[a-z]+", plain))
    if n_script >= 3 and (n_indo < 3 or n_script >= 0.2 * n_latin): return "other script"
    words = re.findall(r"[a-zà-ÿ]+", re.sub(r"[#@]\S+", " ", c))
    indo = sum(w in INDONESIAN for w in words)
    if indo == 0:
        for lang, ws in LANGS.items():
            hits = {w for w in words if w in ws}
            if len(hits) >= 3 or (lang in STRONG and hits & STRONG[lang]): return "other language: " + lang
    tags, _ = tags_and_handle(caption, creator)
    # a country at the end of a brand hashtag or account (#VaselineVN, vaselinevietnam, vaseline_sl), or a country hashtag;
    # a post that also carries an Indonesian tag (#vaselineid, #wardahindonesia) is not taken for another country's
    indonesian_tag = any(re.search(r"(?:id|indonesia|indo)$", t) for t in tags)
    for t in ([] if indonesian_tag else tags):
        if re.search(r"(?:vn|vietnam|dermaph|philippines|malaysia|shopeemy|thailand|srilanka|singapore)$", t) or t in {"xuhuong", "pinoy", "fypmalaysia", "tiktokmalaysia", "shopeeph", "tiktokshopmy", "fyp_philippines"}:
            return "country tag"
    if regional: return "country tag"
    if indo == 0 and sum(w in ENGLISH for w in words) >= 2: return "English only"
    return None

if __name__ == "__main__":
    path, label = sys.argv[1], sys.argv[2]
    df = pd.DataFrame(json.load(open(path)))
    df["views"] = pd.to_numeric(df.views).fillna(0)
    df["creator"] = df.creator.fillna("").astype(str); df["caption"] = df.caption.fillna("").astype(str)
    df["why"] = [market(c, u, src) for c, u, src in zip(df.caption, df.creator, df.get("source", pd.Series([""] * len(df))).fillna(""))]
    total = df.views.sum()
    print(f"{label}: {len(df)} links, {total/1e9:.2f}B views")
    for k, g in df[df.why.notna()].groupby(df.why.str.split(":").str[0]):
        print(f"  {k:15} {len(g):6} links ({len(g)/len(df):.1%})  {g.views.sum()/1e6:8.1f}M views ({g.views.sum()/total:.1%})")
    if len(sys.argv) > 3:
        df[df.why.notna()].sort_values("views", ascending=False).to_csv(sys.argv[3], index=False)
