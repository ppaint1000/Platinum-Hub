// Lead sources - go down every quote and job and pick where it came from,
// so Marketing ROI and Lead Conversions can split the work by source.
// Admins only (saving uses requireAdmin).
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { LeadSourcePicker, type LeadSourceJob } from "@/components/jobs/LeadSourcePicker";
import { jobStatusLabel } from "@/design/tailwind.tokens";

type Row = {
  id: string;
  job_number: string | null;
  name: string;
  status: string;
  quoted_sell_total: number | null;
  quoted_at: string | null;
  created_at: string;
  lead_source: string | null;
  client_id: string | null;
  client: { name: string } | null;
};

export default async function LeadSourcesPage() {
  const supabase = await requireAdmin();
  const { data } = await supabase
    .from("jobs")
    .select("id, job_number, name, status, quoted_sell_total, quoted_at, created_at, lead_source, client_id, client:clients(name)")
    .neq("status", "draft")
    .returns<Row[]>();

  const jobs: LeadSourceJob[] = (data ?? [])
    .map((j) => ({
      id: j.id,
      label: j.job_number ? `${j.job_number} ${j.name}` : j.name,
      clientId: j.client_id,
      clientName: j.client?.name ?? null,
      status: j.status,
      date: j.quoted_at ?? j.created_at,
      value: Number(j.quoted_sell_total ?? 0),
      leadSource: j.lead_source,
    }))
    // Newest first.
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  return (
    <div className="mx-auto w-full max-w-6xl p-4 sm:p-8">
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Link href="/jobs" className="text-sm font-medium text-ink-soft hover:text-ink">
          ← Jobs
        </Link>
        <Link href="/reports/marketing" className="text-sm font-medium text-accent hover:text-accent-hover">
          Marketing ROI
        </Link>
      </div>
      <h1 className="text-3xl font-bold text-ink">Lead sources</h1>
      <p className="mb-6 text-sm text-ink-soft">
        Pick where each job&apos;s enquiry came from - it saves straight away. Marketing ROI and Lead Conversions then show which sources bring in the work.
      </p>
      <LeadSourcePicker jobs={jobs} statusLabel={jobStatusLabel} />
    </div>
  );
}
