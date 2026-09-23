"use server";

import { revalidatePath } from "next/cache";
import { requireAppAccess } from "@/lib/auth/requireAppAccess";

// Lines aren't fetched up front for every matched invoice on the list page
// (most never need splitting) - MatchedInvoiceRow calls this on demand,
// only once someone actually clicks "Split across jobs".
export async function fetchInvoiceLinesAction(invoiceId: string) {
  const supabase = await requireAppAccess("jobs");

  const { data, error } = await supabase
    .from("resene_invoice_lines")
    .select("id, description, subtotal")
    .eq("invoice_id", invoiceId)
    .order("line_no")
    .returns<{ id: string; description: string; subtotal: number }[]>();

  if (error) return { error: error.message };
  return { lines: data ?? [] };
}

export async function assignInvoiceJobAction(invoiceId: string, jobId: string) {
  const supabase = await requireAppAccess("jobs");

  if (!jobId) return { error: "Choose a job." };

  const { error } = await supabase
    .from("resene_invoices")
    .update({ job_id: jobId, split: false })
    .eq("id", invoiceId);
  if (error) return { error: error.message };

  // A job's pending-approvals list filters on the line's own job_id, not
  // the invoice's - keep every line in step with a whole-invoice assign.
  const { error: linesError } = await supabase
    .from("resene_invoice_lines")
    .update({ job_id: jobId })
    .eq("invoice_id", invoiceId);
  if (linesError) return { error: linesError.message };

  revalidatePath("/jobs/invoices");
  revalidatePath(`/jobs/${jobId}`);
  return {};
}

// Assigns an invoice's lines to different jobs individually - some
// invoices genuinely cover work on more than one job. Clears the
// invoice's own job_id (it no longer means one thing) and sets split=true
// so the invoices list shows it as split rather than "needs a job".
// Costs already approved before the split keep their existing job - only
// re-approving picks up a line's new job.
export async function splitInvoiceLinesAction(
  invoiceId: string,
  assignments: { lineId: string; jobId: string }[]
) {
  const supabase = await requireAppAccess("jobs");

  const cleaned = assignments.filter((a) => a.jobId);
  if (cleaned.length === 0) return { error: "Choose a job for at least one line." };

  for (const { lineId, jobId } of cleaned) {
    const { error } = await supabase.from("resene_invoice_lines").update({ job_id: jobId }).eq("id", lineId);
    if (error) return { error: error.message };
  }

  const { error: invoiceError } = await supabase
    .from("resene_invoices")
    .update({ job_id: null, split: true })
    .eq("id", invoiceId);
  if (invoiceError) return { error: invoiceError.message };

  revalidatePath("/jobs/invoices");
  revalidatePath("/jobs");
  for (const jobId of new Set(cleaned.map((a) => a.jobId))) {
    revalidatePath(`/jobs/${jobId}`);
  }
  return {};
}

// Changes which job an already-linked invoice belongs to, or unlinks it
// (newJobId = null) so it goes back to "Needs a job". Also un-splits it
// (split=false) - Change job/Unlink treat the invoice as one job again,
// same as it was before any per-line split. Any cost already approved
// has to follow too: a move re-points it at the new job, an unlink removes
// it from the old job and puts its invoice line back to pending, the same
// as deleting an approved cost line does. There's no transaction across
// these tables, so a move puts the costs back if the invoice update fails
// rather than leaving them split across two jobs.
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

      const { error: lineJobError } = await supabase
        .from("resene_invoice_lines")
        .update({ job_id: newJobId })
        .in("id", lineIds);
      if (lineJobError) return { error: lineJobError.message };
    }

    const { data: updated, error: updateError } = await supabase
      .from("resene_invoices")
      .update({ job_id: newJobId, split: false })
      .eq("id", invoiceId)
      .select("id");

    if (updateError || !updated || updated.length === 0) {
      if (lineIds.length > 0) {
        await supabase
          .from("job_actual_costs")
          .update({ job_id: oldJobId })
          .in("resene_invoice_line_id", lineIds);
        await supabase.from("resene_invoice_lines").update({ job_id: oldJobId }).in("id", lineIds);
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

      // Every line loses its job_id on a full unlink, regardless of
      // whether it was approved or already pending.
      const { error: lineJobError } = await supabase
        .from("resene_invoice_lines")
        .update({ job_id: null })
        .in("id", lineIds);
      if (lineJobError) return { error: lineJobError.message };
    }

    const { data: updated, error: updateError } = await supabase
      .from("resene_invoices")
      .update({ job_id: null, split: false })
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

// Removes an invoice uploaded by mistake - wrong file, duplicate before the
// upload page blocked those, or similar. Any cost it was already approved
// into is removed too (matching what unlinking does), since keeping a
// job's actual $ pointed at an invoice that no longer exists would be
// worse than losing that cost line. The PDF is removed from storage and
// the invoice_lines rows cascade with the invoice row itself.
export async function deleteInvoiceAction(invoiceId: string) {
  const supabase = await requireAppAccess("jobs");

  const { data: invoice, error: invoiceError } = await supabase
    .from("resene_invoices")
    .select("id, job_id, pdf_path")
    .eq("id", invoiceId)
    .maybeSingle<{ id: string; job_id: string | null; pdf_path: string | null }>();
  if (invoiceError) return { error: invoiceError.message };
  if (!invoice) return { error: "Invoice not found." };

  const { data: lineRows, error: linesError } = await supabase
    .from("resene_invoice_lines")
    .select("id")
    .eq("invoice_id", invoiceId)
    .returns<{ id: string }[]>();
  if (linesError) return { error: linesError.message };
  const lineIds = (lineRows ?? []).map((l) => l.id);

  if (lineIds.length > 0) {
    const { error: costsError } = await supabase
      .from("job_actual_costs")
      .delete()
      .in("resene_invoice_line_id", lineIds);
    if (costsError) return { error: costsError.message };
  }

  const { error: deleteError } = await supabase.from("resene_invoices").delete().eq("id", invoiceId);
  if (deleteError) return { error: deleteError.message };

  if (invoice.pdf_path) {
    await supabase.storage.from("resene-invoices").remove([invoice.pdf_path]);
  }

  revalidatePath("/jobs/invoices");
  revalidatePath("/jobs");
  if (invoice.job_id) revalidatePath(`/jobs/${invoice.job_id}`);
  return {};
}
