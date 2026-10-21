// Health & safety → Training: a matrix of the staff on timesheets against
// training (from the Staff Training Register - Site Safe, Ladder, Mobile
// scaffold, EWP...) with expiry colours, and the records behind it.
// Managers see and edit everyone; anyone else sees their own and can
// upload a new certificate for a manager to approve.
import { safetyContext } from "@/lib/safety/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { SafetyTraining } from "@/components/safety/SafetyTraining";
import type { TrainingCourse, TrainingRecord } from "@/lib/safety/trainingShared";
import { nzTodayDateString } from "@/lib/timesheets/formatNZ";

// Everyone active who's on timesheets (Users → Timesheets ticked).
async function timesheetStaff(): Promise<{ id: string; full_name: string }[]> {
  const { data } = await createAdminClient()
    .from("profiles")
    .select("id, full_name, user_app_access!inner(timesheets)")
    .eq("user_app_access.timesheets", true)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("full_name")
    .returns<{ id: string; full_name: string }[]>();
  return (data ?? []).map((p) => ({ id: p.id, full_name: p.full_name.replace(/\s+/g, " ").trim() }));
}

export default async function SafetyTrainingPage() {
  const { supabase, isManager, userId } = await safetyContext();
  const [{ data: courses, error }, { data: records }, staff] = await Promise.all([
    supabase.from("training_courses").select("id, name, valid_months, sort_order, is_active").order("sort_order").order("name").returns<TrainingCourse[]>(),
    supabase.from("training_records").select("*").order("created_at", { ascending: false }).returns<TrainingRecord[]>(),
    timesheetStaff(),
  ]);

  if (error) {
    return <p className="text-sm text-[#5B6472]">Training isn&apos;t set up yet - run supabase/safety_training.sql in Supabase.</p>;
  }

  let people = staff;
  if (!isManager) {
    people = staff.filter((s) => s.id === userId);
    if (!people.length) {
      const { data: me } = await supabase.from("profiles").select("id, full_name").eq("id", userId).maybeSingle<{ id: string; full_name: string }>();
      if (me) people = [me];
    }
  }

  return (
    <SafetyTraining
      courses={courses ?? []}
      records={records ?? []}
      staff={people}
      isManager={isManager}
      userId={userId}
      today={nzTodayDateString()}
    />
  );
}
