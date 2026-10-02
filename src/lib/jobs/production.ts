// The Production board: won jobs through to paid (see
// supabase/jobs_production_statuses.sql). Read through security-definer
// functions so supervisors - who can't read jobs directly - see the board,
// without $ values.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { JobStatus } from "./status";

export type ProductionJob = {
  id: string;
  job_number: string | null;
  name: string;
  client_name: string | null;
  status: JobStatus;
  value: number | null; // admins only
  won_at: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  invoiced_at: string | null;
  paid_at: string | null;
  updated_at: string;
};

// Paid jobs drop off the board after this long, so it doesn't fill up.
export const PAID_SHOWN_DAYS = 90;

export async function loadProductionJobs(supabase: SupabaseClient): Promise<ProductionJob[]> {
  const { data, error } = await supabase.rpc("production_jobs");
  if (error) throw new Error(error.message);
  const cutoff = Date.now() - PAID_SHOWN_DAYS * 86_400_000;
  return ((data ?? []) as ProductionJob[]).filter(
    (j) => j.status !== "paid" || !j.paid_at || Date.parse(j.paid_at) >= cutoff
  );
}

// Quotes still undecided 8 months on go On Hold. Run whenever an admin
// opens an admin page (like the absences check). Never breaks a page.
export async function runAutoOnHold(): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.rpc("jobs_auto_on_hold");
  } catch {
    // Tried again on the next page load.
  }
}

// Jobs at Job completed - the admin's cue to invoice.
export async function readyToInvoiceCount(): Promise<number> {
  try {
    const supabase = await createClient();
    const jobs = await loadProductionJobs(supabase);
    return jobs.filter((j) => j.status === "complete").length;
  } catch {
    return 0;
  }
}
