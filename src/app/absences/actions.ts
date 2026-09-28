"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { isAbsenceType } from "@/lib/absences/types";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

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
    })),
    { onConflict: "user_id,absence_date" }
  );
  if (error) back("/absences", error.message);

  revalidatePath("/absences");
  revalidatePath("/dashboard");
  redirect("/absences?saved=1");
}

export async function deleteAbsenceAction(formData: FormData) {
  const supabase = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const { error } = await supabase.from("absences").delete().eq("id", id);
  if (error) back(`/absences/${id}`, error.message);
  revalidatePath("/absences");
  revalidatePath("/dashboard");
  redirect("/absences");
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
