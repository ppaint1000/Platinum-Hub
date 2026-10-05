// Safety tasks - things to fix or do (e.g. from a site review), given to
// someone with a due date. Managers see all; everyone else theirs.
import { safetyContext, safetySites, safetyStaff } from "@/lib/safety/data";
import { SafetyTasks, type TaskRow } from "@/components/safety/SafetyTasks";
import { nzTodayDateString } from "@/lib/timesheets/formatNZ";

export default async function SafetyTasksPage() {
  const { supabase, isManager } = await safetyContext();
  const [{ data }, staff, sites] = await Promise.all([
    supabase
      .from("safety_tasks")
      .select("id, title, details, due_on, status, done_at, assignee:profiles!safety_tasks_assigned_to_fkey(full_name), site:sites(name)")
      .order("status")
      .order("due_on", { ascending: true, nullsFirst: false })
      .returns<TaskRow[]>(),
    safetyStaff(),
    safetySites(),
  ]);
  return <SafetyTasks rows={data ?? []} staff={staff} sites={sites} canManage={isManager} today={nzTodayDateString()} />;
}
