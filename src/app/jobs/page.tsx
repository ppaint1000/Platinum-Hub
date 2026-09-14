// Jobs list — grouped by pipeline stage (quoted -> won -> in progress ->
// complete/lost), each job showing live profit/margin/hours instead of a
// bare name and status. Admin-only, see requireAdmin().
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAppAccess } from "@/lib/auth/requireAppAccess";
import { Panel, SummaryStat } from "@/components/ui";
import { JobsList, type JobListRow } from "@/components/jobs/JobsList";

type JobStatus = "draft" | "quoted" | "won" | "in_progress" | "complete" | "lost";

type JobRow = {
  id: string;
  job_number: string | null;
  name: string;
  status: JobStatus;
  quoted_sell_total: number | null;
  quoted_hours: number | null;
  client: { name: string } | null;
};

type TotalsRow = {
  job_id: string;
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

  const [{ data: jobs }, { data: totals }] = await Promise.all([
    supabase
      .from("jobs")
      .select(
        "id, job_number, name, status, quoted_sell_total, quoted_hours, client:clients(name)"
      )
      .order("created_at", { ascending: false })
      .returns<JobRow[]>(),
    supabase
      .from("job_totals")
      .select("job_id, actual_total, hours_actual")
      .returns<TotalsRow[]>(),
  ]);

  const rows = jobs ?? [];
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
    const quoted = job.quoted_sell_total ?? 0;
    const actual = t?.actual_total ?? 0;
    const profit = quoted > 0 ? quoted - actual : null;
    const margin = quoted > 0 && profit != null ? profit / quoted : null;

    return {
      id: job.id,
      jobNumber: job.job_number,
      name: job.name,
      status: job.status,
      clientName: job.client?.name ?? null,
      quotedSellTotal: job.quoted_sell_total,
      quotedHours: job.quoted_hours,
      hoursActual: t?.hours_actual ?? 0,
      margin,
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
            href="/jobs/invoices"
            className="text-sm font-medium text-accent hover:text-accent-hover"
          >
            Resene invoices
          </Link>
        </div>
      </div>

      <h1 className="mb-6 text-3xl font-bold text-ink">Jobs</h1>

      <div className="mb-8 flex border-b border-line pb-6">
        <SummaryStat label="Quoted, awaiting decision" value={String(counts.quoted)} />
        <SummaryStat label="Won, not yet started" value={String(counts.won)} />
        <SummaryStat label="In progress" value={String(counts.inProgress)} />
        <SummaryStat label="Pipeline value" value={money(counts.pipelineValue)} />
      </div>

      {rows.length === 0 ? (
        <Panel className="p-6 text-center text-ink-soft">
          No jobs yet. Jobs appear here once a quote is created in Platinum
          Quotes.
        </Panel>
      ) : (
        <JobsList jobs={jobListRows} />
      )}
    </div>
  );
}
