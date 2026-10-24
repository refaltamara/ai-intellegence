/**
 * Cases (DECISIONS, 10 Oct 2026, step 5): the watches inside this panel that this person is on the list of. One of
 * the four places on every team since 16 Oct: with no case on their list a person sees the same plain page as when
 * the panel has none, so nobody learns a case exists unless they are on its list.
 */
import Link from "next/link";
import { currentActor, currentWorkspaceId } from "@/auth/current";
import { casesFor } from "@/cases/store";
import { fmtNum } from "@/ui/format";
import { PageHeader } from "@/ui/kit/PageHeader";
import { Empty } from "@/ui/kit/Section";
import { StatusPill } from "@/ui/kit/StatusPill";
import { SUB, TD, TD_NUM, TH, TH_NUM, TR, Table } from "@/ui/kit/Table";

export const dynamic = "force-dynamic";

const PAGE = "flex min-h-full flex-col gap-6 px-4 pb-10 md:px-6";
const day = (d: string | null) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }) : "");

export default async function CasesPage() {
  const [actor, ws] = await Promise.all([currentActor(), currentWorkspaceId()]);
  const cases = actor ? await casesFor(actor, ws) : [];
  if (!cases.length) {
    return (
      <section data-tw className={PAGE}>
        <PageHeader title="Cases" subtitle="Watches inside the panel, such as a crisis around one brand." />
        <Empty>No cases for you here. A case is a watch Fair sets up inside the panel, for example a crisis around one brand: its posts and comments are counted on their own, and only the people on its list see it. Ask Fair to open one.</Empty>
      </section>
    );
  }
  return (
    <section data-tw className={PAGE}>
      <PageHeader title="Cases" subtitle={<>Watches inside this panel, such as a crisis. Only the people on a case&apos;s list see it, and its own posts never count in the panel&apos;s numbers.</>}
        actions={<StatusPill tone="neutral">{cases.length} case{cases.length === 1 ? "" : "s"}</StatusPill>} />
      <Table min="min-w-[720px]" head={<><th className={TH}>Case</th><th className={TH}>Dates</th><th className={TH_NUM}>Posts</th><th className={TH}>Status</th></>}>
        {cases.map((c) => (
          <tr key={c.id} className={TR}>
            <td className={TD}>
              <Link href={`/cases/${c.id}`} className="rounded-md font-semibold text-gray-900 underline-offset-2 hover:text-brand-palette-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-palette-600">{c.name}</Link>
              {c.about && <span className={SUB}>{c.about}</span>}
            </td>
            <td className={`${TD} whitespace-nowrap`}>{day(c.starts_on)}{c.ends_on ? ` to ${day(c.ends_on)}` : " onwards"}</td>
            <td className={TD_NUM}>{fmtNum(c.posts)}</td>
            {/* a case being watched is the one live state here, so only it carries the dot */}
            <td className={TD}>{c.status === "open" ? <StatusPill tone="live">Open</StatusPill> : <StatusPill tone="neutral">Closed</StatusPill>}</td>
          </tr>
        ))}
      </Table>
    </section>
  );
}
