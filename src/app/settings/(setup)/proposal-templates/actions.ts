"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireMcAccess } from "@/lib/quotes/mcAccess";

// How long a proposal is valid after it's sent, and when the customer gets
// a reminder (0 = never). Admins only (the database checks too).
export async function saveProposalTimingAction(validDays: number, reminderDays: number): Promise<{ error?: string }> {
  await requireMcAccess("admin");
  const clean = (n: number) => Math.max(0, Math.min(365, Math.round(Number(n) || 0)));
  const supabase = await createClient();
  const { error } = await supabase
    .from("proposal_settings")
    .upsert({ id: true, valid_days: clean(validDays), customer_reminder_days: clean(reminderDays) }, { onConflict: "id" });
  if (error) return { error: error.message };
  revalidatePath("/settings/proposal-templates");
  return {};
}
