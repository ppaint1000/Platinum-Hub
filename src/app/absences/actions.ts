"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { isAbsenceType } from "@/lib/absences/types";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Where to go after a form: the Absences page (keeping its period) or a
// record page - never anywhere else.
function returnTo(formData: FormData): string {
  const to = String(formData.get("return_to") ?? "");
  return to.startsWith("/absences") ? to : "/absences";
}

function back(path: string, error?: string): never {
  redirect(error ? `${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(error)}` : path);
}

async function currentUserId(supabase: Awaited<ReturnType<typeof requireAdmin>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// Record (or change) why someone was away. A reason is always required.
export async function recordAbsenceAction(formData: FormData) {
  const supabase = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const type = formData.get("type");
  const reason = String(formData.get("reason") ?? "").trim();
  const page = `/absences/${id}`;

  if (!isAbsenceType(type)) back(page, "Pick whether they were sick, on leave or not rostered.");
  if (!reason) back(page, "Please give a reason.");

  const { error } = await supabase
    .from("absences")
    .update({ absence_type: type, reason, recorded_by: await currentUserId(supabase), recorded_at: new Date().toISOString() })
    .eq("id", id);
  if (error) back(page, error.message);

  revalidatePath("/absences");
  revalidatePath("/dashboard");
  redirect("/absences?saved=1");
}

// Record an absence ahead of time (e.g. booked leave) or after the fact.
// If the 9am check already flagged that person for that day, this fills it in.
export async function addAbsenceAction(formData: FormData) {
  const supabase = await requireAdmin();
  const userId = String(formData.get("user_id") ?? "");
  const from = String(formData.get("from") ?? "");
  const to = String(formData.get("to") ?? "") || from;
  const type = formData.get("type");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!userId) back("/absences", "Pick who was away.");
  if (!DATE.test(from) || !DATE.test(to) || to < from) back("/absences", "Check the dates.");
  if (!isAbsenceType(type)) back("/absences", "Pick whether they were sick, on leave or not rostered.");
  if (!reason) back("/absences", "Please give a reason.");

  // One row per weekday in the range.
  const days: string[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) days.push(d.toISOString().slice(0, 10));
    if (days.length > 60) back("/absences", "That's more than 60 working days - please split it up.");
  }
  if (days.length === 0) back("/absences", "Those dates are all at the weekend.");

  const recordedBy = await currentUserId(supabase);
  const now = new Date().toISOString();
  const { error } = await supabase.from("absences").upsert(
    days.map((day) => ({
      user_id: userId,
      absence_date: day,
      absence_type: type,
      reason,
      flagged_by_check: false,
      recorded_by: recordedBy,
      recorded_at: now,
      // Recording a day that was deleted brings it back.
      dismissed_at: null,
    })),
    { onConflict: "user_id,absence_date" }
  );
  if (error) back("/absences", error.message);

  revalidatePath("/absences");
  revalidatePath("/dashboard");
  redirect("/absences?saved=1");
}

// Delete any absence. It's kept but hidden (dismissed_at) rather than
// removed, so the clock-in check never flags that person for that day again.
export async function deleteAbsenceAction(formData: FormData) {
  const supabase = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const page = returnTo(formData);
  const { error } = await supabase
    .from("absences")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) back(page, error.message);
  revalidatePath("/absences");
  revalidatePath("/dashboard");
  redirect(page.startsWith(`/absences/${id}`) ? "/absences" : page);
}

// "Delete all" on the Needs a reason list.
export async function deleteAllPendingAction(formData: FormData) {
  const supabase = await requireAdmin();
  const page = returnTo(formData);
  const { error } = await supabase
    .from("absences")
    .update({ dismissed_at: new Date().toISOString() })
    .is("absence_type", null)
    .is("dismissed_at", null);
  if (error) back(page, error.message);
  revalidatePath("/absences");
  revalidatePath("/dashboard");
  redirect(page);
}

// Closed days (e.g. the Christmas shutdown): no 9am check runs on them.
export async function addClosedDaysAction(formData: FormData) {
  const supabase = await requireAdmin();
  const from = String(formData.get("from") ?? "");
  const to = String(formData.get("to") ?? "") || from;
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!DATE.test(from) || !DATE.test(to) || to < from) back("/absences", "Check the closed dates.");

  const days: string[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) days.push(d.toISOString().slice(0, 10));
    if (days.length > 60) back("/absences", "That's more than 60 working days - please split it up.");
  }
  if (days.length === 0) back("/absences", "Those dates are all at the weekend.");

  const createdBy = await currentUserId(supabase);
  const { error } = await supabase
    .from("closed_days")
    .upsert(days.map((day) => ({ day, note, created_by: createdBy })), { onConflict: "day" });
  if (error) back("/absences", error.message);

  revalidatePath("/absences");
  redirect("/absences?saved=1");
}

export async function removeClosedDayAction(formData: FormData) {
  const supabase = await requireAdmin();
  const day = String(formData.get("day") ?? "");
  const { error } = await supabase.from("closed_days").delete().eq("day", day);
  if (error) back("/absences", error.message);
  revalidatePath("/absences");
  redirect("/absences");
}
