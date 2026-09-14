// Resene invoices — upload a PDF, it's parsed and matched to a job by PO
// number (see src/lib/resene/parseInvoice.ts and the upload route).
// Unmatched invoices are listed here for manual linking; approving
// individual lines into actual costs happens on the job's own page.
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAppAccess } from "@/lib/auth/requireAppAccess";
import { Panel } from "@/components/ui";
import { InvoiceUploadForm } from "@/components/jobs/InvoiceUploadForm";
import { AssignInvoiceJobRow } from "@/components/jobs/AssignInvoiceJobRow";

type InvoiceRow = {
  id: string;
  invoice_number: string | null;
  customer_po_number: string | null;
  invoice_date: string | null;
  total: number | null;
  job: { id: string; name: string; job_number: string | null } | null;
};

function fmtMoney(n: number) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 2,
  }).format(n);
}

export default async function ReseneInvoicesPage() {
  const supabase = await requireAppAccess("jobs");

  const [{ data: invoices }, { data: jobs }] = await Promise.all([
    supabase
      .from("resene_invoices")
      .select(
        "id, invoice_number, customer_po_number, invoice_date, total, job:jobs(id, name, job_number)"
      )
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<InvoiceRow[]>(),
    supabase
      .from("jobs")
      .select("id, name, job_number")
      .order("name")
      .returns<{ id: string; name: string; job_number: string | null }[]>(),
  ]);

  const rows = invoices ?? [];
  const unmatched = rows.filter((r) => !r.job);
  const matched = rows.filter((r) => r.job);

  return (
    <div className="mx-auto w-full max-w-3xl p-8">
      <Link
        href="/jobs"
        className="mb-4 flex items-center gap-1.5 text-sm font-medium text-ink-soft transition hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Jobs
      </Link>

      <h1 className="mb-6 text-3xl font-bold text-ink">Resene Invoices</h1>

      <InvoiceUploadForm />

      {unmatched.length > 0 && (
        <Panel className="mb-6 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-faint">
            Needs a job ({unmatched.length})
          </h2>
          <div className="space-y-2">
            {unmatched.map((inv) => (
              <AssignInvoiceJobRow
                key={inv.id}
                invoiceId={inv.id}
                invoiceNumber={inv.invoice_number}
                customerPoNumber={inv.customer_po_number}
                jobs={jobs ?? []}
              />
            ))}
          </div>
        </Panel>
      )}

      <Panel className="p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-faint">
          Recent invoices ({matched.length})
        </h2>
        {matched.length === 0 ? (
          <p className="text-sm text-ink-soft">No matched invoices yet.</p>
        ) : (
          <div className="space-y-1">
            {matched.map((inv) => (
              <Link
                key={inv.id}
                href={`/jobs/${inv.job?.id}`}
                className="flex items-center justify-between rounded px-1 py-2 text-sm transition hover:bg-accent-soft/40"
              >
                <span className="text-ink">
                  Invoice {inv.invoice_number ?? "—"}
                  <span className="text-ink-faint"> — {inv.job?.name}</span>
                </span>
                <span className="text-ink-soft">
                  {inv.total != null ? fmtMoney(inv.total) : "—"}
                </span>
              </Link>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
