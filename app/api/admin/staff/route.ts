/** PATCH { account_id, staff }: Refal or Rafli set a Fair person's duties (owner, role owner, design, data ops). */
import { currentActor } from "@/auth/current";
import { can } from "@/auth/can";
import { setStaff } from "@/auth/accounts";
import { forgetUser } from "@/auth/live";
import { isDuty } from "@/config/staff";
import { audit } from "@/roles/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  const actor = await currentActor();
  if (!actor || !can(actor, "staff.manage")) return Response.json({ error: "Only Refal or Rafli can change Fair duties." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { account_id?: string; staff?: unknown[] };
  if (!/^[0-9a-f-]{36}$/i.test(String(b.account_id ?? ""))) return Response.json({ error: "Unknown account." }, { status: 404 });
  const staff = (b.staff ?? []).filter(isDuty);
  if (b.account_id === actor.account_id && !staff.includes("owner")) return Response.json({ error: "You can't remove your own owner duty." }, { status: 400 });
  if (!(await setStaff(String(b.account_id ?? ""), staff))) return Response.json({ error: "Unknown account." }, { status: 404 });
  forgetUser();
  await audit({ actor: actor.email, area: "people", action: "duties", path: String(b.account_id), new: staff });
  return Response.json({ ok: true, staff });
}
