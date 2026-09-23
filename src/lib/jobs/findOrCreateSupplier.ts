// Suppliers are a shared list (suppliers) picked from a dropdown when
// uploading/entering an invoice; typing a name that doesn't exist yet
// creates it here rather than requiring a separate "add supplier" step
// first - same pattern as findOrCreateCategoryId.
import { requireAppAccess } from "@/lib/auth/requireAppAccess";

type Supabase = Awaited<ReturnType<typeof requireAppAccess>>;

export async function findOrCreateSupplierId(
  supabase: Supabase,
  supplierName: string
): Promise<{ id: string } | { error: string }> {
  const trimmed = supplierName.trim();
  if (!trimmed) return { error: "Supplier is required." };

  const { data: existing } = await supabase
    .from("suppliers")
    .select("id")
    .ilike("name", trimmed)
    .maybeSingle();
  if (existing) return { id: existing.id };

  const { data: created, error } = await supabase
    .from("suppliers")
    .insert({ name: trimmed })
    .select("id")
    .single();

  if (error || !created) return { error: error?.message ?? "Could not add that supplier." };
  return { id: created.id };
}
