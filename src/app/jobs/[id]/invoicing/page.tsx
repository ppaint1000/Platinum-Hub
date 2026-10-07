// A job's Invoicing: the contract value (quote plus approved variations),
// what's been claimed from the customer and what's left to claim.
import { requireAppAccess } from "@/lib/auth/requireAppAccess";
import { SummaryStat } from "@/components/ui";
import { ClaimsManager } from "@/components/jobs/ClaimsManager";
import { fetchClaims, fetchVariations, money, variationTotals } from "@/lib/jobs/jobFinance";

export default async function JobInvoicingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await requireAppAccess("jobs");

  const [{ data: job }, variations, claims] = await Promise.all([
    supabase.from("jobs").select("quoted_sell_total").eq("id", id).single<{ quoted_sell_total: number | null }>(),
    fetchVariations(supabase, [id]),
    fetchClaims(supabase, [id]),
  ]);

  const contractValue = Number(job?.quoted_sell_total ?? 0) + variationTotals(variations).approvedAmount;
  const claimed = claims.reduce((s, c) => s + c.amount, 0);
  const pct = contractValue > 0 ? Math.round((claimed / contractValue) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-y-4 border-b border-line pb-6">
        <SummaryStat label="Contract value" value={money(contractValue)} />
        <SummaryStat label={`Claimed (${pct}%)`} value={money(claimed)} />
        <SummaryStat label="Left to claim" value={money(contractValue - claimed)} />
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-[#ECEAE3]">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(100, pct)}%`, background: claimed > contractValue ? "#B91C1C" : "#15803D" }}
        />
      </div>
      <ClaimsManager jobId={id} claims={claims} contractValue={contractValue} />
      <p className="text-xs text-ink-soft">
        Record each invoice you send the customer here (excl GST). It drives Claimed to date and Left to claim on Live jobs, and the Forecast.
      </p>
    </div>
  );
}
