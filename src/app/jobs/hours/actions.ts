"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/requireAdmin";

// Approve shifts so their hours count on the job (Labour $ and hours).
export async function approveHoursAction(entryIds: string[]) {
  const supabase = await requireAdmin();
  if (entryIds.length === 0) return {};
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("job_hours_approvals")
    .upsert(
      entryIds.map((id) => ({ entry_id: id, approved_by: user?.id ?? null })),
      { onConflict: "entry_id", ignoreDuplicates: true }
    );
  if (error) return { error: error.message };

  revalidatePath("/jobs", "layout");
  return {};
}

// Undo: the hours go back to waiting and come off the job.
export async function unapproveHoursAction(entryIds: string[]) {
  const supabase = await requireAdmin();
  if (entryIds.length === 0) return {};

  const { error } = await supabase.from("job_hours_approvals").delete().in("entry_id", entryIds);
  if (error) return { error: error.message };

  revalidatePath("/jobs", "layout");
  return {};
}
