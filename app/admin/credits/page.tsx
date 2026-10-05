/**
 * Credits in the CMS (CMS plan, "The CMS: 10. Credits"): each workspace's pool, use and
 * top-ups this month, and the price list. Refal and Rafli also see Fair's real model cost
 * against the credits used, set pools, turn billing on and add top-ups.
 */
import { currentActor } from "@/auth/current";
import { can } from "@/auth/can";
import { costByWorkspace, fairOwnCost, monthOf } from "@/credits/ledger";
import { CREDIT_PRICES, CREDIT_PRICE_USD } from "@/config/credits";
import { Act } from "@/ui/company/Act";

export const dynamic = "force-dynamic";

const n = (x: number) => Math.round(x).toLocaleString("en-US");
const usd = (x: number) => `$${x.toFixed(2)}`;

export default async function AdminCredits() {
  const actor = await currentActor();
  const owner = !!actor && can(actor, "billing.manage");
  const month = monthOf();
  const [rows, own] = await Promise.all([costByWorkspace(month), owner ? fairOwnCost(month) : Promise.resolve(0)]);
  const A = "/api/admin/credits";
  return (
    <section className="screen">
      <div className="topbar"><div><h1>Credits</h1><span className="meta">{month} · prices are placeholders until a month of measured cost{owner ? "" : " · Refal and Rafli see cost and change pools"}</span></div></div>
      <div className="wrap wide cms">
        <div className="tablewrap people"><table>
          <thead><tr><th>Workspace</th><th className="num">Used</th><th className="num">Pool</th><th className="num">Top-ups</th><th className="num">Builder cap</th><th>Billing</th>{owner && <><th className="num">Credits value</th><th className="num">Model cost</th><th className="num">Margin</th></>}{owner && <th />}</tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.workspace_id}>
              <td><b>{r.name}</b> <span className="muted">{r.workspace_id}</span></td>
              <td className="num">{n(r.state.spent)} <small className="muted">{Math.round(r.state.share * 100)}%</small></td>
              <td className="num">{n(r.state.pool)}</td><td className="num">{n(r.state.topups)}</td><td className="num">{r.state.cap == null ? "–" : n(r.state.cap)}</td>
              <td>{r.state.enforce ? "On: stops at the limit" : <span className="muted">Recording only</span>}</td>
              {owner && <><td className="num">{usd(r.credits_value_usd)}</td><td className="num">{usd(r.model_cost_usd)}</td><td className={`num ${r.credits_value_usd - r.model_cost_usd < 0 ? "down" : ""}`}>{usd(r.credits_value_usd - r.model_cost_usd)}</td></>}
              {owner && <td className="acts">
                <Act label="Pool" url={A} body={{ action: "pool", workspace_id: r.workspace_id }} ask={`Monthly pool for ${r.name} (now ${r.state.pool})`} />
                <Act label="Top up" url={A} body={{ action: "topup", workspace_id: r.workspace_id }} ask={`Credits to add to ${r.name} for ${month}`} />
                <Act label={r.state.enforce ? "Billing off" : "Billing on"} url={A} body={{ action: "billing", workspace_id: r.workspace_id, enforce: !r.state.enforce }} confirm={r.state.enforce ? `Stop enforcing the limit for ${r.name}?` : `Turn billing on for ${r.name}? At the limit CeMO stops for them until next month or a top-up.`} />
              </td>}
            </tr>))}
          </tbody></table></div>
        {owner && <p className="muted">Fair&apos;s own model cost this month (the Role Lab, work with no workspace): {usd(own)}. Credits are valued at {usd(CREDIT_PRICE_USD)} each; model cost uses list prices per token.</p>}
        <h2 className="cmsh">Price list</h2>
        <div className="tablewrap people"><table><tbody>
          {Object.entries(CREDIT_PRICES).map(([k, v]) => <tr key={k}><td>{k.replace(/_/g, " ")}</td><td className="num">{k === "extension_row" ? `${v} per row (${n(v * 1000)} per 1,000)` : v}</td></tr>)}
          <tr><td>dashboards, filters, settings, approvals, exports</td><td className="num">0</td></tr>
        </tbody></table></div>
      </div>
    </section>
  );
}
