// Categories are a shared list (job_categories) used by every job; typing a
// name that doesn't exist yet creates it here rather than requiring a
// separate "add category" step first. Shared by the budget UI and the
// Resene invoice-line approval UI, which both let an admin type a category
// name freely.
import { requireAppAccess } from "@/lib/auth/requireAppAccess";

function slugify(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

type Supabase = Awaited<ReturnType<typeof requireAppAccess>>;

export async function findOrCreateCategoryId(
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
