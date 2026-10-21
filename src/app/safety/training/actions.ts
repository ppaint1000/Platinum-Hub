"use server";

// Health & safety → Training: courses and training records. Who can do
// what is checked by the database (supabase/safety_training.sql) - managers
// do everything; anyone else can only add their own, as "pending".
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Result = { error?: string };

const BUCKET = "training-certificates";
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function saveCourseAction(c: { id?: string; name: string; validMonths: number | null }): Promise<Result> {
  const name = c.name.trim();
  if (!name) return { error: "Give the training a name." };
  const valid = c.validMonths && c.validMonths > 0 ? Math.round(c.validMonths) : null;
  const supabase = await createClient();
  const { error } = c.id
    ? await supabase.from("training_courses").update({ name, valid_months: valid }).eq("id", c.id)
    : await supabase.from("training_courses").insert({ name, valid_months: valid, sort_order: Date.now() % 1_000_000 });
  if (error) return { error: error.code === "23505" ? "There's already training with that name." : error.message };
  revalidatePath("/safety/training");
  return {};
}

export async function setCourseActiveAction(id: string, active: boolean): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("training_courses").update({ is_active: active }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/safety/training");
  return {};
}

// Deletes the training type and everyone's records of it (and their
// certificates).
export async function deleteCourseAction(id: string): Promise<Result> {
  const supabase = await createClient();
  const { data: recs } = await supabase.from("training_records").select("certificate_path").eq("course_id", id);
  const files = (recs ?? []).map((r) => r.certificate_path as string | null).filter((f): f is string => Boolean(f));
  const { error: recError } = await supabase.from("training_records").delete().eq("course_id", id);
  if (recError) return { error: recError.message };
  const { error } = await supabase.from("training_courses").delete().eq("id", id);
  if (error) return { error: error.message };
  if (files.length) await supabase.storage.from(BUCKET).remove(files);
  revalidatePath("/safety/training");
  return {};
}

export type TrainingInput = {
  id?: string;
  userId: string;
  courseId: string;
  outcome: "done" | "to_complete" | "not_required";
  // Blank for in-house training with no date.
  completedOn: string;
  expiresOn: string;
  provider: string;
  notes: string;
  // Already uploaded from the browser into the person's folder.
  certificatePath: string | null;
};

export async function saveTrainingAction(t: TrainingInput): Promise<Result> {
  if (!t.courseId) return { error: "Pick the training." };
  const done = t.outcome === "done";
  if (!["done", "to_complete", "not_required"].includes(t.outcome)) return { error: "Pick done, to complete or not required." };
  if (done && t.completedOn && !DAY.test(t.completedOn)) return { error: "That date isn't right." };
  if (done && t.expiresOn && !DAY.test(t.expiresOn)) return { error: "That expiry date isn't right." };
  if (done && t.completedOn && t.expiresOn && t.expiresOn < t.completedOn) return { error: "The expiry is before the date it was done." };

  const supabase = await createClient();
  const [{ data: auth }, { data: manager }] = await Promise.all([supabase.auth.getUser(), supabase.rpc("safety_manager")]);
  const me = auth.user?.id;
  if (!me) return { error: "Please sign in again." };
  const isManager = manager === true;
  const userId = isManager ? t.userId : me;
  if (!userId) return { error: "Pick the person." };
  if (t.certificatePath && !t.certificatePath.startsWith(`${userId}/`)) return { error: "Upload the certificate again." };

  const row = {
    user_id: userId,
    course_id: t.courseId,
    outcome: t.outcome,
    completed_on: done ? t.completedOn || null : null,
    expires_on: done ? t.expiresOn || null : null,
    provider: done ? t.provider.trim() || null : null,
    notes: t.notes.trim() || null,
    updated_at: new Date().toISOString(),
    ...(t.certificatePath ? { certificate_path: t.certificatePath } : {}),
  };

  if (t.id) {
    if (!isManager) return { error: "Only a manager can change a record." };
    const { data: old } = await supabase.from("training_records").select("certificate_path").eq("id", t.id).maybeSingle<{ certificate_path: string | null }>();
    const { error } = await supabase.from("training_records").update(row).eq("id", t.id);
    if (error) return { error: error.message };
    if (t.certificatePath && old?.certificate_path && old.certificate_path !== t.certificatePath) {
      await supabase.storage.from(BUCKET).remove([old.certificate_path]);
    }
  } else {
    const { error } = await supabase.from("training_records").insert({ ...row, status: isManager ? "approved" : "pending" });
    if (error) {
      if (t.certificatePath) await supabase.storage.from(BUCKET).remove([t.certificatePath]);
      return { error: error.message };
    }
  }
  revalidatePath("/safety/training");
  return {};
}

export async function approveTrainingAction(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("training_records")
    .update({ status: "approved", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/safety/training");
  return {};
}

export async function deleteTrainingAction(id: string): Promise<Result> {
  const supabase = await createClient();
  const { data: rec } = await supabase.from("training_records").select("certificate_path").eq("id", id).maybeSingle<{ certificate_path: string | null }>();
  if (!rec) return { error: "Not found." };
  const { error } = await supabase.from("training_records").delete().eq("id", id);
  if (error) return { error: error.message };
  if (rec.certificate_path) await supabase.storage.from(BUCKET).remove([rec.certificate_path]);
  revalidatePath("/safety/training");
  return {};
}

export async function certificateLinkAction(id: string): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient();
  const { data: rec } = await supabase.from("training_records").select("certificate_path").eq("id", id).maybeSingle<{ certificate_path: string | null }>();
  if (!rec?.certificate_path) return { error: "No certificate on this one." };
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(rec.certificate_path, 300);
  if (error || !data) return { error: error?.message ?? "Couldn't open it." };
  return { url: data.signedUrl };
}
