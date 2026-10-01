/** What the Reports page needs, whichever report or schedule is open (DECISIONS, 1 Oct 2026: one list). */
import { listAgents, listRuns } from "../agents/store";
import { hasModelCredentials } from "../chat/loop";
import { impls } from "../skills/index";
import { listSkills } from "../skills/registry";
import { listReports } from "./store";
import { scheduleOptions } from "./options";

export async function reportsHomeData(ws: string) {
  const [reports, agents, opts] = await Promise.all([listReports(ws, 200), listAgents(ws), scheduleOptions(ws)]);
  const withRuns = await Promise.all(agents.map(async (a) => ({ ...a, runs: await listRuns(a.id, 20) })));
  return {
    reports,
    agents: withRuns,
    setup: {
      skills: listSkills().filter((d) => !!impls[d.name]).map((d) => ({ name: d.name, title: d.title })),
      modelConfigured: hasModelCredentials(),
      emailConfigured: !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
      brands: opts.brands,
      template: opts.template,
      weeks: opts.weeks,
    },
  };
}
