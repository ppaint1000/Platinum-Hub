// Every job status, in pipeline order (supabase/jobs_production_statuses.sql).
// "won" is the first production stage, shown on the Production board as
// "To be scheduled".
export const JOB_STATUSES = [
  "draft",
  "quoted",
  "on_hold",
  "won",
  "scheduled",
  "in_progress",
  "complete",
  "invoiced",
  "paid",
  "lost",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

// Won and everything after it - counts as a win in win rates and sales.
export const WON_STATUSES: readonly JobStatus[] = ["won", "scheduled", "in_progress", "complete", "invoiced", "paid"];
export const isWonStatus = (status: string) => (WON_STATUSES as readonly string[]).includes(status);

// The Production board's columns.
export const PRODUCTION_STAGES: { status: JobStatus; label: string }[] = [
  { status: "won", label: "To be scheduled" },
  { status: "scheduled", label: "Scheduled" },
  { status: "in_progress", label: "In progress" },
  { status: "complete", label: "Job completed" },
  { status: "invoiced", label: "Invoiced" },
  { status: "paid", label: "Paid" },
];

// Stages a supervisor can move jobs between; Invoiced and Paid are admin-only.
export const SUPERVISOR_STAGES: readonly JobStatus[] = ["won", "scheduled", "in_progress", "complete"];

// A quote still undecided this long after it was quoted goes On Hold.
export const ON_HOLD_AFTER_MONTHS = 8;
