// Unmatched Xero invoices - customer invoices raised in Xero whose Reference
// didn't name a job. Pick the job once and it's linked (later changes in
// Xero follow it), or dismiss it if it isn't for a job. Admins only.
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Panel } from "@/components/ui";
import { CheckXeroButton } from "@/components/jobs/CheckXeroButton";
import { UnmatchedInvoiceRow } from "./unmatched-row";
import { money } from "@/lib/jobs/jobFinance";

export default async function UnmatchedXeroInvoicesPage() {
  await requireAdmin();
  const db = createAdminClient();
  const [{ data: rows }, { data: jobs }] = await Promise.all([
    db.from("xero_unmatched_invoices").select("*").is("job_id", null).eq("dismissed", false).order("invoice_date", { ascending: false }),
    db
      .from("jobs")
      .select("id, job_number, name, client:clients(name)")
      .not("job_number", "is", null)
      .in("status", ["won", "scheduled", "in_progress", "complete", "invoiced", "paid"])
      .order("job_number", { ascending: false })
      .returns<{ id: string; job_number: string; name: string; client: { name: string } | null }[]>(),
  ]);
  const jobOptions = (jobs ?? []).map((j) => ({ id: j.id, label: `${j.job_number} ${j.name}${j.client?.name ? ` (${j.client.name})` : ""}` }));

  return (
    <div className="mx-auto w-full max-w-5xl p-4 sm:p-8">
      <Link href="/jobs/live" className="text-sm font-medium text-ink-soft hover:text-ink">
        ← Live jobs
      </Link>
      <h1 className="mt-3 text-3xl font-bold text-ink">Unmatched Xero invoices</h1>
      <p className="mb-4 mt-1 text-sm text-ink-soft">
        Customer invoices in Xero whose Reference didn&apos;t include a job number. Pick the job and it&apos;s added to that job&apos;s claims. Next time, put the job
        number (e.g. 26-056) in the invoice&apos;s Reference and it&apos;s matched automatically.
      </p>
      <div className="mb-6">
        <CheckXeroButton />
      </div>
      {(rows ?? []).length === 0 ? (
        <Panel className="p-6 text-center text-ink-soft">Nothing waiting - every Xero invoice is matched to a job.</Panel>
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="px-3 py-2 font-semibold">Invoice</th>
                <th className="px-3 py-2 font-semibold">Customer</th>
                <th className="px-3 py-2 font-semibold">Reference</th>
                <th className="px-3 py-2 text-right font-semibold">Amount excl GST</th>
                <th className="px-3 py-2 font-semibold">Job</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((r) => (
                <UnmatchedInvoiceRow
                  key={r.xero_invoice_id as string}
                  invoice={{
                    id: r.xero_invoice_id as string,
                    number: (r.invoice_number as string) ?? "—",
                    date: r.invoice_date as string,
                    customer: (r.contact_name as string) ?? "—",
                    reference: (r.reference as string) ?? "",
                    amount: money(Number(r.subtotal ?? 0), true),
                  }}
                  jobOptions={jobOptions}
                />
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
