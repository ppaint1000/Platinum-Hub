"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/requireAdmin";

export async function updateSalesTargetAction(
  userId: string,
  year: number,
  month: number,
  field: "quoted" | "won",
  amount: number
) {
  const supabase = await requireAdmin();

  const column = field === "quoted" ? "budget_quoted" : "budget_won";
  const { error } = await supabase.from("sales_targets").upsert(
    { user_id: userId, year, month, [column]: amount },
    { onConflict: "user_id,year,month" }
  );

  if (error) return { error: error.message };

  revalidatePath("/sales");
  return {};
}
