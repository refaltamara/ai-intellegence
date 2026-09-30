/** GET: this team's Pulses. POST { name, template?, brands?, platform? }: a new Pulse, filled from a template. */
import { currentSession, currentWorkspaceId } from "@/auth/current";
import { PLATFORMS, type PlatformFilter } from "@/dashboard/askref";
import { cleanConfig, KIND_INFO } from "@/pulses/cards";
import { knownBrands, panelWorkspace } from "@/pulses/api";
import { addCard, createPulse, listPulses } from "@/pulses/store";
import { TEMPLATES, templateCards } from "@/pulses/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const ws = await currentWorkspaceId();
  return Response.json(await listPulses(ws));
}

export async function POST(req: Request) {
  const [ws, session] = await Promise.all([currentWorkspaceId(), currentSession()]);
  const b = (await req.json().catch(() => ({}))) as { name?: unknown; template?: unknown; brands?: unknown; platform?: unknown; description?: unknown };
  const name = typeof b.name === "string" && b.name.trim() ? b.name.trim().slice(0, 80) : "Untitled Pulse";
  const t = TEMPLATES.find((x) => x.key === b.template) ?? TEMPLATES.find((x) => x.key === "blank")!;
  if (t.panel && !(await panelWorkspace(ws))) return Response.json({ error: "this team has no brand panel; start from Blank and pin answers from Chats" }, { status: 400 });
  const known = await knownBrands(ws);
  const brands = Array.isArray(b.brands) ? b.brands.filter((x): x is string => typeof x === "string" && known.has(x)).slice(0, 20) : [];
  const platform = (PLATFORMS as string[]).includes(String(b.platform)) ? (b.platform as PlatformFilter) : "all";
  const pulse = await createPulse({ workspaceId: ws, userId: session?.uid ?? null, name, description: typeof b.description === "string" ? b.description.slice(0, 200) : t.description });
  for (const c of templateCards(t, { brands, platform })) {
    await addCard({ workspaceId: ws, pulseId: pulse.id, kind: c.kind, title: c.title ?? null, config: cleanConfig(c.kind, c.config, known), size: c.size ?? KIND_INFO[c.kind].size });
  }
  return Response.json({ pulse }, { status: 201 });
}
