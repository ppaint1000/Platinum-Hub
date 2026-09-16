"use server";

import { revalidatePath } from "next/cache";
import { requireAppAccess } from "@/lib/auth/requireAppAccess";
import { findOrCreateCategoryId } from "@/lib/jobs/findOrCreateCategory";

// Budget is one $ figure per category per job — what job_budget_vs_actual's
// "Budgeted" column reads from. Needed for any job priced by hand rather
// than through a Measures quote, since nothing syncs these automatically.

// Sets the budgeted $ for one category on one job, replacing whatever was
// there before — editing a category's budget is just "change the number",
// not managing a list of line items.
export async function setCategoryBudgetAction(
  jobId: string,
  input: { categoryName: string; amount: number }
) {
  const supabase = await requireAppAccess("jobs");

  const category = await findOrCreateCategoryId(supabase, input.categoryName);
  if ("error" in category) return { error: category.error };

  const { error: deleteError } = await supabase
    .from("job_budget_lines")
    .delete()
    .eq("job_id", jobId)
    .eq("category_id", category.id);
  if (deleteError) return { error: deleteError.message };

  const { error: insertError } = await supabase.from("job_budget_lines").insert({
    job_id: jobId,
    category_id: category.id,
    budgeted_amount: input.amount,
  });
  if (insertError) return { error: insertError.message };

  revalidatePath(`/jobs/${jobId}`);
  return {};
}

// Removes a category's budget from this one job only — the category
// itself stays in the shared list for other jobs, and this job's actual
// spend under it (if any) is untouched.
export async function deleteCategoryBudgetAction(jobId: string, categoryId: string) {
  const supabase = await requireAppAccess("jobs");

  const { error } = await supabase
    .from("job_budget_lines")
    .delete()
    .eq("job_id", jobId)
    .eq("category_id", categoryId);

  if (error) return { error: error.message };

  revalidatePath(`/jobs/${jobId}`);
  return {};
}
