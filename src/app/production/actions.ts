"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { PRODUCTION_STAGES } from "@/lib/jobs/status";

// Moving a job on the Production board. Who can do what is checked in the
// database (production_set_status): supervisors up to Job completed, only
// admins to Invoiced and Paid. It's the job's one status, so every page
// showing the job (Jobs, the job page, Clients, Dashboard) shows the change.
export async function setProductionStatusAction(jobId: string, status: string) {
  if (!PRODUCTION_STAGES.some((s) => s.status === status)) return { error: "Not a production stage." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("production_set_status", { p_job_id: jobId, p_status: status });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return {};
}
