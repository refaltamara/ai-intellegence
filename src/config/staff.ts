/**
 * Fair's people in the CMS (DECISIONS, 4 Oct 2026). Refal and Rafli are the super
 * admins and the only ones who release a role version or pin a client to one. Audia,
 * Wega and Arneta own all three roles for now; Audia and Arneta may also change design.
 * Until accounts and memberships land (CMS plan, phase 2) a person is named by their
 * first name or the local part of their email.
 */
export const OWNERS = ["refal", "rafli"];
export const ROLE_OWNERS = ["audia", "wega", "arneta"];
export const DESIGNERS = ["audia", "arneta"];

/** "Refal", "refal@fair-indonesia.com" → "refal" */
export const staffKey = (who: string) => who.trim().toLowerCase().split("@")[0];

export const isOwner = (who: string) => OWNERS.includes(staffKey(who));
export const isRoleOwner = (who: string) => ROLE_OWNERS.includes(staffKey(who)) || isOwner(who);
export const canDesign = (who: string) => DESIGNERS.includes(staffKey(who)) || isOwner(who);
