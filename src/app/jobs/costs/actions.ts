"use server";

import { revalidatePath } from "next/cache";
import { requireAppAccess } from "@/lib/auth/requireAppAccess";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { findOrCreateCategoryId } from "@/lib/jobs/findOrCreateCategory";

// The category field here is free text, not a fixed picklist — pick an
// existing category or type a new one (findOrCreateCategoryId creates it).
// Whatever category gets set is also remembered against the invoice line's
// Resene item code (resene_item_category_map), so the next invoice
// carrying that same code defaults to it on upload — see
// src/app/api/jobs/invoices/upload/route.ts, which already reads this map.
export async function updateReseneInvoiceLineAction(
  lineId: string,
  jobId: string,
  input: { categoryName: string; description: string; amount: number }
) {
  const supabase = await requireAppAccess("jobs");

  if (!input.description.trim()) return { error: "Description is required." };

  const { data: existing } = await supabase
    .from("resene_invoice_lines")
    .select("status, item_code")
    .eq("id", lineId)
    .single();

  if (existing?.status === "approved") {
    return { error: "Already approved — edit the actual cost line directly instead." };
  }

  let categoryId: string | null = null;
  if (input.categoryName.trim()) {
    const category = await findOrCreateCategoryId(supabase, input.categoryName);
    if ("error" in category) return { error: category.error };
    categoryId = category.id;
  }

  const { error } = await supabase
    .from("resene_invoice_lines")
    .update({
      category_id: categoryId,
      description: input.description.trim(),
      subtotal: input.amount,
    })
    .eq("id", lineId);

  if (error) return { error: error.message };

  if (categoryId && existing?.item_code) {
    await supabase
      .from("resene_item_category_map")
      .upsert(
        { item_code: existing.item_code, category_id: categoryId },
        { onConflict: "item_code" }
      );
  }

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

// Sets a category's Actual total straight from the budget table, for when an
// admin wants to type the figure rather than manage cost lines one by one.
// Actual is the sum of the category's cost lines (plus, for Labour, the
// live timesheet figure), so this works out the difference from what the
// category currently totals and books it against the cost lines: a lone
// line that isn't tied to an invoice is edited in place, otherwise a
// "Manual adjustment" line for the difference is added, so every other
// line and the invoice history stay as they were.
export async function setCategoryActualAction(
  jobId: string,
  input: { categoryId: string; amount: number }
) {
  const supabase = await requireAppAccess("jobs");

  if (!input.categoryId) return { error: "Choose a category." };
  if (!Number.isFinite(input.amount)) return { error: "Enter a valid actual amount." };

  const { data: current, error: currentError } = await supabase
    .from("job_budget_vs_actual")
    .select("actual_amount")
    .eq("job_id", jobId)
    .eq("category_id", input.categoryId)
    .maybeSingle<{ actual_amount: number }>();
  if (currentError) return { error: currentError.message };

  const delta = Math.round((input.amount - Number(current?.actual_amount ?? 0)) * 100) / 100;
  if (delta === 0) return {};

  const { data: lines, error: linesError } = await supabase
    .from("job_actual_costs")
    .select("id, amount, resene_invoice_line_id")
    .eq("job_id", jobId)
    .eq("category_id", input.categoryId)
    .returns<{ id: string; amount: number; resene_invoice_line_id: string | null }[]>();
  if (linesError) return { error: linesError.message };

  const only = lines?.length === 1 ? lines[0] : null;
  const { error } =
    only && !only.resene_invoice_line_id
      ? await supabase
          .from("job_actual_costs")
          .update({ amount: Math.round((Number(only.amount) + delta) * 100) / 100 })
          .eq("id", only.id)
      : await supabase.from("job_actual_costs").insert({
          job_id: jobId,
          category_id: input.categoryId,
          description: "Manual adjustment",
          amount: delta,
          source: "manual",
          incurred_at: new Date().toISOString().slice(0, 10),
        });

  if (error) return { error: error.message };

  revalidatePath(`/jobs/${jobId}`);
  return {};
}

// Corrects a number/price on an existing actual cost line — whether it was
// typed in manually or came from an approved Resene invoice line. Editing
// here only touches the ledger copy; it doesn't rewrite the original
// invoice line.
export async function updateActualCostAction(
  costId: string,
  jobId: string,
  input: { categoryId: string; description: string; amount: number }
) {
  const supabase = await requireAppAccess("jobs");

  if (!input.categoryId) return { error: "Choose a category." };
  if (!input.description.trim()) return { error: "Description is required." };

  const { error } = await supabase
    .from("job_actual_costs")
    .update({
      category_id: input.categoryId,
      description: input.description.trim(),
      amount: input.amount,
    })
    .eq("id", costId);

  if (error) return { error: error.message };

  revalidatePath(`/jobs/${jobId}`);
  return {};
}

// Moves a manually-entered cost line onto a different job (e.g. it was
// logged against the wrong one). Lines that came from an approved Resene
// invoice can't move on their own: the job is set on the invoice, so
// moving one line would split the invoice across two jobs. Those move with
// their invoice instead - see moveInvoiceToJobAction.
export async function moveActualCostToJobAction(costId: string, fromJobId: string, toJobId: string) {
  const supabase = await requireAppAccess("jobs");

  if (!toJobId) return { error: "Choose a job." };
  if (toJobId === fromJobId) return { error: "That cost is already on this job." };

  const { data: existing, error: fetchError } = await supabase
    .from("job_actual_costs")
    .select("resene_invoice_line_id")
    .eq("id", costId)
    .eq("job_id", fromJobId)
    .maybeSingle<{ resene_invoice_line_id: string | null }>();
  if (fetchError) return { error: fetchError.message };
  if (!existing) return { error: "Cost line not found on this job." };
  if (existing.resene_invoice_line_id) {
    return {
      error:
        "This cost came from a Resene invoice — move the invoice to the other job from the Resene invoices page instead.",
    };
  }

  const { data: moved, error } = await supabase
    .from("job_actual_costs")
    .update({ job_id: toJobId })
    .eq("id", costId)
    .eq("job_id", fromJobId)
    .select("id");
  if (error) return { error: error.message };
  if (!moved || moved.length === 0) return { error: "Cost line could not be moved." };

  revalidatePath(`/jobs/${fromJobId}`);
  revalidatePath(`/jobs/${toJobId}`);
  return {};
}

// Removing a cost line that came from an approved invoice line also flips
// that invoice line back to pending, so it reappears for correction and
// re-approval instead of silently vanishing from the invoice's history.
export async function deleteActualCostAction(costId: string, jobId: string) {
  const supabase = await requireAppAccess("jobs");

  const { data: existing } = await supabase
    .from("job_actual_costs")
    .select("resene_invoice_line_id")
    .eq("id", costId)
    .maybeSingle();

  const { error } = await supabase.from("job_actual_costs").delete().eq("id", costId);
  if (error) return { error: error.message };

  if (existing?.resene_invoice_line_id) {
    await supabase
      .from("resene_invoice_lines")
      .update({ status: "pending", approved_at: null, approved_by: null })
      .eq("id", existing.resene_invoice_line_id);
  }

  revalidatePath(`/jobs/${jobId}`);
  return {};
}
