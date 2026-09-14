// Job detail — budget vs actual, read straight off the
// job_budget_vs_actual view, editable core details, plus a "Mark as won"
// action for jobs still in draft/quoted. Gated by requireAppAccess("jobs").
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAppAccess } from "@/lib/auth/requireAppAccess";
import { Panel, StatusLabel, Money, SummaryStat, LedgerTable } from "@/components/ui";
import { MarkAsWonButton } from "@/components/jobs/MarkAsWonButton";
import { MarkAsLostButton } from "@/components/jobs/MarkAsLostButton";
import { MarkAsInProgressButton } from "@/components/jobs/MarkAsInProgressButton";
import { MarkAsCompleteButton } from "@/components/jobs/MarkAsCompleteButton";
import { JobStatusControl } from "@/components/jobs/JobStatusControl";
import { EditJobDetailsButton } from "@/components/jobs/EditJobDetailsButton";
import { AddCategoryButton } from "@/components/jobs/AddCategoryButton";
import { AddCostLineButton } from "@/components/jobs/AddCostLineButton";
import {
  ReseneInvoiceCostsSection,
  type ReseneInvoiceLineRow,
  type AwaitingInvoiceOrderRow,
} from "@/components/jobs/ReseneInvoiceCostsSection";

type JobRow = {
  id: string;
  job_number: string | null;
  name: string;
  status: "draft" | "quoted" | "won" | "in_progress" | "complete" | "lost";
  quoted_sell_total: number | null;
  quoted_hours: number | null;
  lead_by: string | null;
  lead_by_user_id: string | null;
  won_at: string | null;
  lost_at: string | null;
  lost_to: string | null;
  client_id: string | null;
  client: { name: string } | null;
};

type BudgetVsActualRow = {
  category_id: string;
  category_label: string;
  budgeted_amount: number;
  actual_amount: number;
  variance_amount: number;
};

type TotalsRow = {
  actual_total: number;
  hours_actual: number;
};

function fmtMoney(n: number) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 0,
  }).format(n);
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await requireAppAccess("jobs");

  const { data: job } = await supabase
    .from("jobs")
    .select(
      "id, job_number, name, status, quoted_sell_total, quoted_hours, lead_by, lead_by_user_id, won_at, lost_at, lost_to, client_id, client:clients(name)"
    )
    .eq("id", id)
    .single<JobRow>();

  if (!job) notFound();

  const [
    { data: budgetRows },
    { data: jobTotals },
    { data: clients },
    { data: leadUsers },
    { data: invoiceLines },
    { data: reseneOrders },
  ] = await Promise.all([
    supabase
      .from("job_budget_vs_actual")
      .select("category_id, category_label, budgeted_amount, actual_amount, variance_amount")
      .eq("job_id", id)
      .order("sort_order")
      .returns<BudgetVsActualRow[]>(),
    supabase
      .from("job_totals")
      .select("actual_total, hours_actual")
      .eq("job_id", id)
      .maybeSingle<TotalsRow>(),
    supabase
      .from("clients")
      .select("id, name")
      .order("name")
      .returns<{ id: string; name: string }[]>(),
    supabase
      .from("profiles")
      .select("id, full_name")
      .in("role", ["admin", "sales"])
      .order("full_name")
      .returns<{ id: string; full_name: string }[]>(),
    supabase
      .from("resene_invoice_lines")
      .select(
        "id, category_id, description, subtotal, status, invoice:resene_invoices!inner(invoice_number, job_id)"
      )
      .eq("invoice.job_id", id)
      .returns<ReseneInvoiceLineRow[]>(),
    supabase
      .from("orders")
      .select("id, supplier, project, project_number, order_date")
      .eq("job_id", id)
      .ilike("supplier", "%resene%")
      .returns<AwaitingInvoiceOrderRow[]>(),
  ]);

  // "Awaiting invoice" = a Resene order on this job whose project_number
  // has no matching resene_invoices.customer_po_number yet — informational
  // only, computed here rather than in SQL since it's a small, job-scoped list.
  const { data: matchedPoNumbers } = await supabase
    .from("resene_invoices")
    .select("customer_po_number")
    .not("customer_po_number", "is", null);
  const matchedSet = new Set((matchedPoNumbers ?? []).map((r) => r.customer_po_number));
  const awaitingInvoice = (reseneOrders ?? []).filter(
    (o) => !o.project_number || !matchedSet.has(o.project_number)
  );

  const hoursActual = jobTotals?.hours_actual ?? 0;
  const quotedTotal = job.quoted_sell_total ?? 0;
  const profit = quotedTotal > 0 ? quotedTotal - (jobTotals?.actual_total ?? 0) : null;
  const margin = quotedTotal > 0 && profit != null ? profit / quotedTotal : null;

  const rows = budgetRows ?? [];
  const categoryOptions = rows.map((r) => ({ id: r.category_id, label: r.category_label }));

  const totals = rows.reduce(
    (acc, r) => ({
      budgeted: acc.budgeted + Number(r.budgeted_amount),
      actual: acc.actual + Number(r.actual_amount),
    }),
    { budgeted: 0, actual: 0 }
  );
  const totalVariance = totals.actual - totals.budgeted;

  return (
    <div className="mx-auto w-full max-w-4xl p-8">
      <Link
        href="/jobs"
        className="mb-4 flex items-center gap-1.5 text-sm font-medium text-ink-soft transition hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Jobs
      </Link>

      <div className="mb-8 flex items-start justify-between">
        <div>
          <div className="mb-1 flex items-center gap-3">
            <span className="font-mono text-sm text-ink-faint">
              {job.job_number ?? "No job number yet"}
            </span>
            <StatusLabel status={job.status} />
          </div>
          <h1 className="text-3xl font-bold text-ink">{job.name}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {job.client?.name ?? "No client set"}
          </p>
          {job.status === "lost" && (
            <p className="mt-1 text-sm text-ink-soft">
              Lost to {job.lost_to ?? "—"}
              {job.lost_at && ` on ${new Date(job.lost_at).toLocaleDateString("en-NZ")}`}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <EditJobDetailsButton
            jobId={job.id}
            initial={{
              name: job.name,
              clientId: job.client_id,
              quotedSellTotal: job.quoted_sell_total,
              quotedHours: job.quoted_hours,
              leadBy: job.lead_by,
              leadByUserId: job.lead_by_user_id,
            }}
            clients={clients ?? []}
            leadOptions={(leadUsers ?? []).map((u) => ({ id: u.id, name: u.full_name }))}
          />
          {(job.status === "draft" || job.status === "quoted") && (
            <>
              <MarkAsWonButton jobId={job.id} />
              <MarkAsLostButton jobId={job.id} />
            </>
          )}
          {job.status === "won" && <MarkAsInProgressButton jobId={job.id} />}
          {job.status === "in_progress" && <MarkAsCompleteButton jobId={job.id} />}
          <JobStatusControl
            jobId={job.id}
            currentStatus={job.status}
            currentLostTo={job.lost_to}
          />
        </div>
      </div>

      <div className="mb-4 flex border-b border-line pb-6">
        <SummaryStat label="Quoted" value={job.quoted_sell_total != null ? fmtMoney(job.quoted_sell_total) : "—"} />
        <SummaryStat label="Budgeted" value={fmtMoney(totals.budgeted)} />
        <SummaryStat label="Actual" value={fmtMoney(totals.actual)} />
        <div>
          <div className="text-2xl font-bold tabular-nums">
            <Money value={totalVariance} variant="variance" />
          </div>
          <div className="mt-1 text-sm text-ink-soft">Variance</div>
        </div>
      </div>

      <div className="mb-8 flex border-b border-line pb-6">
        <SummaryStat
          label="Profit"
          value={profit != null ? fmtMoney(profit) : "—"}
        />
        <SummaryStat
          label="Margin"
          value={margin != null ? `${(margin * 100).toFixed(0)}%` : "—"}
        />
        <SummaryStat
          label="Hours"
          value={job.quoted_hours != null ? `${hoursActual.toFixed(0)} / ${job.quoted_hours.toFixed(0)}` : hoursActual.toFixed(0)}
        />
      </div>

      <ReseneInvoiceCostsSection
        jobId={job.id}
        lines={invoiceLines ?? []}
        awaitingInvoice={awaitingInvoice}
        categories={categoryOptions}
      />

      <Panel className="p-4">
        <LedgerTable headers={["Category", "Budgeted", "Actual", "Variance"]}>
          {rows.map((r) => (
            <tr key={r.category_id}>
              <td className="py-2 text-ink">{r.category_label}</td>
              <td className="py-2 pl-4 text-right">
                <Money value={Number(r.budgeted_amount)} />
              </td>
              <td className="py-2 pl-4 text-right">
                <Money value={Number(r.actual_amount)} />
              </td>
              <td className="py-2 pl-4 text-right">
                <Money value={Number(r.variance_amount)} variant="variance" />
              </td>
            </tr>
          ))}
        </LedgerTable>
        <div className="mt-4 flex items-center gap-2 border-t border-line pt-4">
          <AddCostLineButton jobId={job.id} categories={categoryOptions} />
          <AddCategoryButton jobId={job.id} />
        </div>
      </Panel>
    </div>
  );
}
