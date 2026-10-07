// A job's variations - extra (or less) work agreed with the customer.
import { requireAppAccess } from "@/lib/auth/requireAppAccess";
import { SummaryStat } from "@/components/ui";
import { VariationsManager } from "@/components/jobs/VariationsManager";
import { fetchVariations, money, variationTotals } from "@/lib/jobs/jobFinance";

export default async function JobVariationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await requireAppAccess("jobs");

  const [{ data: job }, { data: categories }, variations] = await Promise.all([
    supabase.from("jobs").select("quoted_sell_total").eq("id", id).single<{ quoted_sell_total: number | null }>(),
    supabase.from("job_categories").select("id, label").order("sort_order").returns<{ id: string; label: string }[]>(),
    fetchVariations(supabase, [id]),
  ]);

  const v = variationTotals(variations);
  const quoted = Number(job?.quoted_sell_total ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-y-4 border-b border-line pb-6">
        <SummaryStat label="Quote" value={money(quoted)} />
        <SummaryStat label="Approved variations" value={money(v.approvedAmount)} />
        <SummaryStat label="Contract value" value={money(quoted + v.approvedAmount)} />
        <SummaryStat label={`Waiting for approval (${v.pendingCount})`} value={money(v.pendingAmount)} />
      </div>
      <p className="text-sm text-ink-soft">
        Approved variations add their price to the contract value, and any extra cost budget and hours to the job&apos;s budget.
      </p>
      <VariationsManager jobId={id} variations={variations} categories={categories ?? []} />
    </div>
  );
}
