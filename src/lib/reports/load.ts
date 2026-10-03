// Everything the Reports read: every job with its client, salesperson,
// dates, proposal activity and its cost/hours totals. Read with the
// viewer's own session (Reports are admin-only, like Jobs).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobStatus } from "@/lib/jobs/status";

type Row = {
  id: string;
  job_number: string | null;
  name: string;
  status: JobStatus;
  quoted_sell_total: number | null;
  quoted_hours: number | null;
  lead_source: string | null;
  lead_by_user_id: string | null;
  created_at: string;
  quoted_at: string | null;
  won_at: string | null;
  lost_at: string | null;
  lost_to: string | null;
  on_hold_at: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  invoiced_at: string | null;
  paid_at: string | null;
  proposal_sent_at: string | null;
  proposal_viewed_at: string | null;
  proposal_view_count: number | null;
  proposal_accepted_at: string | null;
  client: { name: string } | { name: string }[] | null;
  lead: { full_name: string } | { full_name: string }[] | null;
};

export type ReportJob = Omit<Row, "client" | "lead"> & {
  clientName: string | null;
  person: string | null;
  value: number;
  cost: number; // actual cost so far (job_totals)
  hoursActual: number; // approved timesheet hours (job_totals)
};

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

export async function loadReportJobs(supabase: SupabaseClient): Promise<ReportJob[]> {
  const [{ data: jobs, error }, { data: totals }] = await Promise.all([
    supabase
      .from("jobs")
      .select(
        "id, job_number, name, status, quoted_sell_total, quoted_hours, lead_source, lead_by_user_id, created_at, quoted_at, won_at, lost_at, lost_to, on_hold_at, scheduled_at, completed_at, invoiced_at, paid_at, proposal_sent_at, proposal_viewed_at, proposal_view_count, proposal_accepted_at, client:clients(name), lead:profiles!lead_by_user_id(full_name)"
      )
      .returns<Row[]>(),
    supabase
      .from("job_totals")
      .select("job_id, actual_total, hours_actual")
      .returns<{ job_id: string; actual_total: number; hours_actual: number }[]>(),
  ]);
  if (error) throw new Error(error.message);
  const totalsByJob = new Map((totals ?? []).map((t) => [t.job_id, t]));

  return (jobs ?? []).map(({ client, lead, ...j }) => {
    const t = totalsByJob.get(j.id);
    return {
      ...j,
      clientName: one(client)?.name ?? null,
      person: one(lead)?.full_name ?? null,
      value: Number(j.quoted_sell_total ?? 0),
      cost: Number(t?.actual_total ?? 0),
      hoursActual: Number(t?.hours_actual ?? 0),
    };
  });
}
