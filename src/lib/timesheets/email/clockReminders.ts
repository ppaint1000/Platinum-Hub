// Clock on / clock off reminder emails, and the "note left at clock-out"
// alert. The reminders are sent by /api/cron/clock-reminders, which
// Supabase's scheduler (pg_cron, supabase/clock_reminders.sql) calls at 8am
// and 4:30pm NZ time.
//
// Working days are the same as Absences: weekdays that aren't an NZ public
// holiday or a closed day. Who: everyone active with Timesheets ticked
// (not admins), who hasn't got an absence recorded for the day.
//   8:00am - anyone not clocked in yet.
//   4:30pm - anyone still clocked in.
// Each person gets each reminder at most once a day (clock_reminder_sends).
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/mailer";
import { publicHolidayOn } from "@/lib/absences/holidays";
import { nzDayStartUtcIso, nzTimeString, nzTodayDateString } from "@/lib/timesheets/formatNZ";
import { notificationRecipients } from "@/lib/notifications/recipients";

export type ReminderKind = "on" | "off";

function nzNow() {
  const parts = new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

// The scheduler fires at both the summer and winter UTC times; only the one
// that lands on 8:00 / 4:30 NZ time sends.
export function isReminderTime(kind: ReminderKind): boolean {
  const m = nzNow();
  return kind === "on" ? m >= 7 * 60 + 55 && m < 8 * 60 + 30 : m >= 16 * 60 + 25 && m < 17 * 60;
}

export async function isWorkingDay(day: string): Promise<boolean> {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  if (dow === 0 || dow === 6 || publicHolidayOn(day)) return false;
  const { data } = await createAdminClient().from("closed_days").select("day").eq("day", day).maybeSingle();
  return !data;
}

export async function sendClockReminders(kind: ReminderKind, origin: string, opts: { force?: boolean } = {}) {
  const day = nzTodayDateString();
  if (!opts.force && !isReminderTime(kind)) return { sent: 0, skipped: "Not reminder time in NZ" };
  if (!(await isWorkingDay(day))) return { sent: 0, skipped: "Not a working day" };

  const admin = createAdminClient();
  const [{ data: access }, { data: absences }, { data: todays }, { data: open }] = await Promise.all([
    admin.from("user_app_access").select("user_id").eq("timesheets", true),
    admin.from("absences").select("user_id").eq("absence_date", day).not("absence_type", "is", null).is("dismissed_at", null),
    admin.from("timesheet_entries").select("user_id").gte("clock_in_at", nzDayStartUtcIso(day)),
    admin.from("timesheet_entries").select("user_id, clock_in_at, sites(name)").is("clock_out_at", null),
  ]);

  const ids = (access ?? []).map((a) => a.user_id as string);
  if (ids.length === 0) return { sent: 0 };
  const { data: people } = await admin
    .from("profiles")
    .select("id, full_name, email")
    .in("id", ids)
    .eq("is_active", true)
    .is("deleted_at", null)
    .neq("role", "admin")
    .returns<{ id: string; full_name: string; email: string | null }[]>();

  const away = new Set((absences ?? []).map((a) => a.user_id as string));
  const clockedInToday = new Set((todays ?? []).map((e) => e.user_id as string));
  const openBy = new Map(
    (open ?? []).map((e) => [
      e.user_id as string,
      { since: e.clock_in_at as string, site: (Array.isArray(e.sites) ? e.sites[0] : e.sites)?.name as string | undefined },
    ])
  );

  const due = (people ?? []).filter(
    (p) =>
      p.email &&
      !away.has(p.id) &&
      (kind === "on" ? !clockedInToday.has(p.id) && !openBy.has(p.id) : openBy.has(p.id))
  );
  if (due.length === 0) return { sent: 0 };

  // Claim each send first, so two runs can never email someone twice.
  const { data: claimed } = await admin
    .from("clock_reminder_sends")
    .upsert(
      due.map((p) => ({ user_id: p.id, day, kind })),
      { onConflict: "user_id,day,kind", ignoreDuplicates: true }
    )
    .select("user_id");
  const claimedIds = new Set((claimed ?? []).map((c) => c.user_id as string));

  const link = `${origin}/timesheets/clock`;
  let sent = 0;
  for (const p of due.filter((d) => claimedIds.has(d.id))) {
    const first = p.full_name.split(" ")[0];
    const shift = openBy.get(p.id);
    const result =
      kind === "on"
        ? await sendEmail({
            to: p.email!,
            fromName: "Platinum Painters Hub",
            subject: "Reminder: clock on for today",
            text:
              `Morning ${first},\n\nYou haven't clocked on yet today. Clock on here when you arrive on site:\n${link}\n\n` +
              `If you're not working today, let the office know.\n\nPlatinum Painters`,
          })
        : await sendEmail({
            to: p.email!,
            fromName: "Platinum Painters Hub",
            subject: "Reminder: clock off when you finish",
            text:
              `Hi ${first},\n\nYou're still clocked on${shift?.site ? ` at ${shift.site}` : ""}` +
              `${shift ? ` (since ${nzTimeString(shift.since)})` : ""}. ` +
              `Remember to clock off when you finish, and enter your lunch break:\n${link}\n\nPlatinum Painters`,
          });
    if (result.sent) sent++;
    else console.error("[clock reminders] email failed", p.id, result.reason);
  }
  return { sent };
}

// A note left when clocking out: tell admins and supervisors (Notifications
// page, on for both by default). Never throws.
export async function sendClockOutNoteAlert(entryId: string, origin: string): Promise<void> {
  try {
    const { data: e } = await createAdminClient()
      .from("timesheet_entries")
      .select("clock_in_at, clock_out_at, break_minutes, notes, profiles(full_name), sites(name)")
      .eq("id", entryId)
      .maybeSingle();
    const notes = (e?.notes as string | null)?.trim();
    if (!e || !notes) return;

    const to = (await notificationRecipients("clock_out_note")).join(", ");
    if (!to) return;
    const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v);
    const name = (one(e.profiles as { full_name: string } | { full_name: string }[] | null)?.full_name) ?? "Someone";
    const site = one(e.sites as { name: string } | { name: string }[] | null)?.name ?? "their site";

    await sendEmail({
      to,
      fromName: "Platinum Painters Hub",
      subject: `Clock-out note from ${name}`,
      text:
        `${name} left a note when clocking out of ${site}` +
        ` (${nzTimeString(e.clock_in_at as string)} - ${e.clock_out_at ? nzTimeString(e.clock_out_at as string) : "?"}` +
        `${e.break_minutes ? `, ${e.break_minutes} min lunch` : ""}):\n\n"${notes}"\n\n` +
        `Timesheets in the Hub:\n${origin}/timesheets/admin\n`,
    });
  } catch (err) {
    console.error("[clock out note] alert failed", err);
  }
}
