"use server";

// Saving a month's marketing spend (Reports → Marketing ROI). Admins only.
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/requireAdmin";

export async function saveSpendAction(month: string, amounts: Record<string, number>): Promise<{ error?: string }> {
  const supabase = await requireAdmin();
  if (!/^\d{4}-\d{2}$/.test(month)) return { error: "Choose a month." };
  const first = `${month}-01`;

  const keep = Object.entries(amounts).filter(([, n]) => Number.isFinite(n) && n > 0);
  const clear = Object.entries(amounts).filter(([, n]) => !Number.isFinite(n) || n <= 0).map(([s]) => s);

  if (keep.length) {
    const { error } = await supabase.from("marketing_spend").upsert(
      keep.map(([source, amount]) => ({ month: first, source, amount: Math.round(amount * 100) / 100, updated_at: new Date().toISOString() })),
      { onConflict: "month,source" }
    );
    if (error) return { error: error.message };
  }
  if (clear.length) {
    const { error } = await supabase.from("marketing_spend").delete().eq("month", first).in("source", clear);
    if (error) return { error: error.message };
  }
  revalidatePath("/reports/marketing");
  return {};
}
