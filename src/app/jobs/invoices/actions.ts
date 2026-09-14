"use server";

import { revalidatePath } from "next/cache";
import { requireAppAccess } from "@/lib/auth/requireAppAccess";

export async function assignInvoiceJobAction(invoiceId: string, jobId: string) {
  const supabase = await requireAppAccess("jobs");

  if (!jobId) return { error: "Choose a job." };

  const { error } = await supabase
    .from("resene_invoices")
    .update({ job_id: jobId })
    .eq("id", invoiceId);

  if (error) return { error: error.message };

  revalidatePath("/jobs/invoices");
  revalidatePath(`/jobs/${jobId}`);
  return {};
}
