/**
 * Hashtags that carry no topic: platform reach tags, generic "viral" tags and
 * bare category words. Excluded from hashtag leaderboards, campaign detection
 * and brand overlap by default (exclude_generic=true); never excluded from evidence.
 * Hashtags are stored lowercase without '#'.
 */
export const GENERIC_HASHTAGS: readonly string[] = [
  // reach / algorithm
  "fyp", "fypシ", "fypシ゚viral", "fypage", "fyppppppppppppppppppppppp", "foryou", "foryoupage", "fy", "fyp️", "xyzbca", "xyzabc",
  "viral", "viralvideo", "viraltiktok", "trending", "trend", "explore", "explorepage", "reels", "reel", "reelsinstagram",
  "instagram", "tiktok", "tiktokindonesia", "instagood", "photooftheday", "video", "capcut", "masukberanda", "berandatiktok",
  // bare category words (kept as themes, not as hashtags)
  "makeup", "skincare", "beauty", "kecantikan", "makeuptutorial", "skincareroutine", "makeuplook", "beautytips", "skincaretips",
  "racuntiktok", "racunshopee", "tiktokshop", "shopee", "tokopedia",
];

export const GENERIC_HASHTAG_SET = new Set(GENERIC_HASHTAGS);
