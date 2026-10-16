/**
 * Cases (DECISIONS, 10 Oct 2026, step 5): the watches inside this panel that this person is on the list of. One of
 * the four places on every team since 16 Oct: with no case on their list a person sees the same plain page as when
 * the panel has none, so nobody learns a case exists unless they are on its list.
 */
import Link from "next/link";
import { currentActor, currentWorkspaceId } from "@/auth/current";
import { casesFor } from "@/cases/store";
import { fmtNum } from "@/ui/format";

export const dynamic = "force-dynamic";

const day = (d: string | null) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }) : "");

export default async function CasesPage() {
  const [actor, ws] = await Promise.all([currentActor(), currentWorkspaceId()]);
  const cases = actor ? await casesFor(actor, ws) : [];
  if (!cases.length) {
    return (
      <section className="screen">
        <div className="topbar"><div><h1>Cases</h1><span className="meta">Watches inside the panel, such as a crisis around one brand.</span></div></div>
        <div className="wrap wide">
          <div className="empty">No cases for you here. A case is a watch Fair sets up inside the panel, for example a crisis around one brand: its posts and comments are counted on their own, and only the people on its list see it. Ask Fair to open one.</div>
        </div>
      </section>
    );
  }
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
