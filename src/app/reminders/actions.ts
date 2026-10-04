"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/requireAdmin";

export type ReminderInput = {
  clientId: string;
  kind: "maintenance" | "repaint" | "other";
  dueOn: string;
  note: string;
  emailCustomer: boolean;
};

export async function addReminderAction(input: ReminderInput): Promise<{ error?: string }> {
  if (!input.clientId) return { error: "Choose the client." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueOn)) return { error: "Choose the date." };
  if (input.kind === "other" && !input.note.trim()) return { error: "Type what the reminder is for." };
  const supabase = await requireAdmin();
  const { error } = await supabase.from("client_reminders").insert({
    client_id: input.clientId,
    kind: input.kind,
    due_on: input.dueOn,
    note: input.note.trim() || null,
    email_customer: input.emailCustomer,
  });
  if (error) return { error: error.message };
  revalidatePath("/reminders");
  return {};
}

// Done (dealt with), cancelled, or back to waiting.
export async function setReminderStatusAction(id: string, status: "pending" | "done" | "cancelled"): Promise<{ error?: string }> {
  const supabase = await requireAdmin();
  const { error } = await supabase.from("client_reminders").update({ status }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/reminders");
  return {};
}

export async function changeReminderDateAction(id: string, dueOn: string): Promise<{ error?: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) return { error: "Choose the date." };
  const supabase = await requireAdmin();
  const { error } = await supabase.from("client_reminders").update({ due_on: dueOn, status: "pending", sent_at: null }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/reminders");
  return {};
}

export async function saveReminderSettingsAction(maintenanceMonths: number, repaintYears: number): Promise<{ error?: string }> {
  const clean = (n: number, max: number) => Math.max(0, Math.min(max, Math.round(Number(n) || 0)));
  const supabase = await requireAdmin();
  const { error } = await supabase.from("reminder_settings").upsert(
    {
      id: true,
      maintenance_months: clean(maintenanceMonths, 120),
      repaint_years: clean(repaintYears, 30),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (error) return { error: error.message };
  revalidatePath("/reminders");
  return {};
}
