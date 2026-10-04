// Repaint and maintenance reminders (see supabase/client_reminders.sql):
//  - createJobReminders: when a job is completed, a check-up reminder and a
//    repaint reminder are added for its client (Reminders page settings).
//  - runClientReminders: when one falls due, the customer is emailed (if
//    ticked and they have an email) and the office is told, once. Runs when
//    anyone opens a Hub page, at most every 15 minutes per server.
// Never throws.
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/mailer";
import { notificationRecipients } from "@/lib/notifications/recipients";
import { SITE_URL } from "@/lib/timesheets/siteUrl";
import { nzTodayDateString } from "@/lib/timesheets/formatNZ";

const PHONE = "021 116 4005";
const EVERY_MS = 15 * 60 * 1000;
let lastRun = 0;

export const KIND_LABEL = { maintenance: "Check-up", repaint: "Repaint", other: "Other" } as const;
export type ReminderKind = keyof typeof KIND_LABEL;

function addMonths(key: string, months: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export async function createJobReminders(jobId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const [{ data: job }, { data: settings }] = await Promise.all([
      admin
        .from("jobs")
        .select("id, client_id, status")
        .eq("id", jobId)
        .maybeSingle<{ id: string; client_id: string | null; status: string }>(),
      admin
        .from("reminder_settings")
        .select("maintenance_months, repaint_years")
        .maybeSingle<{ maintenance_months: number; repaint_years: number }>(),
    ]);
    if (!job?.client_id || !settings || !["complete", "invoiced", "paid"].includes(job.status)) return;
    const today = nzTodayDateString();
    const rows = [];
    if (settings.maintenance_months > 0)
      rows.push({ client_id: job.client_id, job_id: job.id, kind: "maintenance", due_on: addMonths(today, settings.maintenance_months) });
    if (settings.repaint_years > 0)
      rows.push({ client_id: job.client_id, job_id: job.id, kind: "repaint", due_on: addMonths(today, settings.repaint_years * 12) });
    if (rows.length) await admin.from("client_reminders").upsert(rows, { onConflict: "job_id,kind", ignoreDuplicates: true });
  } catch (e) {
    console.error("[client reminders] create", e);
  }
}

type DueRow = {
  id: string;
  kind: ReminderKind;
  due_on: string;
  note: string | null;
  email_customer: boolean;
  client: { id: string; name: string; email: string | null; sales_person_id: string | null } | null;
  job: { name: string; completed_at: string | null } | null;
};

function customerEmail(r: DueRow): { subject: string; text: string } {
  const first = r.client?.name.trim().split(/\s+/)[0] || "there";
  const what = r.job?.name ? ` at ${r.job.name}` : "";
  if (r.kind === "maintenance")
    return {
      subject: "Your free paint check-up from Platinum Painters",
      text:
        `Hi ${first},\n\n` +
        `It's been about a year since we painted for you${what}. We'd love to pop round for a free check-up - ` +
        `we'll look over the paintwork and touch up anything that needs it, so it keeps looking its best.\n\n` +
        `Just reply to this email or call us on ${PHONE} to pick a time.\n\nThanks,\nPlatinum Painters\n`,
    };
  if (r.kind === "repaint")
    return {
      subject: "Is it time for a fresh coat? - Platinum Painters",
      text:
        `Hi ${first},\n\n` +
        `It's been a few years since we painted for you${what}. Paint usually lasts 7 to 10 years before it starts to fade and wear, ` +
        `so now's a good time to have a look.\n\n` +
        `If you'd like a free quote, just reply to this email or call us on ${PHONE}.\n\nThanks,\nPlatinum Painters\n`,
    };
  return {
    subject: "A reminder from Platinum Painters",
    text: `Hi ${first},\n\n${r.note?.trim() || "Just a reminder from us."}\n\nAny questions, reply to this email or call us on ${PHONE}.\n\nThanks,\nPlatinum Painters\n`,
  };
}

export async function runClientReminders(): Promise<void> {
  if (Date.now() - lastRun < EVERY_MS) return;
  lastRun = Date.now();
  try {
    const admin = createAdminClient();
    const { data: due } = await admin
      .from("client_reminders")
      .select("id, kind, due_on, note, email_customer, client:clients(id, name, email, sales_person_id), job:jobs(name, completed_at)")
      .eq("status", "pending")
      .lte("due_on", nzTodayDateString())
      .returns<DueRow[]>();

    for (const r of due ?? []) {
      // Claim it first, so two page loads at once can't both send it.
      const { data: claimed } = await admin
        .from("client_reminders")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", r.id)
        .eq("status", "pending")
        .select("id");
      if (!claimed?.length || !r.client) continue;

      const to = r.client.email?.trim();
      let emailed = false;
      if (r.email_customer && to) emailed = (await sendEmail({ to, fromName: "Platinum Painters", ...customerEmail(r) })).sent;

      const office = (await notificationRecipients("client_reminder_due", { ownerUserId: r.client.sales_person_id })).join(", ");
      if (office) {
        await sendEmail({
          to: office,
          fromName: "Platinum Painters Hub",
          subject: `${KIND_LABEL[r.kind]} reminder: ${r.client.name}`,
          text:
            `A ${KIND_LABEL[r.kind].toLowerCase()} reminder for ${r.client.name} is due` +
            (r.job?.name ? ` (job: ${r.job.name})` : "") +
            `.\n\n` +
            (r.note ? `Note: ${r.note}\n\n` : "") +
            (emailed
              ? `They've been emailed. A follow-up call is a good idea.\n\n`
              : r.email_customer
                ? `They weren't emailed (no email address on their Clients page) - give them a call.\n\n`
                : `They weren't emailed (not ticked) - give them a call.\n\n`) +
            `Client: ${SITE_URL}/clients/${r.client.id}\nAll reminders: ${SITE_URL}/reminders\n`,
        });
      }
    }
  } catch (e) {
    console.error("[client reminders]", e);
  }
}
