"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { PRODUCTION_STAGES } from "@/lib/jobs/status";
import { sendJobCompletedEmail } from "@/lib/notifications/jobCompleted";

// Moving a job on the Production board. Who can do what is checked in the
// database (production_set_status): supervisors up to Job completed, only
// admins to Invoiced and Paid. It's the job's one status, so every page
// showing the job (Jobs, the job page, Clients, Dashboard) shows the change.
export async function setProductionStatusAction(jobId: string, status: string) {
  if (!PRODUCTION_STAGES.some((s) => s.status === status)) return { error: "Not a production stage." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("production_set_status", { p_job_id: jobId, p_status: status });
  if (error) return { error: error.message };
  if (status === "complete") await sendJobCompletedEmail(jobId);

  revalidatePath("/", "layout");
  return {};
}

// ── Checklists ─────────────────────────────────────────────────────────
// Ticking an item on a job (admins and supervisors - the database checks).
export async function toggleChecklistItemAction(jobId: string, itemId: string, done: boolean) {
  const supabase = await createClient();
  if (done) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("job_checklist_ticks")
      .upsert({ job_id: jobId, item_id: itemId, done_by: user?.id ?? null, done_at: new Date().toISOString() }, { onConflict: "job_id,item_id" });
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("job_checklist_ticks").delete().eq("job_id", jobId).eq("item_id", itemId);
    if (error) return { error: error.message };
  }
  revalidatePath("/production");
  return {};
}

// Editing the checklists themselves (admins only - the database checks).
export async function addChecklistItemAction(checklist: "pre" | "post", label: string) {
  if (!label.trim()) return { error: "Type the item first." };
  const supabase = await createClient();
  const { data: last } = await supabase
    .from("checklist_items")
    .select("sort_order")
    .eq("checklist", checklist)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle<{ sort_order: number }>();
  const { error } = await supabase
    .from("checklist_items")
    .insert({ checklist, label: label.trim(), sort_order: (last?.sort_order ?? 0) + 1 });
  if (error) return { error: error.message };
  revalidatePath("/production", "layout");
  return {};
}

export async function renameChecklistItemAction(id: string, label: string) {
  if (!label.trim()) return { error: "An item can't be blank." };
  const supabase = await createClient();
  const { error } = await supabase.from("checklist_items").update({ label: label.trim() }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/production", "layout");
  return {};
}

// Taken off the checklist; jobs that already ticked it keep their record.
export async function removeChecklistItemAction(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("checklist_items").update({ active: false }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/production", "layout");
  return {};
}

// Swap an item with the one above or below it.
export async function moveChecklistItemAction(id: string, direction: "up" | "down") {
  const supabase = await createClient();
  const { data: item } = await supabase
    .from("checklist_items")
    .select("id, checklist, sort_order")
    .eq("id", id)
    .maybeSingle<{ id: string; checklist: string; sort_order: number }>();
  if (!item) return { error: "Item not found." };
  const { data: next } = await supabase
    .from("checklist_items")
    .select("id, sort_order")
    .eq("checklist", item.checklist)
    .eq("active", true)
    [direction === "up" ? "lt" : "gt"]("sort_order", item.sort_order)
    .order("sort_order", { ascending: direction === "down" })
    .limit(1)
    .maybeSingle<{ id: string; sort_order: number }>();
  if (!next) return {};
  const a = await supabase.from("checklist_items").update({ sort_order: next.sort_order }).eq("id", item.id);
  const b = await supabase.from("checklist_items").update({ sort_order: item.sort_order }).eq("id", next.id);
  if (a.error || b.error) return { error: (a.error ?? b.error)!.message };
  revalidatePath("/production", "layout");
  return {};
}
