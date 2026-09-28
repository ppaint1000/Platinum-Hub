// Shared by the Clients win-rate report and the Clients dashboard, so both
// always cover the same period and count quotes the same way.

export type Period = "month" | "quarter" | "year";

export function parsePeriod(value: string | undefined): Period {
  return value === "month" || value === "quarter" || value === "year" ? value : "year";
}

export function periodStart(period: Period): Date {
  const now = new Date();
  if (period === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === "quarter") return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  return new Date(now.getFullYear(), 0, 1);
}

export type JobStatus = "draft" | "quoted" | "won" | "in_progress" | "complete" | "lost";

export const isWon = (status: JobStatus) => status === "won" || status === "in_progress" || status === "complete";

// A quote is in the period if it was decided (won/lost) in it, or - still
// undecided - quoted in it.
export function inPeriod(job: { won_at: string | null; lost_at: string | null; quoted_at: string | null }, start: Date) {
  const anchor = job.won_at ?? job.lost_at ?? job.quoted_at;
  return anchor != null && new Date(anchor) >= start;
}
