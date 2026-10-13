// A job's Invoicing: the contract value (quote plus approved variations),
// what's been claimed from the customer and what's left to claim.
import { requireAppAccess } from "@/lib/auth/requireAppAccess";
import { SummaryStat } from "@/components/ui";
import { ClaimsManager } from "@/components/jobs/ClaimsManager";
import { CheckXeroButton } from "@/components/jobs/CheckXeroButton";
import { fetchClaims, fetchVariations, money, variationTotals } from "@/lib/jobs/jobFinance";

export default async function JobInvoicingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await requireAppAccess("jobs");

  const [{ data: job }, variations, claims] = await Promise.all([
    supabase.from("jobs").select("quoted_sell_total, job_number").eq("id", id).single<{ quoted_sell_total: number | null; job_number: string | null }>(),
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
      <div className="rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm">
        <p className="text-ink">
          <b>Invoicing in Xero?</b> Put <b className="font-mono">{job?.job_number ?? "the job number"}</b> in the invoice&apos;s <b>Reference</b> and it appears
          here once approved in Xero - checked every morning, or now:
        </p>
        <div className="mt-2">
          <CheckXeroButton />
        </div>
      </div>
      <ClaimsManager jobId={id} claims={claims} contractValue={contractValue} />
      <p className="text-xs text-ink-soft">
        Claims from Xero are marked Xero and change when the invoice changes in Xero. Anything not invoiced through Xero can be added here by hand (excl GST).
        Claims drive Claimed to date and Left to claim on Live jobs, and the Forecast.
      </p>
    </div>
  );
}
