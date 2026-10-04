// The Schedule calendar (like Tradify's Scheduler): one row per painter for
// the week, each job booking a bar across the days it runs, plus who's away
// (Absences) and public holidays. Admins and supervisors only - the
// schedule_* database functions check.
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicHolidayOn } from "@/lib/absences/holidays";
import { addDays } from "@/lib/timesheets/formatNZ";

export type ScheduleStaff = { id: string; full_name: string; role: string };

export type ScheduleJob = {
  id: string;
  job_number: string | null;
  name: string;
  client_name: string | null;
  status: string;
  address: string | null;
  work_order_url: string | null;
};

export type Booking = {
  id: string;
  job_id: string;
  start_date: string;
  end_date: string;
  crew: string[];
  notes: string | null;
  email_customer: boolean;
  remind_customer: boolean;
  customer_emailed_at: string | null;
  customer_reminded_at: string | null;
};

export type ScheduleAbsence = { user_id: string; absence_date: string; absence_type: string | null };

export type ScheduleDay = { key: string; holiday: string | null; weekend: boolean };

export type ScheduleData = {
  weekStart: string;
  days: ScheduleDay[];
  staff: ScheduleStaff[];
  jobs: ScheduleJob[];
  bookings: Booking[];
  absences: ScheduleAbsence[];
  // Set when the database script hasn't been run yet.
  notReady: boolean;
};

export async function loadSchedule(supabase: SupabaseClient, weekStart: string): Promise<ScheduleData> {
  const weekEnd = addDays(weekStart, 6);
  const days = Array.from({ length: 7 }, (_, i) => {
    const key = addDays(weekStart, i);
    return { key, holiday: publicHolidayOn(key)?.name ?? null, weekend: i >= 5 };
  });

  const [staffRes, jobsRes, bookingsRes, absencesRes] = await Promise.all([
    supabase.rpc("schedule_staff"),
    supabase.rpc("schedule_jobs"),
    supabase
      .from("job_bookings")
      .select("id, job_id, start_date, end_date, crew, notes, email_customer, remind_customer, customer_emailed_at, customer_reminded_at")
      .lte("start_date", weekEnd)
      .gte("end_date", weekStart)
      .order("start_date")
      .returns<Booking[]>(),
    supabase.rpc("schedule_absences", { p_from: weekStart, p_to: weekEnd }),
  ]);

  return {
    weekStart,
    days,
    staff: (staffRes.data ?? []) as ScheduleStaff[],
    jobs: (jobsRes.data ?? []) as ScheduleJob[],
    bookings: bookingsRes.data ?? [],
    absences: (absencesRes.data ?? []) as ScheduleAbsence[],
    notReady: !!bookingsRes.error && /job_bookings/.test(bookingsRes.error.message),
  };
}
