/** The words the Chats screen needs from the workspace, with the counts filled in. */
import { fillCopy } from "./config";
import { fillRole, type RoleModel } from "../roles/model";
import { getWorkspace } from "./store";

export type AskCopy = { hero_title: string; hero_intro: string; suggested: string[]; label: string; kind: string };

const PLATFORM_NAMES: Record<string, string> = { tiktok: "TikTok", instagram: "Instagram", x: "X", threads: "Threads" };

export async function askCopy(workspaceId: string, stats: { brands: number; platforms: number; per_platform?: { platform: string }[] }, role?: RoleModel): Promise<AskCopy> {
  const cfg = await getWorkspace(workspaceId).catch(() => null);
  if (!cfg) return { hero_title: "What's happening?", hero_intro: "", suggested: [], label: workspaceId, kind: "category" };
  const names = (stats.per_platform ?? []).map((p) => PLATFORM_NAMES[p.platform] ?? p.platform);
  const platforms = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0] ?? "TikTok and Instagram";
  const vars = { name: cfg.name, subject: cfg.name, category: cfg.category_label, brands: stats.brands, platforms };
  // a role brings its own first screen (PR asks about reputation); a one-person profile keeps its own words
  if (role?.hero_title && cfg.kind !== "profile") {
    const client = cfg.client_name ?? "your brand";
    const fill = (t: string) => fillCopy(fillRole(t, client), vars);
    return { hero_title: fill(role.hero_title), hero_intro: fill(role.hero_intro ?? cfg.hero_intro), suggested: (role.suggested ?? cfg.suggested).map(fill), label: cfg.category_label, kind: cfg.kind };
  }
  return { hero_title: cfg.hero_title, hero_intro: fillCopy(cfg.hero_intro, vars), suggested: cfg.suggested, label: cfg.category_label, kind: cfg.kind };
}
