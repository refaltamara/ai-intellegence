/** Cron schedules for agents (PRD §6). Vercel Cron polls the runner; agents keep their own next_run_at. */
import { CronExpressionParser } from "cron-parser";

export const DEFAULT_CRON = "0 7 * * 1";
export const DEFAULT_TZ = "Asia/Jakarta";
export const DEFAULT_HUMAN = "Weekly · Monday 07:00 WIB";

export function nextRunAt(cron: string, tz = DEFAULT_TZ, from = new Date()): Date {
  return CronExpressionParser.parse(cron, { tz, currentDate: from }).next().toDate();
}

export function validateCron(cron: string): string | null {
  try {
    CronExpressionParser.parse(cron);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Best-effort English description of common cron shapes; falls back to the expression. */
export function humanize(cron: string, tz = DEFAULT_TZ): string {
  const m = /^(\d{1,2}) (\d{1,2}) (\*) (\*) (\*|\d|\d-\d|\d(?:,\d)+)$/.exec(cron.trim());
  const tzLabel = tz === "Asia/Jakarta" ? "WIB" : tz;
  if (m) {
    const [, min, hour, , , dow] = m;
    const time = `${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
    if (dow === "*") return `Daily · ${time} ${tzLabel}`;
    if (dow === "1-5") return `Weekdays · ${time} ${tzLabel}`;
    if (/^\d$/.test(dow)) return `Weekly · ${DAYS[Number(dow)]} ${time} ${tzLabel}`;
    return `${dow.split(",").map((d) => DAYS[Number(d)]).join(", ")} · ${time} ${tzLabel}`;
  }
  const h = /^0 \*\/(\d+) \* \* \*$/.exec(cron.trim());
  if (h) return `Every ${h[1]} hours`;
  const md = /^(\d{1,2}) (\d{1,2}) (\d{1,2}) \* \*$/.exec(cron.trim());
  if (md) return `Monthly · day ${md[3]} ${md[2].padStart(2, "0")}:${md[1].padStart(2, "0")} ${tzLabel}`;
  return cron;
}
