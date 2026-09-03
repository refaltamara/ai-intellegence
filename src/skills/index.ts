/** name → implementation. Skills missing here resolve to `unavailable`. */
import type { SkillImpl } from "./runner";
import { discovery } from "./discovery";
import { mercenaries } from "./mercenaries";
import { loyalists } from "./loyalists";
import { affiliates } from "./affiliates";
import { breakout } from "./breakout";
import { funnelMix } from "./funnel-mix";
import { overlap } from "./overlap";
import { waves } from "./waves";
import { topContent } from "./top-content";
import { compare } from "./compare";
import { launch } from "./launch";
import { brandStrategy } from "./brand-strategy";
import { hashtags } from "./hashtags";
import { campaigns } from "./campaigns";
import { themes } from "./themes";
import { products } from "./products";
import { hashtagOverlap } from "./hashtag-overlap";

export const impls: Record<string, SkillImpl> = {
  discovery,
  mercenaries,
  loyalists,
  affiliates,
  breakout,
  "funnel-mix": funnelMix,
  overlap,
  waves,
  "top-content": topContent,
  compare,
  launch,
  "brand-strategy": brandStrategy,
  hashtags,
  campaigns,
  themes,
  products,
  "hashtag-overlap": hashtagOverlap,
};
