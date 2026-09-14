// Jobs list — grouped by pipeline stage (quoted -> won -> in progress ->
// complete/lost), each job showing live profit/margin/hours instead of a
// bare name and status. Admin-only, see requireAdmin().
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAppAccess } from "@/lib/auth/requireAppAccess";
import { Panel, StatusRow, StatusLabel, Money, SummaryStat } from "@/components/ui";
import { jobStatusLabel } from "@/design/tailwind.tokens";

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

const STAGE_ORDER: JobStatus[] = ["quoted", "won", "in_progress", "complete", "lost", "draft"];

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

  const groups = STAGE_ORDER.map((status) => ({
    status,
    jobs: rows.filter((j) => j.status === status),
  })).filter((g) => g.jobs.length > 0);

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
          <Link href="/clients" className="text-sm font-medium text-accent hover:text-accent-hover">
            Manage clients
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

      {rows.length === 0 && (
        <Panel className="p-6 text-center text-ink-soft">
          No jobs yet. Jobs appear here once a quote is created in Platinum
          Quotes.
        </Panel>
      )}

      <div className="space-y-8">
        {groups.map((group) => (
          <div key={group.status}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-faint">
              {jobStatusLabel[group.status] ?? group.status} · {group.jobs.length}
            </h2>
            <div className="space-y-2">
              {group.jobs.map((job) => {
                const t = totalsByJob.get(job.id);
                const quoted = job.quoted_sell_total ?? 0;
                const actual = t?.actual_total ?? 0;
                const profit = quoted > 0 ? quoted - actual : null;
                const margin = quoted > 0 && profit != null ? profit / quoted : null;

                return (
                  <Link key={job.id} href={`/jobs/${job.id}`}>
                    <StatusRow status={job.status}>
                      <div className="flex items-center gap-4">
                        <span className="w-24 font-mono text-sm text-ink-faint">
                          {job.job_number ?? "—"}
                        </span>
                        <div>
                          <div className="font-medium text-ink">{job.name}</div>
                          <div className="text-sm text-ink-soft">
                            {job.client?.name ?? "No client set"}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-6 text-sm">
                        {job.quoted_hours != null && (
                          <span className="text-ink-soft tabular-nums">
                            {(t?.hours_actual ?? 0).toFixed(0)} / {job.quoted_hours.toFixed(0)} hrs
                          </span>
                        )}
                        {margin != null && (
                          <span className="tabular-nums text-ink-soft">
                            {(margin * 100).toFixed(0)}% GP
                          </span>
                        )}
                        {job.quoted_sell_total != null && <Money value={job.quoted_sell_total} />}
                        <StatusLabel status={job.status} />
                      </div>
                    </StatusRow>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
