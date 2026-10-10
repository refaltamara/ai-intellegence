/** Cases (DECISIONS, 10 Oct 2026, step 5): the watches inside this panel that this person is on the list of. */
import Link from "next/link";
import { notFound } from "next/navigation";
import { currentActor, currentWorkspaceId } from "@/auth/current";
import { casesFor } from "@/cases/store";
import { fmtNum } from "@/ui/format";

export const dynamic = "force-dynamic";

const day = (d: string | null) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }) : "");

export default async function CasesPage() {
  const [actor, ws] = await Promise.all([currentActor(), currentWorkspaceId()]);
  const cases = actor ? await casesFor(actor, ws) : [];
  // nobody learns a case exists unless they are on its list
  if (!cases.length) notFound();
  return (
    <section className="screen">
      <div className="topbar">
        <div><h1>Cases</h1><span className="meta">Watches inside this panel, such as a crisis. Only the people on a case&apos;s list see it, and its own posts never count in the panel&apos;s numbers.</span></div>
        <span className="pill">{cases.length} case{cases.length === 1 ? "" : "s"}</span>
      </div>
      <div className="wrap wide">
        <div className="tablewrap people"><table>
          <thead><tr><th>Case</th><th>Dates</th><th className="num">Posts</th><th>Status</th></tr></thead>
          <tbody>{cases.map((c) => (
            <tr key={c.id}>
              <td><Link href={`/cases/${c.id}`}><b>{c.name}</b></Link>{c.about ? <><br /><small className="muted">{c.about}</small></> : null}</td>
              <td>{day(c.starts_on)}{c.ends_on ? ` to ${day(c.ends_on)}` : " onwards"}</td>
              <td className="num">{fmtNum(c.posts)}</td>
              <td>{c.status === "open" ? "open" : <span className="muted">closed</span>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>
    </section>
  );
}
