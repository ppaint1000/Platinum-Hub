"use server";

import { revalidatePath } from "next/cache";
import { requireAppAccess } from "@/lib/auth/requireAppAccess";

// Budget is one $ figure per category per job — what job_budget_vs_actual's
// "Budgeted" column reads from. Needed for any job priced by hand rather
// than through a Measures quote, since nothing syncs these automatically.
// Categories themselves are a shared list (job_categories) used by every
// job; typing a name that doesn't exist yet creates it here rather than
// requiring a separate "add category" step first.

function slugify(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

type Supabase = Awaited<ReturnType<typeof requireAppAccess>>;

async function findOrCreateCategoryId(
  supabase: Supabase,
  categoryName: string
): Promise<{ id: string } | { error: string }> {
  const trimmed = categoryName.trim();
  if (!trimmed) return { error: "Category is required." };

  const { data: existingByLabel } = await supabase
    .from("job_categories")
    .select("id")
    .ilike("label", trimmed)
    .maybeSingle();
  if (existingByLabel) return { id: existingByLabel.id };

  const key = slugify(trimmed);
  if (!key) return { error: "Category name must include letters or numbers." };

  const { data: existingByKey } = await supabase
    .from("job_categories")
    .select("id")
    .eq("key", key)
    .maybeSingle();
  if (existingByKey) return { id: existingByKey.id };

  const { data: maxRow } = await supabase
    .from("job_categories")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSortOrder = (maxRow?.sort_order ?? -1) + 1;

  const { data: created, error } = await supabase
    .from("job_categories")
    .insert({ key, label: trimmed, sort_order: nextSortOrder })
    .select("id")
    .single();

  if (error || !created) return { error: error?.message ?? "Could not create category." };
  return { id: created.id };
}

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
