import { currentWorkspaceId } from "@/auth/current";
import { deleteReport, getReport } from "@/reports/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const ws = await currentWorkspaceId();
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  const report = await getReport(id, ws);
  if (!report) return Response.json({ error: "not found" }, { status: 404 });
  const format = new URL(_req.url).searchParams.get("format");
  if (format === "md") return new Response(report.body_md ?? "", { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
  return Response.json(report);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const ws = await currentWorkspaceId();
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  const ok = await deleteReport(id, ws);
  return Response.json({ ok }, { status: ok ? 200 : 404 });
}
