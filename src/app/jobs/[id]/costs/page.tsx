// A job's Budget & costs: budget vs actual by category (read straight off
// the job_budget_vs_actual view), Resene invoices and every cost line.
import Link from "next/link";
import { requireAppAccess } from "@/lib/auth/requireAppAccess";
import { Money, SummaryStat } from "@/components/ui";
import {
  ReseneInvoiceCostsSection,
  type ReseneInvoiceLineRow,
  type AwaitingInvoiceOrderRow,
} from "@/components/jobs/ReseneInvoiceCostsSection";
import { CostLinesSection, type CostLineRow } from "@/components/jobs/CostLinesSection";
import { JobBudgetTable, type CategoryBudgetRow } from "@/components/jobs/JobBudgetTable";
import { jobMargin } from "@/lib/jobs/margin";
import { money } from "@/lib/jobs/jobFinance";

type BudgetVsActualRow = {
  category_id: string;
  category_label: string;
  budgeted_amount: number;
  actual_amount: number;
  variance_amount: number;
};

type ActualCostRow = {
  id: string;
  category_id: string;
  description: string | null;
  amount: number;
  incurred_at: string;
  resene_invoice_line_id: string | null;
  category: { label: string } | null;
};

export default async function JobCostsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await requireAppAccess("jobs");

  const [
    { data: job },
    { data: budgetRows },
    { data: jobTotals },
    { data: invoiceLines },
    { data: reseneOrders },
    { data: actualCosts },
    { data: otherJobs },
    { data: hoursWaiting },
    { data: matchedPoNumbers },
  ] = await Promise.all([
    supabase.from("jobs").select("quoted_sell_total, quoted_hours").eq("id", id).single<{ quoted_sell_total: number | null; quoted_hours: number | null }>(),
    supabase
      .from("job_budget_vs_actual")
      .select("category_id, category_label, budgeted_amount, actual_amount, variance_amount")
      .eq("job_id", id)
      .order("sort_order")
      .returns<BudgetVsActualRow[]>(),
    supabase.from("job_totals").select("actual_total, hours_actual").eq("job_id", id).maybeSingle<{ actual_total: number; hours_actual: number }>(),
    supabase
      .from("supplier_invoice_lines")
      .select("id, category_id, description, subtotal, status, invoice:supplier_invoices(invoice_number)")
      .eq("job_id", id)
      .returns<ReseneInvoiceLineRow[]>(),
    supabase
      .from("orders")
      .select("id, supplier, project, project_number, order_date")
      .eq("job_id", id)
      .ilike("supplier", "%resene%")
      .returns<AwaitingInvoiceOrderRow[]>(),
    supabase
      .from("job_actual_costs")
      .select("id, category_id, description, amount, incurred_at, resene_invoice_line_id, category:job_categories(label)")
      .eq("job_id", id)
      .order("incurred_at", { ascending: false })
      .returns<ActualCostRow[]>(),
    supabase
      .from("jobs")
      .select("id, name, job_number")
      .neq("id", id)
      .order("name")
      .returns<{ id: string; name: string; job_number: string | null }[]>(),
    // Timesheet hours on this job that an admin hasn't approved yet - not in
    // Labour or Hours until they are (see /jobs/hours).
    supabase.rpc("job_hours_pending", { p_job_id: id }),
    supabase.from("supplier_invoices").select("customer_po_number").not("customer_po_number", "is", null),
  ]);

  // "Awaiting invoice" = a Resene order on this job whose project_number
  // has no matching supplier_invoices.customer_po_number yet.
  const matchedSet = new Set((matchedPoNumbers ?? []).map((r) => r.customer_po_number));
  const awaitingInvoice = (reseneOrders ?? []).filter((o) => !o.project_number || !matchedSet.has(o.project_number));

  const waitingHours = Number(hoursWaiting ?? 0);
  const hoursActual = Number(jobTotals?.hours_actual ?? 0);
  const rows = budgetRows ?? [];
  const totals = rows.reduce(
    (acc, r) => ({ budgeted: acc.budgeted + Number(r.budgeted_amount), actual: acc.actual + Number(r.actual_amount) }),
    { budgeted: 0, actual: 0 }
  );
  const { profit, margin, estimated } = jobMargin({
    quoted: job?.quoted_sell_total ?? 0,
    budgeted: totals.budgeted,
    actual: Number(jobTotals?.actual_total ?? 0),
  });
  const categoryOptions = rows.map((r) => ({ id: r.category_id, label: r.category_label }));

  const invoiceNumberByLineId = new Map((invoiceLines ?? []).map((l) => [l.id, l.invoice?.invoice_number ?? null]));
  const costLines: CostLineRow[] = (actualCosts ?? []).map((c) => ({
    id: c.id,
    categoryId: c.category_id,
    categoryLabel: c.category?.label ?? "—",
    description: c.description ?? "",
    amount: Number(c.amount),
    incurredAt: c.incurred_at,
    invoiceNumber: c.resene_invoice_line_id ? invoiceNumberByLineId.get(c.resene_invoice_line_id) ?? null : null,
    fromInvoice: !!c.resene_invoice_line_id,
  }));

  const categoryBudgetRows: CategoryBudgetRow[] = rows
    .filter((r) => Number(r.budgeted_amount) > 0 || Number(r.actual_amount) > 0)
    .map((r) => ({
      categoryId: r.category_id,
      categoryLabel: r.category_label,
      budgeted: Number(r.budgeted_amount),
      actual: Number(r.actual_amount),
      variance: Number(r.variance_amount),
    }));

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-y-4 border-b border-line pb-6">
        <SummaryStat label="Quoted" value={job?.quoted_sell_total != null ? money(job.quoted_sell_total) : "—"} />
        <SummaryStat label="Budgeted" value={money(totals.budgeted)} />
        <SummaryStat label="Actual" value={money(totals.actual)} />
        <div>
          <div className="text-2xl font-bold tabular-nums">
            <Money value={totals.actual - totals.budgeted} variant="variance" />
          </div>
          <div className="mt-1 text-sm text-ink-soft">Variance</div>
        </div>
      </div>

      <div className="mb-8 flex flex-wrap gap-y-4 border-b border-line pb-6">
        <SummaryStat label={estimated ? "Est. profit" : "Profit"} value={profit != null ? money(profit) : "—"} />
        <SummaryStat label={estimated ? "Est. margin" : "Margin"} value={margin != null ? `${(margin * 100).toFixed(0)}%` : "—"} />
        <SummaryStat
          label="Hours"
          value={job?.quoted_hours != null ? `${hoursActual.toFixed(0)} / ${job.quoted_hours.toFixed(0)}` : hoursActual.toFixed(0)}
        />
      </div>

      {waitingHours > 0 && (
        <Link
          href="/jobs/hours"
          className="-mt-4 mb-8 flex flex-wrap items-center gap-x-3 rounded-lg border border-[#E5484D]/40 bg-[#FDECEC] px-4 py-3 text-sm hover:bg-[#FBE0E0]"
        >
          <span className="font-semibold text-ink">{waitingHours.toFixed(1)} timesheet hours waiting for approval</span>
          <span className="text-ink-soft">Not in Labour or Hours until approved.</span>
          <span className="ml-auto font-semibold text-accent">Approve →</span>
        </Link>
      )}

      <JobBudgetTable
        jobId={id}
        rows={categoryBudgetRows}
        categoryLabels={categoryOptions.map((c) => c.label)}
        costLines={costLines}
        categories={categoryOptions}
        jobOptions={otherJobs ?? []}
      />

      <ReseneInvoiceCostsSection jobId={id} lines={invoiceLines ?? []} awaitingInvoice={awaitingInvoice} categories={categoryOptions} />

      <CostLinesSection jobId={id} lines={costLines} categories={categoryOptions} jobOptions={otherJobs ?? []} />
    </div>
  );
}
