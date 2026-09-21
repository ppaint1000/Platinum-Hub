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

// Changes which job an already-linked invoice belongs to, or unlinks it
// (newJobId = null) so it goes back to "Needs a job". The job is recorded
// on the invoice, not on each line, so any costs already approved from it
// have to follow: a move re-points them at the new job, an unlink removes
// them from the old job and puts their invoice lines back to pending, the
// same as deleting an approved cost line does. There's no transaction
// across these tables, so a move puts the costs back if the invoice
// update fails rather than leaving them split across two jobs.
export async function moveInvoiceToJobAction(invoiceId: string, newJobId: string | null) {
  const supabase = await requireAppAccess("jobs");

  const { data: invoice, error: invoiceError } = await supabase
    .from("resene_invoices")
    .select("id, job_id")
    .eq("id", invoiceId)
    .maybeSingle<{ id: string; job_id: string | null }>();
  if (invoiceError) return { error: invoiceError.message };
  if (!invoice) return { error: "Invoice not found." };

  const oldJobId = invoice.job_id;
  if (oldJobId === newJobId) return {};

  const { data: lineRows, error: linesError } = await supabase
    .from("resene_invoice_lines")
    .select("id")
    .eq("invoice_id", invoiceId)
    .returns<{ id: string }[]>();
  if (linesError) return { error: linesError.message };
  const lineIds = (lineRows ?? []).map((l) => l.id);

  if (newJobId) {
    if (lineIds.length > 0) {
      const { error: costsError } = await supabase
        .from("job_actual_costs")
        .update({ job_id: newJobId })
        .in("resene_invoice_line_id", lineIds);
      if (costsError) return { error: costsError.message };
    }

    const { data: updated, error: updateError } = await supabase
      .from("resene_invoices")
      .update({ job_id: newJobId })
      .eq("id", invoiceId)
      .select("id");

    if (updateError || !updated || updated.length === 0) {
      if (oldJobId && lineIds.length > 0) {
        await supabase
          .from("job_actual_costs")
          .update({ job_id: oldJobId })
          .in("resene_invoice_line_id", lineIds);
      }
      return { error: updateError?.message ?? "Invoice could not be moved." };
    }
  } else {
    if (lineIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("job_actual_costs")
        .delete()
        .in("resene_invoice_line_id", lineIds);
      if (deleteError) return { error: deleteError.message };

      const { error: resetError } = await supabase
        .from("resene_invoice_lines")
        .update({ status: "pending", approved_at: null, approved_by: null })
        .in("id", lineIds)
        .eq("status", "approved");
      if (resetError) return { error: resetError.message };
    }

    const { data: updated, error: updateError } = await supabase
      .from("resene_invoices")
      .update({ job_id: null })
      .eq("id", invoiceId)
      .select("id");
    if (updateError || !updated || updated.length === 0) {
      return { error: updateError?.message ?? "Invoice could not be unlinked." };
    }
  }

  revalidatePath("/jobs/invoices");
  revalidatePath("/jobs");
  if (oldJobId) revalidatePath(`/jobs/${oldJobId}`);
  if (newJobId) revalidatePath(`/jobs/${newJobId}`);
  return {};
}
