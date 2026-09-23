// Supplier invoices — Resene invoices are parsed straight from an uploaded
// PDF and matched to a job by PO number (see src/lib/resene/parseInvoice.ts
// and the upload route); any other supplier is entered by hand (no parser
// exists for their layout yet - see createManualInvoiceAction). Unmatched
// invoices are listed here for manual linking; approving individual lines
// into actual costs happens on the job's own page.
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAppAccess } from "@/lib/auth/requireAppAccess";
import { Panel } from "@/components/ui";
import { InvoiceUploadForm } from "@/components/jobs/InvoiceUploadForm";
import { AssignInvoiceJobRow } from "@/components/jobs/AssignInvoiceJobRow";
import { MatchedInvoiceRow } from "@/components/jobs/MatchedInvoiceRow";
import { SplitInvoiceRow } from "@/components/jobs/SplitInvoiceRow";

type InvoiceRow = {
  id: string;
  invoice_number: string | null;
  customer_po_number: string | null;
  invoice_date: string | null;
  total: number | null;
  split: boolean;
  supplier: { name: string } | null;
  job: { id: string; name: string; job_number: string | null } | null;
};

type InvoiceLineRow = {
  id: string;
  invoice_id: string;
  description: string;
  subtotal: number;
  job_id: string | null;
};

function fmtMoney(n: number) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 2,
  }).format(n);
}

export default async function SupplierInvoicesPage() {
  const supabase = await requireAppAccess("jobs");

  const [{ data: invoices }, { data: jobs }, { data: suppliers }, { data: orders }, { data: sites }, { data: entries }] =
    await Promise.all([
      supabase
        .from("supplier_invoices")
        .select(
          "id, invoice_number, customer_po_number, invoice_date, total, split, supplier:suppliers(name), job:jobs(id, name, job_number)"
        )
        .order("created_at", { ascending: false })
        .limit(200)
        .returns<InvoiceRow[]>(),
      supabase
        .from("jobs")
        .select("id, name, job_number")
        .returns<{ id: string; name: string; job_number: string | null }[]>(),
      supabase
        .from("suppliers")
        .select("id, name")
        .order("name")
        .returns<{ id: string; name: string }[]>(),
      // Which job an order belongs to, and when — one of the two "latest
      // activity" signals below.
      supabase
        .from("orders")
        .select("job_id, order_date")
        .not("job_id", "is", null)
        .returns<{ job_id: string; order_date: string }[]>(),
      // Timesheets don't link to a job directly — staff clock in at a
      // site, and a site belongs to a job — so this is the join needed to
      // trace clock-ins back to a job.
      supabase
        .from("sites")
        .select("id, job_id")
        .not("job_id", "is", null)
        .returns<{ id: string; job_id: string }[]>(),
      supabase
        .from("timesheet_entries")
        .select("site_id, clock_in_at")
        .order("clock_in_at", { ascending: false })
        .limit(2000)
        .returns<{ site_id: string; clock_in_at: string }[]>(),
    ]);

  // Latest activity per job, combining whichever of Orders/Timesheets is
  // more recent — used only to sort the "needs a job" picker below so the
  // jobs actually being worked on right now float to the top instead of
  // scrolling through every job alphabetically.
  const siteJob = new Map((sites ?? []).map((s) => [s.id, s.job_id]));
  const latestActivity = new Map<string, string>();
  function bumpLatest(jobId: string | null | undefined, when: string | null | undefined) {
    if (!jobId || !when) return;
    const current = latestActivity.get(jobId);
    if (!current || when > current) latestActivity.set(jobId, when);
  }
  for (const o of orders ?? []) bumpLatest(o.job_id, o.order_date);
  for (const e of entries ?? []) bumpLatest(siteJob.get(e.site_id), e.clock_in_at);

  const jobsForPicker = [...(jobs ?? [])].sort((a, b) => {
    const la = latestActivity.get(a.id);
    const lb = latestActivity.get(b.id);
    if (la && lb) return lb.localeCompare(la);
    if (la) return -1;
    if (lb) return 1;
    return a.name.localeCompare(b.name);
  });
  const jobById = new Map(jobsForPicker.map((j) => [j.id, j]));

  const rows = invoices ?? [];
  const unmatched = rows.filter((r) => !r.job && !r.split);
  const splitInvoices = rows.filter((r) => r.split);
  const matched = rows.filter((r) => r.job);

  // Lines are only needed for invoices that offer per-line job assignment
  // (unmatched, to tick "split across jobs") or already show one (split) —
  // a plain matched invoice doesn't need its lines fetched at all here.
  const linesNeededFor = [...unmatched, ...splitInvoices].map((r) => r.id);
  const { data: lineRows } =
    linesNeededFor.length > 0
      ? await supabase
          .from("supplier_invoice_lines")
          .select("id, invoice_id, description, subtotal, job_id")
          .in("invoice_id", linesNeededFor)
          .order("line_no")
          .returns<InvoiceLineRow[]>()
      : { data: [] as InvoiceLineRow[] };
  const linesByInvoice = new Map<string, InvoiceLineRow[]>();
  for (const l of lineRows ?? []) {
    const list = linesByInvoice.get(l.invoice_id) ?? [];
    list.push(l);
    linesByInvoice.set(l.invoice_id, list);
  }

  return (
    <div className="mx-auto w-full max-w-3xl p-8">
      <Link
        href="/jobs"
        className="mb-4 flex items-center gap-1.5 text-sm font-medium text-ink-soft transition hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Jobs
      </Link>

      <h1 className="mb-6 text-3xl font-bold text-ink">Supplier Invoices</h1>

      <InvoiceUploadForm suppliers={suppliers ?? []} />

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
                supplierName={inv.supplier?.name ?? null}
                customerPoNumber={inv.customer_po_number}
                jobs={jobsForPicker}
                lines={(linesByInvoice.get(inv.id) ?? []).map((l) => ({
                  id: l.id,
                  description: l.description,
                  subtotal: l.subtotal,
                }))}
              />
            ))}
          </div>
        </Panel>
      )}

      {splitInvoices.length > 0 && (
        <Panel className="mb-6 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-faint">
            Split across jobs ({splitInvoices.length})
          </h2>
          <div className="space-y-3">
            {splitInvoices.map((inv) => (
              <SplitInvoiceRow
                key={inv.id}
                invoiceId={inv.id}
                invoiceNumber={inv.invoice_number}
                supplierName={inv.supplier?.name ?? null}
                jobs={jobsForPicker}
                lines={(linesByInvoice.get(inv.id) ?? []).map((l) => ({
                  id: l.id,
                  description: l.description,
                  subtotal: l.subtotal,
                  job: l.job_id ? jobById.get(l.job_id) ?? null : null,
                }))}
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
              <MatchedInvoiceRow
                key={inv.id}
                invoiceId={inv.id}
                invoiceNumber={inv.invoice_number}
                supplierName={inv.supplier?.name ?? null}
                total={inv.total != null ? fmtMoney(inv.total) : null}
                job={inv.job!}
                jobs={jobsForPicker}
              />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
