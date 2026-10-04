// The Dashboard's workflow row (like Jobber's): measures → costings →
// proposals → jobs, each with what needs doing; plus the jobs on the go and
// money invoiced but not yet paid.
import type { SupabaseClient } from "@supabase/supabase-js";

export type WorkflowData = {
  requests: { new: number; contacted: number };
  measures: { readyToCost: number; beingMeasured: number };
  costings: { toCheck: number; draft: number };
  proposals: { notOpened: number; opened: number; acceptedThisMonth: number };
  jobs: { toSchedule: number; scheduled: number; inProgress: number; readyToInvoice: number };
  owed: { count: number; value: number };
  onTheGo: { id: string; jobNumber: string | null; name: string; client: string | null; status: string }[];
};

type JobRow = {
  id: string;
  job_number: string | null;
  name: string;
  status: string;
  quoted_sell_total: number | null;
  client: { name: string } | { name: string }[] | null;
};

export async function loadWorkflow(supabase: SupabaseClient, monthKey: string): Promise<WorkflowData> {
  const [requestsRes, measuresRes, quotesRes, proposalsRes, jobsRes] = await Promise.all([
    // Before the requests table exists this just comes back empty.
    supabase.from("requests").select("status").returns<{ status: string }[]>(),
    supabase.from("site_measures").select("status").returns<{ status: string }[]>(),
    supabase.from("quotes").select("status").returns<{ status: string }[]>(),
    supabase
      .from("proposals")
      .select("sent_at, view_count, accepted_at, declined_at")
      .returns<{ sent_at: string | null; view_count: number; accepted_at: string | null; declined_at: string | null }[]>(),
    supabase
      .from("jobs")
      .select("id, job_number, name, status, quoted_sell_total, client:clients(name)")
      .in("status", ["won", "scheduled", "in_progress", "complete", "invoiced"])
      .order("name")
      .returns<JobRow[]>(),
  ]);

  const requests = requestsRes.data ?? [];
  const measures = measuresRes.data ?? [];
  const quotes = quotesRes.data ?? [];
  const proposals = proposalsRes.data ?? [];
  const jobs = jobsRes.data ?? [];
  const count = <T,>(xs: T[], f: (x: T) => boolean) => xs.filter(f).length;
  const invoiced = jobs.filter((j) => j.status === "invoiced");

  return {
    requests: {
      new: count(requests, (r) => r.status === "new"),
      contacted: count(requests, (r) => r.status === "contacted"),
    },
    measures: {
      readyToCost: count(measures, (m) => m.status === "finished"),
      beingMeasured: count(measures, (m) => m.status === "draft"),
    },
    costings: {
      toCheck: count(quotes, (q) => q.status === "draft_review"),
      draft: count(quotes, (q) => q.status === "draft"),
    },
    proposals: {
      notOpened: count(proposals, (p) => !!p.sent_at && !p.accepted_at && !p.declined_at && p.view_count === 0),
      opened: count(proposals, (p) => !p.accepted_at && !p.declined_at && p.view_count > 0),
      acceptedThisMonth: count(proposals, (p) => !!p.accepted_at && p.accepted_at.slice(0, 7) === monthKey),
    },
    jobs: {
      toSchedule: count(jobs, (j) => j.status === "won"),
      scheduled: count(jobs, (j) => j.status === "scheduled"),
      inProgress: count(jobs, (j) => j.status === "in_progress"),
      readyToInvoice: count(jobs, (j) => j.status === "complete"),
    },
    owed: { count: invoiced.length, value: invoiced.reduce((s, j) => s + Number(j.quoted_sell_total ?? 0), 0) },
    onTheGo: jobs
      .filter((j) => j.status === "in_progress" || j.status === "scheduled")
      .sort((a, b) => (a.status === b.status ? 0 : a.status === "in_progress" ? -1 : 1))
      .map((j) => ({
        id: j.id,
        jobNumber: j.job_number,
        name: j.name,
        client: (Array.isArray(j.client) ? j.client[0]?.name : j.client?.name) ?? null,
        status: j.status,
      })),
  };
}
