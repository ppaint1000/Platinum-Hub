"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { emailBookingConfirmation } from "@/lib/schedule/customerEmails";

export type BookingInput = {
  id?: string;
  jobId: string;
  start: string;
  end: string;
  crew: string[];
  notes: string;
  emailCustomer: boolean;
  remindCustomer: boolean;
};

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

// Booking a job on the Schedule (admins and supervisors - the database
// checks). A job still at To be scheduled moves to Scheduled on the
// Production board. Returns a note for the person if the customer email
// couldn't go.
export async function saveBookingAction(input: BookingInput): Promise<{ error?: string; note?: string }> {
  if (!input.jobId) return { error: "Choose the job." };
  if (!isDate(input.start) || !isDate(input.end)) return { error: "Choose the start and finish days." };
  if (input.end < input.start) return { error: "The finish day is before the start day." };

  const supabase = await createClient();
  const row = {
    job_id: input.jobId,
    start_date: input.start,
    end_date: input.end,
    crew: [...new Set(input.crew)],
    notes: input.notes.trim() || null,
    email_customer: input.emailCustomer,
    remind_customer: input.remindCustomer,
    updated_at: new Date().toISOString(),
  };

  let bookingId = input.id;
  let sendEmail = false;
  let changed = false;
  if (input.id) {
    const { data: before } = await supabase
      .from("job_bookings")
      .select("job_id, start_date, end_date, customer_emailed_at, customer_reminded_at")
      .eq("id", input.id)
      .maybeSingle<{ job_id: string; start_date: string; end_date: string; customer_emailed_at: string | null; customer_reminded_at: string | null }>();
    if (!before) return { error: "That booking has gone - refresh the page." };
    const datesMoved = before.start_date !== input.start || before.end_date !== input.end || before.job_id !== input.jobId;
    // New start day: the day-before reminder can go again.
    const update = datesMoved && before.start_date !== input.start ? { ...row, customer_reminded_at: null } : row;
    const { error } = await supabase.from("job_bookings").update(update).eq("id", input.id);
    if (error) return { error: error.message };
    sendEmail = input.emailCustomer && (!before.customer_emailed_at || datesMoved);
    changed = !!before.customer_emailed_at && datesMoved;
  } else {
    const { data, error } = await supabase.from("job_bookings").insert(row).select("id").single<{ id: string }>();
    if (error) return { error: error.message };
    bookingId = data.id;
    sendEmail = input.emailCustomer;
  }

  // To be scheduled → Scheduled.
  const { data: jobs } = await supabase.rpc("schedule_jobs");
  const job = ((jobs ?? []) as { id: string; status: string }[]).find((j) => j.id === input.jobId);
  if (job?.status === "won") await supabase.rpc("production_set_status", { p_job_id: input.jobId, p_status: "scheduled" });

  let note: string | undefined;
  if (sendEmail && bookingId) note = (await emailBookingConfirmation(bookingId, input.jobId, input.start, input.end, changed)) ?? undefined;

  revalidatePath("/schedule");
  revalidatePath("/production");
  return { note };
}

export async function deleteBookingAction(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("job_bookings").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/schedule");
  return {};
}
