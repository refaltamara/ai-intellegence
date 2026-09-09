/**
 * GET /api/runs/[id]/export?format=csv|xlsx[&c=conversation]
 * The full result with the pane's state applied, plus the About block (PRD-v2 §13.1).
 * Logged to `exports`; when the download comes from a thread, a hidden note tells the model.
 */
import { DEFAULT_WORKSPACE_ID } from "@/config/thresholds";
import { currentSession } from "@/auth/current";
import { addMessage, getConversation, getSkillRun, logExport } from "@/chat/persist";
import { buildExport, toCsv, toXlsx } from "@/export/run";
import { sql } from "@/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f-]{36}$/;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await currentSession();
  if (!session) return Response.json({ error: "unauthorised" }, { status: 401 });
  if (!UUID.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const run = await getSkillRun(id, DEFAULT_WORKSPACE_ID);
  if (!run) return Response.json({ error: "not found" }, { status: 404 });
  const [decision, brands, ws] = await Promise.all([
    sql.query("select d.name from messages m join conversations c on c.id = m.conversation_id join decisions d on d.id = c.decision_id where $1 = any(m.skill_run_ids) limit 1", [id]).then((r) => ((r as { name: string }[])[0]?.name ?? null)).catch(() => null),
    sql.query("select id, name from brands where workspace_id = $1", [DEFAULT_WORKSPACE_ID]).then((r) => Object.fromEntries((r as { id: string; name: string }[]).map((b) => [b.id, b.name]))).catch(() => ({})),
    sql.query("select tz from workspaces where id = $1", [DEFAULT_WORKSPACE_ID]).then((r) => (r as { tz: string }[])[0]?.tz ?? "Asia/Jakarta").catch(() => "Asia/Jakarta"),
  ]);
  const b = buildExport(run, { decisionName: decision, brandNames: brands, tz: ws });
  await logExport({ workspaceId: DEFAULT_WORKSPACE_ID, skillRunId: id, userId: session.uid, format, rows: b.rows_after }).catch(() => undefined);
  const c = url.searchParams.get("c");
  if (c && UUID.test(c)) {
    const conv = await getConversation(c, DEFAULT_WORKSPACE_ID, session.uid);
    if (conv) await addMessage({ conversationId: conv.id, role: "user", content: { text: `You exported ${b.rows_after} rows as ${format === "csv" ? "CSV" : "Excel"}`, hidden: true, note: "export" } }).catch(() => undefined);
  }
  const body = format === "csv" ? toCsv(b) : toXlsx(b);
  return new Response(body as BodyInit, {
    headers: {
      "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${b.filename}.${format}"`,
      "Cache-Control": "no-store",
    },
  });
}
