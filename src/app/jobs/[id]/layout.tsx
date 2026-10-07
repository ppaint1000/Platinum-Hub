// Every page of one job: the header (number, status, name, client and the
// job's actions) across the top, the job's own pages down the left.
// Gated by requireAppAccess("jobs").
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAppAccess } from "@/lib/auth/requireAppAccess";
import { StatusLabel } from "@/components/ui";
import { MarkAsWonButton } from "@/components/jobs/MarkAsWonButton";
import { MarkAsLostButton } from "@/components/jobs/MarkAsLostButton";
import { MarkAsInProgressButton } from "@/components/jobs/MarkAsInProgressButton";
import { MarkAsCompleteButton } from "@/components/jobs/MarkAsCompleteButton";
import { JobStatusControl } from "@/components/jobs/JobStatusControl";
import { DeleteJobButton } from "@/components/jobs/DeleteJobButton";
import { EditJobDetailsButton } from "@/components/jobs/EditJobDetailsButton";
import { AssignSalesPersonBanner } from "@/components/jobs/AssignSalesPersonBanner";
import { JobSubNav } from "@/components/jobs/JobSubNav";
import { fetchSalesTeam, needsSalesPerson } from "@/lib/jobs/salesTeam";
import type { JobStatus } from "@/lib/jobs/status";

type JobRow = {
  id: string;
  job_number: string | null;
  name: string;
  description: string | null;
  status: JobStatus;
  quoted_sell_total: number | null;
  quoted_hours: number | null;
  lead_by: string | null;
  lead_by_user_id: string | null;
  lead_source: string | null;
  client_id: string | null;
  lost_at: string | null;
  lost_to: string | null;
  completed_at: string | null;
  client: { name: string } | null;
};

export default async function JobLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await requireAppAccess("jobs");

  const { data: job } = await supabase
    .from("jobs")
    .select(
      "id, job_number, name, description, status, quoted_sell_total, quoted_hours, lead_by, lead_by_user_id, lead_source, client_id, lost_at, lost_to, completed_at, client:clients(name)"
    )
    .eq("id", id)
    .single<JobRow>();

  if (!job) notFound();

  const [{ data: clients }, { data: leadUsers }, { data: lostToRows }, salesTeam, { count: costLineCount }, { count: pendingVariations }] =
    await Promise.all([
      supabase.from("clients").select("id, name").order("name").returns<{ id: string; name: string }[]>(),
      supabase
        .from("profiles")
        .select("id, full_name")
        .in("role", ["admin", "sales"])
        .order("full_name")
        .returns<{ id: string; full_name: string }[]>(),
      supabase.from("jobs").select("lost_to").not("lost_to", "is", null).returns<{ lost_to: string }[]>(),
      fetchSalesTeam(supabase),
      supabase.from("job_actual_costs").select("id", { count: "exact", head: true }).eq("job_id", id),
      supabase.from("job_variations").select("id", { count: "exact", head: true }).eq("job_id", id).eq("status", "pending"),
    ]);

  const lostToOptions = [...new Set((lostToRows ?? []).map((r) => r.lost_to))].sort((a, b) => a.localeCompare(b));

  return (
    <div className="mx-auto w-full max-w-7xl p-4 sm:p-8">
      <div className="mb-4 flex items-center gap-4">
        <Link href="/jobs" className="flex items-center gap-1.5 text-sm font-medium text-ink-soft transition hover:text-ink">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Jobs
        </Link>
        <Link href="/jobs/live" className="text-sm font-medium text-accent hover:text-accent-hover">
          Live jobs
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-3">
            <span className="font-mono text-sm text-ink-faint">{job.job_number ?? "No job number yet"}</span>
            <StatusLabel status={job.status} />
          </div>
          <h1 className="text-3xl font-bold text-ink">{job.name}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {job.client?.name ?? "No client set"}
            {job.lead_source && <span className="text-ink-faint"> · Lead source: {job.lead_source}</span>}
          </p>
          {job.status === "lost" && (
            <p className="mt-1 text-sm text-ink-soft">
              Lost to {job.lost_to ?? "unknown"}
              {job.lost_at && ` on ${new Date(job.lost_at).toLocaleDateString("en-NZ")}`}
            </p>
          )}
          {job.status === "complete" && job.completed_at && (
            <p className="mt-1 text-sm text-ink-soft">Completed {new Date(job.completed_at).toLocaleDateString("en-NZ")}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <EditJobDetailsButton
            jobId={job.id}
            initial={{
              name: job.name,
              description: job.description,
              clientId: job.client_id,
              quotedSellTotal: job.quoted_sell_total,
              quotedHours: job.quoted_hours,
              leadBy: job.lead_by,
              leadByUserId: job.lead_by_user_id,
              leadSource: job.lead_source,
            }}
            clients={clients ?? []}
            leadOptions={(leadUsers ?? []).map((u) => ({ id: u.id, name: u.full_name }))}
          />
          {(job.status === "draft" || job.status === "quoted" || job.status === "on_hold") && (
            <>
              <MarkAsWonButton jobId={job.id} />
              <MarkAsLostButton jobId={job.id} lostToOptions={lostToOptions} />
            </>
          )}
          {(job.status === "won" || job.status === "scheduled") && <MarkAsInProgressButton jobId={job.id} />}
          {job.status === "in_progress" && <MarkAsCompleteButton jobId={job.id} />}
          <JobStatusControl
            jobId={job.id}
            currentStatus={job.status}
            currentLostTo={job.lost_to}
            lostToOptions={lostToOptions}
            salesTeam={salesTeam}
          />
          <DeleteJobButton jobId={job.id} jobName={job.name} costLineCount={costLineCount ?? 0} />
        </div>
      </div>

      {needsSalesPerson(job) && <AssignSalesPersonBanner jobId={job.id} salesTeam={salesTeam} />}

      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="lg:w-52 lg:shrink-0">
          <JobSubNav jobId={job.id} badges={{ variations: pendingVariations ?? 0 }} />
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
