// Pre-job and Post-job checklists on the Production board
// (supabase/staff_profiles_and_checklists.sql). Admins edit the items;
// admins and supervisors tick them on each job.
import type { SupabaseClient } from "@supabase/supabase-js";

export type ChecklistKind = "pre" | "post";
export type ChecklistItem = { id: string; checklist: ChecklistKind; label: string; sort_order: number };
export type ChecklistTick = { job_id: string; item_id: string; done_at: string; done_by_name: string | null };

export const CHECKLIST_NAMES: Record<ChecklistKind, string> = { pre: "Pre-job checklist", post: "Post-job checklist" };

// Moving a job into this stage with its checklist not finished asks first.
export const CHECKLIST_BEFORE: Partial<Record<string, ChecklistKind>> = { in_progress: "pre", complete: "post" };

export async function loadChecklists(supabase: SupabaseClient, jobIds: string[]) {
  const [{ data: items }, { data: ticks }] = await Promise.all([
    supabase
      .from("checklist_items")
      .select("id, checklist, label, sort_order")
      .eq("active", true)
      .order("sort_order")
      .returns<ChecklistItem[]>(),
    jobIds.length
      ? supabase
          .from("job_checklist_ticks")
          .select("job_id, item_id, done_at, done_by:profiles(full_name)")
          .in("job_id", jobIds)
          .returns<{ job_id: string; item_id: string; done_at: string; done_by: { full_name: string } | { full_name: string }[] | null }[]>()
      : Promise.resolve({ data: [] as never[] }),
  ]);
  return {
    items: items ?? [],
    ticks: (ticks ?? []).map((t) => ({
      job_id: t.job_id,
      item_id: t.item_id,
      done_at: t.done_at,
      done_by_name: (Array.isArray(t.done_by) ? t.done_by[0]?.full_name : t.done_by?.full_name) ?? null,
    })) as ChecklistTick[],
  };
}
