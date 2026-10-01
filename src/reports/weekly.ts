/** The Weekly Reports page (DECISIONS, 2 Oct 2026): every weekly deck that can be read slide by slide, newest per client and week. */
import { sql } from "../db/client";
import { listReportFiles } from "./files";

export type WeeklyItem = {
  id: string;
  iso: string;
  label: string;
  from: string;
  to: string;
  client: string;
  deck: string;
  created_at: string;
  slides: { n: number; title: string }[];
  pdf: string | null;
  pptx: string | null;
};

export async function weeklyItems(workspaceId: string): Promise<WeeklyItem[]> {
  const rows = (await sql.query(
    `select id, created_at, blocks->'week' as week, blocks->>'client' as client, blocks->>'title' as deck,
            coalesce((select jsonb_agg(jsonb_build_object('n', s->'n', 'title', s->'title')) from jsonb_array_elements(blocks->'slides') s), '[]'::jsonb) as slides
     from reports where workspace_id = $1 and blocks->>'kind' = 'weekly' and jsonb_typeof(blocks->'slides') = 'array'
     order by created_at desc`,
    [workspaceId],
  )) as { id: string; created_at: string; week: { iso: string; label: string; from: string; to: string }; client: string; deck: string; slides: { n: number; title: string }[] }[];
  const seen = new Set<string>();
  const kept = rows.filter((r) => { const k = `${r.client}|${r.week.iso}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const files = await listReportFiles(kept.map((r) => r.id), workspaceId);
  return kept
    .map((r) => ({
      id: r.id, iso: r.week.iso, label: r.week.label, from: r.week.from, to: r.week.to, client: r.client, deck: r.deck, created_at: r.created_at, slides: r.slides,
      pdf: files.find((f) => f.report_id === r.id && f.format === "pdf")?.id ?? null,
      pptx: files.find((f) => f.report_id === r.id && f.format === "pptx")?.id ?? null,
    }))
    .sort((a, b) => a.client.localeCompare(b.client) || a.iso.localeCompare(b.iso));
}
