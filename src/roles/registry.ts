/**
 * What a role may name (CMS plan, Compatibility): the ids that live in code. A role
 * version, a company's changes and later the Role Lab can only pick from these; the
 * resolver drops an id the running code does not know, so a role never asks for a
 * screen that does not exist. Pure, so client components may import it.
 */
import { DECK_TEMPLATES } from "../decks/templates";
import { SLIDE_KINDS } from "../competitor/slides";
import { REP_SLIDE_KINDS } from "../reputation/slides";
import { SOCIAL_SLIDE_KINDS } from "../social/slides";
import type { NavKey, RoleId } from "./model";

export const NAV_KEYS: NavKey[] = ["dashboard", "weekly", "decks", "pulse", "chats", "reports"];

/** the layers of skills.registry.json; a role's skill_order ranks them */
export const SKILL_LAYERS = ["audience", "brands", "comments", "conversation", "creators", "posts"] as const;

export const DECK_TEMPLATE_KEYS: string[] = DECK_TEMPLATES.map((t) => t.key);

/** deck templates a role may offer: the ones built for it */
export const templateKeysFor = (role: RoleId): string[] => DECK_TEMPLATES.filter((t) => t.roles.includes(role)).map((t) => t.key);

export const SLIDES_BY_FAMILY = {
  competitor: SLIDE_KINDS as string[],
  reputation: REP_SLIDE_KINDS as string[],
  social: SOCIAL_SLIDE_KINDS as string[],
};

