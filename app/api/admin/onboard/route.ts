/**
 * Onboarding a workspace from the CMS (CMS plan, "Workspace lifecycle"). Fair only: data
 * ops and owners run the steps; only Refal or Rafli switch a workspace live. POST { action, workspace_id, ... }:
 *   create     { id, name, category?, roles[], captions? }   a draft workspace (a listening panel)
 *   register   { table, name, url, size }                    a file uploaded to Vercel Blob
 *   inspect                                                  queue the inspect step (then run it)
 *   brands     { brands: { id: { name, handles[], terms[], never[] } }, client }
 *   labels     { map: { label: positive|neutral|negative|null } }
 *   load                                                     queue the load (then run it, slice by slice)
 *   run        { job_id }                                    run one slice of a job now (the cron does it every 5 minutes otherwise)
 *   preview    { brand_id, terms?, never? }                  relevance under these terms
 *   terms      { brand_id, terms, never, apply? }            save a brand's terms, and apply them
 *   topics     { topics: [{ id, label, is_catch_all, tags[], definition }] }
 *   status     { status }                                    review | live | paused (live: Refal or Rafli)
 *   reset                                                    delete a draft or review workspace's loaded data, to load again
 *   notes      { notes: string[] }                           what CeMO should know about gaps in the data
 *   health                                                   run the health checks now
 */
import { currentActor } from "@/auth/current";
import { can } from "@/auth/can";
import { sql } from "@/db/client";
import { toJson } from "@/db/json";
import { audit } from "@/roles/store";
import { isRoleId } from "@/roles/model";
import { invalidateWorkspace } from "@/workspace/store";
import { patchSource, saveBrands, sourceOf, SENTIMENTS, SLUG, type ContractBrand } from "@/onboard/contract";
import { loadBlockers, setStatus } from "@/onboard/load";
import { DUMP_TABLES } from "@/onboard/storage";
import { previewTerms, saveTerms } from "@/onboard/terms";
import { enqueueJob } from "@/extensions/store";
import { runSlice, type Job } from "@/extensions/jobs";
import { recordHealth, setNotes } from "@/onboard/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const no = (error: string, status = 400) => Response.json({ error }, { status });
const STATUSES = ["review", "live", "paused"] as const;

export async function POST(req: Request) {
  const actor = await currentActor();
  if (!actor || !can(actor, "workspace.data")) return no("Only Fair's data ops and owners onboard workspaces.", 403);
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const ws = String(b.workspace_id ?? "");
  if (ws && !can(actor, "workspace.data", { workspace: ws })) return no("Unknown workspace.", 404);
  const by = actor.email;

  if (b.action === "create") {
    const id = String(b.id ?? "").trim().toLowerCase();
    const name = String(b.name ?? "").trim().slice(0, 80);
    if (!/^[a-z][a-z0-9-]{2,40}$/.test(id)) return no("The id is 3 to 41 lowercase letters, digits or dashes, starting with a letter; it cannot change once live.");
    if (!name) return no("Give the workspace a name.");
    const taken = (await sql.query("select 1 from workspaces where id = $1", [id])) as unknown[];
    if (taken.length) return no("That id is taken.");
    const roles = (Array.isArray(b.roles) ? b.roles : []).filter(isRoleId);
    const category = String(b.category ?? "").trim().toLowerCase().slice(0, 30) || null;
    const settings = { roles: roles.length ? roles : ["pr", "brand_kol", "social"], category_label: String(b.label ?? "").trim() || `${name}`, source: "listening", ...(b.captions ? { captions: { enabled: true } } : {}) };
    await sql.query("insert into workspaces (id, name, category, kind, settings, status) values ($1, $2, $3, 'category', $4::jsonb, 'draft')", [id, name, category, toJson(settings)]);
    await sourceOf(id);
    await audit({ workspace_id: id, actor: by, area: "workspace", action: "create", new: { name, roles: settings.roles, category } });
    invalidateWorkspace(id);
    return Response.json({ ok: true, id });
  }

  const w = ((await sql.query("select id, status from workspaces where id = $1", [ws])) as { id: string; status: string }[])[0];
  if (!w) return no("Unknown workspace.", 404);

  switch (b.action) {
    case "register": {
      const t = String(b.table ?? "");
      if (!(DUMP_TABLES as readonly string[]).includes(t)) return no("Not one of the dump's tables the loader reads.");
      const url = String(b.url ?? "");
      if (!/^https:\/\/[a-z0-9.-]+\.blob\.vercel-storage\.com\//.test(url)) return no("Not a Vercel Blob file.");
      const files = { ...((await sourceOf(ws)).config.files ?? {}), [t]: { table: t, name: String(b.name ?? t), url, size: Number(b.size ?? 0), at: new Date().toISOString() } };
      await patchSource(ws, { files });
      return Response.json({ ok: true });
    }
    case "inspect": {
      const id = await enqueueJob(ws, "dump_inspect", {}, by);
      return Response.json({ ok: true, job_id: id });
    }
    case "brands": {
      const raw = (b.brands && typeof b.brands === "object" ? b.brands : {}) as Record<string, Partial<ContractBrand>>;
      const brands: Record<string, ContractBrand> = {};
      for (const [id, x] of Object.entries(raw)) {
        const key = id.trim().toLowerCase();
        if (!SLUG.test(key)) return no(`"${id}" is not a usable brand id: lowercase letters, digits, dots, dashes or underscores.`);
        brands[key] = { name: String(x.name ?? key).trim().slice(0, 60), handles: (Array.isArray(x.handles) ? x.handles : []).map(String), terms: (Array.isArray(x.terms) ? x.terms : []).map(String), never: (Array.isArray(x.never) ? x.never : []).map(String) };
      }
      if (!Object.keys(brands).length) return no("Add at least one brand.");
      const client = typeof b.client === "string" && b.client ? b.client : null;
      const r = await saveBrands(ws, brands, client);
      if (!r.ok) return no(r.error);
      await audit({ workspace_id: ws, actor: by, area: "data", action: "brands", new: { brands: Object.keys(brands), client } });
      invalidateWorkspace(ws);
      return Response.json({ ok: true });
    }
    case "labels": {
      const m = (b.map && typeof b.map === "object" ? b.map : {}) as Record<string, unknown>;
      const map = Object.fromEntries(Object.entries(m).map(([k, v]) => [k, (SENTIMENTS as readonly string[]).includes(String(v)) ? String(v) : null])) as Record<string, "positive" | "neutral" | "negative" | null>;
      await patchSource(ws, { sentiment_map: map });
      await audit({ workspace_id: ws, actor: by, area: "data", action: "labels", new: map });
      return Response.json({ ok: true });
    }
    case "load": {
      const block = await loadBlockers(ws);
      if (block.length) return no(block.join(" "));
      const running = (await sql.query("select id from cms_jobs where workspace_id = $1 and kind = 'dump_load' and status in ('queued','running')", [ws])) as { id: string }[];
      if (running[0]) return Response.json({ ok: true, job_id: running[0].id });
      const id = await enqueueJob(ws, "dump_load", {}, by);
      await audit({ workspace_id: ws, actor: by, area: "data", action: "load" });
      return Response.json({ ok: true, job_id: id });
    }
    case "run": {
      // the job is claimed like the cron claims it, so a slice never runs twice at once
      const rows = (await sql.query(
        `update cms_jobs set status = 'running', locked_until = now() + interval '5 minutes', updated_at = now()
          where id = $1 and workspace_id = $2 and status in ('queued','running') and (locked_until is null or locked_until < now()) returning *`,
        [String(b.job_id ?? ""), ws],
      )) as Job[];
      if (!rows[0]) {
        const j = ((await sql.query("select status, progress, error from cms_jobs where id = $1 and workspace_id = $2", [String(b.job_id ?? ""), ws])) as { status: string; progress: Record<string, unknown>; error: string | null }[])[0];
        return j ? Response.json({ ok: true, status: j.status, progress: j.progress, error: j.error, busy: j.status === "running" }) : no("No such job.", 404);
      }
      const r = await runSlice(rows[0], undefined, 45_000);
      const j = ((await sql.query("select status, progress, error from cms_jobs where id = $1", [rows[0].id])) as { status: string; progress: Record<string, unknown>; error: string | null }[])[0];
      return Response.json({ ok: true, status: j.status, progress: j.progress, error: j.error, detail: r.detail });
    }
    case "preview": {
      const p = await previewTerms(ws, String(b.brand_id ?? ""), { terms: b.terms, never: b.never });
      return p ? Response.json({ ok: true, preview: p }) : no("No such brand.");
    }
    case "terms": {
      const brandId = String(b.brand_id ?? "");
      const saved = await saveTerms(ws, brandId, b.terms, b.never, by);
      const job = b.apply ? await enqueueJob(ws, "relevance_apply", { brand_id: brandId, by }, by) : null;
      return Response.json({ ok: true, ...saved, job_id: job });
    }
    case "topics": {
      const list = Array.isArray(b.topics) ? b.topics : [];
      for (const t of list as Record<string, unknown>[]) {
        const tags = (Array.isArray(t.tags) ? t.tags : []).map(String).filter((x) => ["service", "promo", "product", "reputation"].includes(x));
        await sql.query("update topics set label = coalesce(nullif($3, ''), label), is_catch_all = $4, tags = $5::text[], definition = nullif($6, '') where id = $1 and workspace_id = $2", [
          String(t.id ?? ""), ws, String(t.label ?? "").trim().slice(0, 60), !!t.is_catch_all, tags, String(t.definition ?? "").trim().slice(0, 200),
        ]);
      }
      await audit({ workspace_id: ws, actor: by, area: "data", action: "topics", new: { topics: list.length } });
      return Response.json({ ok: true });
    }
    case "status": {
      const to = String(b.status ?? "");
      if (!(STATUSES as readonly string[]).includes(to)) return no("Unknown status.");
      if (to === "live" && !can(actor, "role.release")) return no("Only Refal or Rafli switch a workspace live.", 403);
      if (to === "live" && !["review", "paused"].includes(w.status)) return no("A workspace goes live from review, after its load report is read.");
      await setStatus(ws, to);
      await audit({ workspace_id: ws, actor: by, area: "workspace", action: "status", old: w.status, new: to });
      return Response.json({ ok: true });
    }
    case "reset": {
      if (!["draft", "review", "loading"].includes(w.status)) return no("Only a workspace that is not live can be emptied.");
      await sql.query("delete from comments where workspace_id = $1", [ws]);
      await sql.query("delete from post_snapshots where post_id in (select id from posts where workspace_id = $1)", [ws]);
      await sql.query("delete from posts where workspace_id = $1", [ws]);
      await sql.query("delete from creators where workspace_id = $1", [ws]);
      await sql.query("delete from data_loads where workspace_id = $1", [ws]);
      await sql.query("update cms_jobs set status = 'cancelled', updated_at = now() where workspace_id = $1 and status in ('queued','running')", [ws]);
      await setStatus(ws, "draft");
      await audit({ workspace_id: ws, actor: by, area: "data", action: "reset" });
      return Response.json({ ok: true });
    }
    case "notes": {
      const list = (Array.isArray(b.notes) ? b.notes : []).map((x) => String(x).trim()).filter(Boolean).slice(0, 20).map((text) => ({ text: text.slice(0, 300), source: "data ops", at: new Date().toISOString() }));
      await setNotes(ws, list);
      await audit({ workspace_id: ws, actor: by, area: "data", action: "notes", new: list.map((x) => x.text) });
      return Response.json({ ok: true });
    }
    case "health": {
      const h = await recordHealth(ws);
      return Response.json({ ok: true, health: h });
    }
    default:
      return no("Unknown action.");
  }
}
