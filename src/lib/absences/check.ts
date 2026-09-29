// Who hasn't clocked in. Runs whenever an admin opens a page with the top
// bar (see TopBar): from 9am NZ on a working day, anyone active with
// Timesheets ticked (not admins or supervisors - admins record supervisors'
// absences by hand) who hasn't clocked in gets an absences row
// with no type, and the Absences tab lights up until an admin records why.
//
// It also catches up on earlier working days nobody opened the Hub on, back
// to when this started (ABSENCES_START) or two weeks, whichever is later.
// Safe to run on every page load: a person/day already flagged or already
// recorded is left alone.

import { createAdminClient } from "@/lib/supabase/admin";
import { addDays, nzDateKey, nzDayStartUtcIso, nzTodayDateString } from "@/lib/timesheets/formatNZ";
import { publicHolidayOn } from "./holidays";

const CHECK_HOUR = 9;
const ABSENCES_START = "2026-09-29";
const CATCH_UP_DAYS = 14;

function nzHour(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", hour: "numeric", hourCycle: "h23" }).format(now)
  );
}

const isWeekday = (dateKey: string) => {
  const dow = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  return dow !== 0 && dow !== 6;
};

async function flagMissingClockIns() {
  const admin = createAdminClient();
  const today = nzTodayDateString();

  // Working days to check: today once it's 9am, plus any earlier ones.
  const earliest = [ABSENCES_START, addDays(today, -CATCH_UP_DAYS)].sort().at(-1) as string;
  const candidates: string[] = [];
  for (let d = earliest; d <= today; d = addDays(d, 1)) {
    if (d === today && nzHour(new Date()) < CHECK_HOUR) continue;
    if (isWeekday(d) && !publicHolidayOn(d)) candidates.push(d);
  }
  if (candidates.length === 0) return;

  const [{ data: closed }, { data: access }, { data: entries }, { data: existing }] = await Promise.all([
    admin.from("closed_days").select("day").in("day", candidates),
    admin.from("user_app_access").select("user_id").eq("timesheets", true),
    admin.from("timesheet_entries").select("user_id, clock_in_at").gte("clock_in_at", nzDayStartUtcIso(candidates[0])),
    // Includes deleted (dismissed) ones, so a deleted absence is never re-flagged.
    admin.from("absences").select("user_id, absence_date").gte("absence_date", candidates[0]),
  ]);

  const closedDays = new Set((closed ?? []).map((c) => c.day as string));
  const days = candidates.filter((d) => !closedDays.has(d));
  const ids = (access ?? []).map((a) => a.user_id as string);
  if (days.length === 0 || ids.length === 0) return;

  const { data: staff } = await admin
    .from("profiles")
    .select("id")
    .in("id", ids)
    .eq("is_active", true)
    // Supervisors' absences are recorded by hand, so they're never flagged.
    .not("role", "in", "(admin,supervisor)")
    .returns<{ id: string }[]>();

  const present = new Set((entries ?? []).map((e) => `${e.user_id}|${nzDateKey(e.clock_in_at as string)}`));
  const done = new Set((existing ?? []).map((a) => `${a.user_id}|${a.absence_date}`));

  const rows = days.flatMap((day) =>
    (staff ?? [])
      .filter((s) => !present.has(`${s.id}|${day}`) && !done.has(`${s.id}|${day}`))
      .map((s) => ({ user_id: s.id, absence_date: day, flagged_by_check: true }))
  );
  if (rows.length === 0) return;

  // ignoreDuplicates: two admins loading pages at once can't double up.
  await admin.from("absences").upsert(rows, { onConflict: "user_id,absence_date", ignoreDuplicates: true });
}

// For the top bar: runs the check, then how many absences need a reason.
// Never throws - a failed check just means no highlight this time.
export async function pendingAbsenceCount(): Promise<number> {
  try {
    await flagMissingClockIns();
    const { count } = await createAdminClient()
      .from("absences")
      .select("id", { count: "exact", head: true })
      .is("absence_type", null)
      .is("dismissed_at", null);
    return count ?? 0;
  } catch {
    return 0;
  }
}
