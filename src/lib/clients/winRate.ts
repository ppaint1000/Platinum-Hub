// Shared by the Clients win-rate report and the Clients dashboard, so both
// always cover the same period and count quotes the same way.

import { nzDayStartUtcIso, nzTodayDateString } from "@/lib/timesheets/formatNZ";

export type Period = "month" | "quarter" | "year";

export function parsePeriod(value: string | undefined): Period {
  return value === "month" || value === "quarter" || value === "year" ? value : "year";
}

export function periodStart(period: Period): Date {
  const [year, month] = nzTodayDateString().split("-").map(Number);
  const first = period === "month" ? month : period === "quarter" ? Math.floor((month - 1) / 3) * 3 + 1 : 1;
  return new Date(nzDayStartUtcIso(`${year}-${String(first).padStart(2, "0")}-01`));
}

import { isWonStatus, type JobStatus } from "@/lib/jobs/status";
export type { JobStatus };

export const isWon = (status: JobStatus) => isWonStatus(status);

// A quote is in the period if it was decided (won/lost) in it, or - still
// undecided - quoted in it.
export function inPeriod(job: { won_at: string | null; lost_at: string | null; quoted_at: string | null }, start: Date) {
  const anchor = job.won_at ?? job.lost_at ?? job.quoted_at;
  return anchor != null && new Date(anchor) >= start;
}
