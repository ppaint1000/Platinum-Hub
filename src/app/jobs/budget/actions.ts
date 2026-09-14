"use server";

import { revalidatePath } from "next/cache";
import { requireAppAccess } from "@/lib/auth/requireAppAccess";

// Budget lines are the quoted $ per category (Labour, Paint, Sundries,
// access, etc.) — what job_budget_vs_actual's "Budgeted" column reads from.
// Needed for any job priced by hand rather than through a Measures quote,
// since nothing syncs these automatically.

export async function addBudgetLineAction(
  jobId: string,
  input: { categoryId: string; description: string; amount: number }
) {
  const supabase = await requireAppAccess("jobs");

  if (!input.categoryId) return { error: "Choose a category." };
  if (!input.description.trim()) return { error: "Description is required." };

  const { error } = await supabase.from("job_budget_lines").insert({
    job_id: jobId,
    category_id: input.categoryId,
    description: input.description.trim(),
    budgeted_amount: input.amount,
  });

  if (error) return { error: error.message };

  revalidatePath(`/jobs/${jobId}`);
  return {};
}

export async function updateBudgetLineAction(
  lineId: string,
  jobId: string,
  input: { categoryId: string; description: string; amount: number }
) {
  const supabase = await requireAppAccess("jobs");

  if (!input.categoryId) return { error: "Choose a category." };
  if (!input.description.trim()) return { error: "Description is required." };

  const { error } = await supabase
    .from("job_budget_lines")
    .update({
      category_id: input.categoryId,
      description: input.description.trim(),
      budgeted_amount: input.amount,
    })
    .eq("id", lineId);

  if (error) return { error: error.message };

  revalidatePath(`/jobs/${jobId}`);
  return {};
}

export async function deleteBudgetLineAction(lineId: string, jobId: string) {
  const supabase = await requireAppAccess("jobs");

  const { error } = await supabase.from("job_budget_lines").delete().eq("id", lineId);
  if (error) return { error: error.message };

  revalidatePath(`/jobs/${jobId}`);
  return {};
}
