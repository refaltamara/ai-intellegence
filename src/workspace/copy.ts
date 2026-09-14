/** The words the Chats screen needs from the workspace, with the counts filled in. */
import { fillCopy } from "./config";
import { getWorkspace } from "./store";

export type AskCopy = { hero_title: string; hero_intro: string; suggested: string[]; label: string; kind: string };

const PLATFORM_NAMES: Record<string, string> = { tiktok: "TikTok", instagram: "Instagram", x: "X", threads: "Threads" };

export async function askCopy(workspaceId: string, stats: { brands: number; platforms: number; per_platform?: { platform: string }[] }): Promise<AskCopy> {
  const cfg = await getWorkspace(workspaceId).catch(() => null);
  if (!cfg) return { hero_title: "What's happening?", hero_intro: "", suggested: [], label: workspaceId, kind: "category" };
  const names = (stats.per_platform ?? []).map((p) => PLATFORM_NAMES[p.platform] ?? p.platform);
  const platforms = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0] ?? "TikTok and Instagram";
  const vars = { name: cfg.name, subject: cfg.name, category: cfg.category_label, brands: stats.brands, platforms };
  return { hero_title: cfg.hero_title, hero_intro: fillCopy(cfg.hero_intro, vars), suggested: cfg.suggested, label: cfg.category_label, kind: cfg.kind };
}
