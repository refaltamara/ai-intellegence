/**
 * Upload a dump's files when Vercel Blob is not configured (local runs): multipart form
 * with workspace_id and one or more CSVs, saved to the onboarding folder. With Blob on,
 * the browser uploads straight to Blob instead (../blob) and registers each file.
 */
import { currentActor } from "@/auth/current";
import { can } from "@/auth/can";
import { patchSource, sourceOf, type StoredFile } from "@/onboard/contract";
import { DUMP_TABLES, blobOn, saveLocal, tableOf } from "@/onboard/storage";
import { sql } from "@/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const actor = await currentActor();
  if (!actor || !can(actor, "workspace.data")) return Response.json({ error: "forbidden" }, { status: 403 });
  if (blobOn()) return Response.json({ error: "Uploads go to Vercel Blob here." }, { status: 400 });
  const form = await req.formData();
  const ws = String(form.get("workspace_id") ?? "");
  if (!can(actor, "workspace.data", { workspace: ws })) return Response.json({ error: "forbidden" }, { status: 403 });
  if (!((await sql.query("select 1 from workspaces where id = $1", [ws])) as unknown[]).length) return Response.json({ error: "Unknown workspace." }, { status: 404 });
  const files: Record<string, StoredFile> = { ...((await sourceOf(ws)).config.files ?? {}) };
  const saved: string[] = [], skipped: string[] = [];
  for (const f of form.getAll("files")) {
    if (typeof f === "string") continue;
    const t = tableOf(f.name);
    if (!t || !(DUMP_TABLES as readonly string[]).includes(t)) { skipped.push(f.name); continue; }
    const s = await saveLocal(ws, f.name, new Uint8Array(await f.arrayBuffer()));
    files[t] = { table: t, name: f.name, url: s.url, size: s.size, at: new Date().toISOString() };
    saved.push(f.name);
  }
  await patchSource(ws, { files });
  return Response.json({ ok: true, saved, skipped });
}
