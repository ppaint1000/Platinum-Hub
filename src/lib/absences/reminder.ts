// 8am on working days: an email to Dion listing everyone with an absence
// still waiting on a reason, with a link to the Absences page. Sent from the
// 8am clock-on run (/api/cron/clock-reminders?kind=on), once a day, and only
// when something is waiting.
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/mailer";
import { notificationRecipients } from "@/lib/notifications/recipients";
import { formatDateKeyShort, nzTodayDateString } from "@/lib/timesheets/formatNZ";
import { flagMissingClockIns } from "./check";

// Always told, whatever the Notifications settings say.
export const ABSENCE_REMINDER_EMAIL = process.env.ABSENCE_REMINDER_EMAIL || "dion@platinumpainters.co.nz";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function sendAbsenceReasonReminder(origin: string): Promise<{ sent: boolean; count: number; skipped?: string }> {
  const db = createAdminClient();
  const today = nzTodayDateString();
  const key = `absence_reasons:${today}`;
  const { data: done } = await db.from("hub_alert_log").select("key").eq("key", key).maybeSingle();
  if (done) return { sent: false, count: 0, skipped: "Already sent today" };

  // Catch up on any missed clock-ins first (normally only runs when an admin opens the Hub).
  try {
    await flagMissingClockIns();
  } catch {
    // Still report what's already flagged.
  }

  const { data: rows } = await db
    .from("absences")
    .select("user_id, absence_date")
    .is("absence_type", null)
    .is("dismissed_at", null)
    .order("absence_date")
    .returns<{ user_id: string; absence_date: string }[]>();
  if (!rows?.length) return { sent: false, count: 0, skipped: "Nothing waiting" };

  const { data: people } = await db
    .from("profiles")
    .select("id, full_name")
    .in("id", [...new Set(rows.map((r) => r.user_id))])
    .returns<{ id: string; full_name: string }[]>();
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.full_name]));

  // Grouped by day, oldest first.
  const byDay = new Map<string, string[]>();
  for (const r of rows) {
    const list = byDay.get(r.absence_date) ?? [];
    list.push(nameOf.get(r.user_id) ?? "Unknown");
    byDay.set(r.absence_date, list);
  }
  const days = [...byDay.entries()].map(([d, names]) => ({ label: formatDateKeyShort(d), names: names.sort() }));
  const link = `${origin}/absences`;
  const n = rows.length;

  const subject = `${n} absence${n === 1 ? "" : "s"} need${n === 1 ? "s" : ""} a reason`;
  const text = [
    "Hi Dion,",
    "",
    `These absences still need a reason recorded:`,
    "",
    ...days.map((d) => `${d.label}: ${d.names.join(", ")}`),
    "",
    `Record them on the Absences page: ${link}`,
  ].join("\n");
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;color:#16202E;max-width:520px;font-size:15px;line-height:1.5">` +
    `<p>Hi Dion,</p><p>These absences still need a reason recorded:</p>` +
    `<table style="border-collapse:collapse;font-size:14px">` +
    days
      .map(
        (d) =>
          `<tr><td style="padding:4px 16px 4px 0;vertical-align:top;font-weight:bold;white-space:nowrap">${esc(d.label)}</td>` +
          `<td style="padding:4px 0">${d.names.map(esc).join(", ")}</td></tr>`
      )
      .join("") +
    `</table>` +
    `<p style="margin-top:20px"><a href="${link}" style="display:inline-block;padding:12px 16px;border-radius:8px;background:#16202E;color:#ffffff;text-decoration:none;font-weight:bold">Open Absences</a></p>` +
    `<p style="color:#5B6472;font-size:13px">Platinum Hub</p></div>`;

  let extra: string[] = [];
  try {
    extra = await notificationRecipients("absence_reasons");
  } catch {
    // Still goes to the fixed address.
  }
  const to = [...new Map([ABSENCE_REMINDER_EMAIL, ...extra].map((e) => [e.toLowerCase(), e])).values()].join(", ");
  const r = await sendEmail({ to, subject, text, html, fromName: "Platinum Hub - Timesheets" });
  if (!r.sent) return { sent: false, count: n, skipped: r.reason };
  await db.from("hub_alert_log").upsert({ key, detail: subject }, { onConflict: "key", ignoreDuplicates: true });
  return { sent: true, count: n };
}
