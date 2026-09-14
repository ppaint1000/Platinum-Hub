"use server";

import { revalidatePath } from "next/cache";
import { requireAppAccess } from "@/lib/auth/requireAppAccess";
import { requireAdmin } from "@/lib/auth/requireAdmin";

export async function updateReseneInvoiceLineAction(
  lineId: string,
  jobId: string,
  input: { categoryId: string | null; description: string; amount: number }
) {
  const supabase = await requireAppAccess("jobs");

  if (!input.description.trim()) return { error: "Description is required." };

  const { data: existing } = await supabase
    .from("resene_invoice_lines")
    .select("status")
    .eq("id", lineId)
    .single();

  if (existing?.status === "approved") {
    return { error: "Already approved — edit the actual cost line directly instead." };
  }

  const { error } = await supabase
    .from("resene_invoice_lines")
    .update({
      category_id: input.categoryId,
      description: input.description.trim(),
      subtotal: input.amount,
    })
    .eq("id", lineId);

  if (error) return { error: error.message };

  revalidatePath(`/jobs/${jobId}`);
  return {};
}

export async function approveReseneInvoiceLineAction(lineId: string, jobId: string) {
  const supabase = await requireAdmin();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: line, error: fetchError } = await supabase
    .from("resene_invoice_lines")
    .select("category_id, description, subtotal, status")
    .eq("id", lineId)
    .single();

  if (fetchError || !line) return { error: fetchError?.message ?? "Invoice line not found." };
  if (line.status === "approved") return { error: "Already approved." };
  if (!line.category_id) return { error: "Choose a category before approving." };

  const { error: actualError } = await supabase.from("job_actual_costs").insert({
    job_id: jobId,
    category_id: line.category_id,
    description: line.description,
    amount: line.subtotal,
    source: "invoice",
    resene_invoice_line_id: lineId,
  });

  if (actualError) return { error: actualError.message };

  const { error: updateError } = await supabase
    .from("resene_invoice_lines")
    .update({ status: "approved", approved_at: new Date().toISOString(), approved_by: user?.id })
    .eq("id", lineId);

  if (updateError) return { error: updateError.message };

  revalidatePath(`/jobs/${jobId}`);
  return {};
}

export async function addManualActualCostAction(
  jobId: string,
  input: { categoryId: string; description: string; amount: number; incurredAt: string }
) {
  const supabase = await requireAppAccess("jobs");

  if (!input.categoryId) return { error: "Choose a category." };
  if (!input.description.trim()) return { error: "Description is required." };

  const { error } = await supabase.from("job_actual_costs").insert({
    job_id: jobId,
    category_id: input.categoryId,
    description: input.description.trim(),
    amount: input.amount,
    source: "manual",
    incurred_at: input.incurredAt,
  });

  if (error) return { error: error.message };

  revalidatePath(`/jobs/${jobId}`);
  return {};
}
