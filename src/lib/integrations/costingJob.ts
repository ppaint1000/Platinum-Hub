import { createAdminClient } from "@/lib/supabase/admin";
import { mapQuoteStatusToJobStatus, type QuoteStatus } from "@/lib/integrations/quotesWebhook";

export type CostingJob = {
  quoteId: string;
  clientId: string | null;
  name: string;
  status: QuoteStatus;
  quotedSellTotal: number | null;
  quotedHours: number | null;
  quotedAt?: string | null;
  // The crew's work order link (/w/<token>), shown on the job's site when
  // clocking in.
  workOrderUrl?: string | null;
  // Whose costing it is - becomes the job's lead on a new job.
  ownerId?: string | null;
};

// A costing saved: its job in the Hub (made on first save, kept up to date
// after). Called by the Costing pages and the old Measures webhook route.
export async function upsertJobFromCosting(job: CostingJob) {
  const admin = createAdminClient();

  // A job that has moved past quoting (won, in production, on hold, lost)
  // keeps its status - re-saving the costing never moves it back. The
  // Production board and admins move it from there.
  const { data: existing } = await admin
    .from("jobs")
    .select("status")
    .eq("source_quote_id", job.quoteId)
    .maybeSingle<{ status: string }>();
  const keepStatus = !!existing && existing.status !== "draft" && existing.status !== "quoted";

  return admin
    .from("jobs")
    .upsert(
      {
        source_quote_id: job.quoteId,
        client_id: job.clientId,
        name: job.name.trim(),
        ...(keepStatus ? {} : { status: mapQuoteStatusToJobStatus(job.status) }),
        quoted_sell_total: job.quotedSellTotal,
        quoted_hours: job.quotedHours,
        quoted_at: job.quotedAt ?? null,
        ...(job.workOrderUrl ? { work_order_url: job.workOrderUrl } : {}),
        ...(!existing && job.ownerId ? { lead_by_user_id: job.ownerId } : {}),
      },
      { onConflict: "source_quote_id" }
    )
    .select("id, job_number")
    .single<{ id: string; job_number: string | null }>();
}
