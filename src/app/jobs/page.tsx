// Jobs list — grouped by pipeline stage (quoted -> won -> in progress ->
// complete/lost), each job showing live profit/margin/hours instead of a
// bare name and status. Admin-only, see requireAdmin().
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAppAccess } from "@/lib/auth/requireAppAccess";
import { Panel, SummaryStat } from "@/components/ui";
import { JobsList, type JobListRow } from "@/components/jobs/JobsList";
import { AddJobButton } from "@/components/jobs/AddJobButton";
import { fetchSalesTeam } from "@/lib/jobs/salesTeam";
import { jobMargin } from "@/lib/jobs/margin";

type JobStatus = "draft" | "quoted" | "won" | "in_progress" | "complete" | "lost";

type JobRow = {
  id: string;
  job_number: string | null;
  name: string;
  status: JobStatus;
  quoted_sell_total: number | null;
  quoted_hours: number | null;
  created_at: string;
  updated_at: string | null;
  quoted_at: string | null;
  won_at: string | null;
  completed_at: string | null;
  lost_at: string | null;
  lost_to: string | null;
  client: { name: string } | null;
  lead: { full_name: string } | null;
};

// "Most recent" means most recently at its current stage, not most
// recently created or edited - a job quoted weeks ago and won yesterday
// belongs at the top of Won, not buried under jobs quoted more recently
// that haven't moved yet.
function jobSortDate(job: JobRow): string {
  switch (job.status) {
    case "quoted":
      return job.quoted_at ?? job.created_at;
    case "won":
      return job.won_at ?? job.created_at;
    case "in_progress":
      // No dedicated "started" timestamp - updated_at is bumped the moment
      // it's marked in progress, so it's the closest available signal.
      return job.updated_at ?? job.won_at ?? job.created_at;
    case "complete":
      return job.completed_at ?? job.won_at ?? job.created_at;
    case "lost":
      return job.lost_at ?? job.created_at;
    default:
      return job.created_at;
  }
}

type TotalsRow = {
  job_id: string;
  budgeted_total: number;
  actual_total: number;
  hours_actual: number;
};

function money(n: number) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 0,
  }).format(n);
}

export default async function JobsPage() {
  const supabase = await requireAppAccess("jobs");

  const [{ data: jobs }, { data: totals }, { data: clients }, salesTeam] =
    await Promise.all([
      supabase
        .from("jobs")
        .select(
          "id, job_number, name, status, quoted_sell_total, quoted_hours, created_at, updated_at, quoted_at, won_at, completed_at, lost_at, lost_to, client:clients(name), lead:profiles!lead_by_user_id(full_name)"
        )
        .returns<JobRow[]>(),
      supabase
        .from("job_totals")
        .select("job_id, budgeted_total, actual_total, hours_actual")
        .returns<TotalsRow[]>(),
      supabase
        .from("clients")
        .select("id, name")
        .order("name")
        .returns<{ id: string; name: string }[]>(),
      fetchSalesTeam(supabase),
    ]);

  const rows = [...(jobs ?? [])].sort((a, b) => jobSortDate(b).localeCompare(jobSortDate(a)));
  const totalsByJob = new Map((totals ?? []).map((t) => [t.job_id, t]));

  const counts = {
    quoted: rows.filter((j) => j.status === "quoted").length,
    won: rows.filter((j) => j.status === "won").length,
    inProgress: rows.filter((j) => j.status === "in_progress").length,
    pipelineValue: rows
      .filter((j) => j.status === "quoted")
      .reduce((sum, j) => sum + (j.quoted_sell_total ?? 0), 0),
  };

  const jobListRows: JobListRow[] = rows.map((job) => {
    const t = totalsByJob.get(job.id);
    const { margin, estimated } = jobMargin({
      quoted: job.quoted_sell_total ?? 0,
      budgeted: Number(t?.budgeted_total ?? 0),
      actual: Number(t?.actual_total ?? 0),
    });

    return {
      id: job.id,
      jobNumber: job.job_number,
      name: job.name,
      status: job.status,
      clientName: job.client?.name ?? null,
      leadName: job.lead?.full_name ?? null,
      quotedSellTotal: job.quoted_sell_total,
      quotedHours: job.quoted_hours,
      hoursActual: t?.hours_actual ?? 0,
      margin,
      marginIsEstimate: estimated,
      completedAt: job.completed_at,
      lostAt: job.lost_at,
      lostTo: job.lost_to,
    };
  });

  return (
    <div className="mx-auto w-full max-w-5xl p-8">
      <div className="mb-4 flex items-center justify-between">
        <Link
          href="/hub"
          className="flex items-center gap-1.5 text-sm font-medium text-ink-soft transition hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Hub
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/jobs/lost-report"
            className="text-sm font-medium text-accent hover:text-accent-hover"
          >
            Lost to report
          </Link>
          <Link
            href="/jobs/invoices"
            className="text-sm font-medium text-accent hover:text-accent-hover"
          >
            Supplier invoices
          </Link>
        </div>
      </div>

      <h1 className="mb-2 text-3xl font-bold text-ink">Jobs</h1>
      <div className="mb-6">
        <AddJobButton
          clients={clients ?? []}
          leadOptions={salesTeam}
        />
      </div>

      <div className="mb-8 flex border-b border-line pb-6">
        <SummaryStat label="Quoted, awaiting decision" value={String(counts.quoted)} />
        <SummaryStat label="Won, not yet started" value={String(counts.won)} />
        <SummaryStat label="In progress" value={String(counts.inProgress)} />
        <SummaryStat label="Pipeline value" value={money(counts.pipelineValue)} />
      </div>

      {rows.length === 0 ? (
        <Panel className="p-6 text-center text-ink-soft">
          No jobs yet. Jobs appear here once a quote is created in Platinum
          Quotes, or add one by hand above.
        </Panel>
      ) : (
        <JobsList jobs={jobListRows} />
      )}
    </div>
  );
}
