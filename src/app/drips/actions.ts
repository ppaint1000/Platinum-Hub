"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/requireAdmin";

type Result = { error?: string };

export async function saveDripSettingsAction(reviewUrl: string, paused: boolean): Promise<Result> {
  const url = reviewUrl.trim();
  if (url && !/^https?:\/\//i.test(url)) return { error: "The review link should start with https://" };
  const supabase = await requireAdmin();
  const { error } = await supabase
    .from("drip_settings")
    .upsert({ id: true, google_review_url: url || null, paused, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) return { error: error.message };
  revalidatePath("/drips");
  return {};
}

export async function setSequenceActiveAction(id: string, active: boolean): Promise<Result> {
  const supabase = await requireAdmin();
  const { error } = await supabase.from("drip_sequences").update({ active }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/drips");
  return {};
}

export type StepInput = { id?: string; delayDays: number; subject: string; body: string };

// Saves a sequence's emails in order (replacing the old list).
export async function saveStepsAction(sequenceId: string, steps: StepInput[]): Promise<Result> {
  if (steps.some((s) => !s.subject.trim() || !s.body.trim())) return { error: "Every email needs a subject and a message." };
  const supabase = await requireAdmin();
  const { data: existing } = await supabase.from("drip_steps").select("id").eq("sequence_id", sequenceId);
  const keep = new Set(steps.map((s) => s.id).filter(Boolean));
  const remove = (existing ?? []).map((r) => r.id).filter((id) => !keep.has(id));
  if (remove.length) {
    const { error } = await supabase.from("drip_steps").delete().in("id", remove);
    if (error) return { error: error.message };
  }
  for (const [i, s] of steps.entries()) {
    const row = {
      sequence_id: sequenceId,
      step_order: i,
      delay_days: Math.max(0, Math.round(Number(s.delayDays) || 0)),
      subject: s.subject.trim(),
      body: s.body.trim(),
    };
    const { error } = s.id ? await supabase.from("drip_steps").update(row).eq("id", s.id) : await supabase.from("drip_steps").insert(row);
    if (error) return { error: error.message };
  }
  revalidatePath("/drips");
  return {};
}

export async function stopEnrolmentAction(id: string): Promise<Result> {
  const supabase = await requireAdmin();
  const { error } = await supabase
    .from("drip_enrolments")
    .update({ status: "stopped", stopped_reason: "Stopped by hand", next_send_at: null })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/drips");
  return {};
}
