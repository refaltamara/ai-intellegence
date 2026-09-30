/** GET: download a report's file (the weekly deck as .pptx or .pdf), from the caller's workspace only. */
import { currentWorkspaceId } from "@/auth/current";
import { getReportFile, MEDIA_TYPE } from "@/reports/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const ws = await currentWorkspaceId();
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  const f = await getReportFile(id, ws);
  if (!f) return Response.json({ error: "not found" }, { status: 404 });
  const name = f.filename.replace(/[^A-Za-z0-9._-]+/g, "_");
  return new Response(new Uint8Array(f.data), {
    headers: {
      "Content-Type": MEDIA_TYPE[f.format],
      "Content-Length": String(f.data.length),
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
