// Emails to the customer about their booked job (like Tradify's appointment
// confirmations and reminders):
//  - "Your painting job is booked" when a booking is saved with that ticked
//    (and again if its dates change), and
//  - a reminder the day before it starts, when that's ticked.
// Sent to the client's email on their Clients page. Never throws.
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/mailer";
import { addDays, nzTodayDateString } from "@/lib/timesheets/formatNZ";

const PHONE = "021 116 4005";
const EVERY_MS = 15 * 60 * 1000;
let lastRun = 0;

type JobInfo = {
  name: string;
  client: { name: string; email: string | null; address: string | null } | null;
  site: string | null;
};

const longDay = (key: string) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

async function jobInfo(jobId: string): Promise<JobInfo | null> {
  const admin = createAdminClient();
  const { data: job } = await admin
    .from("jobs")
    .select("name, source_quote_id, client:clients(name, email, address)")
    .eq("id", jobId)
    .maybeSingle<{
      name: string;
      source_quote_id: string | null;
      client: { name: string; email: string | null; address: string | null } | null;
    }>();
  if (!job) return null;
  let site: string | null = null;
  if (job.source_quote_id) {
    const { data: p } = await admin
      .from("proposals")
      .select("site_address")
      .eq("quote_id", job.source_quote_id)
      .maybeSingle<{ site_address: string | null }>();
    site = p?.site_address?.trim() || null;
  }
  return { name: job.name, client: job.client, site: site ?? job.client?.address?.trim() ?? null };
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || "there";

// Returns why it couldn't send (shown to whoever saved the booking), or null.
export async function emailBookingConfirmation(
  bookingId: string,
  jobId: string,
  start: string,
  end: string,
  changed: boolean
): Promise<string | null> {
  try {
    const info = await jobInfo(jobId);
    const to = info?.client?.email?.trim();
    if (!info || !to) return "The customer has no email address on their Clients page, so they weren't emailed.";
    const where = info.site ? ` at ${info.site}` : "";
    const when = start === end ? `on ${longDay(start)}` : `from ${longDay(start)} to ${longDay(end)}`;
    const result = await sendEmail({
      to,
      fromName: "Platinum Painters",
      subject: changed ? "Your painting job - new dates" : "Your painting job is booked",
      text:
        `Hi ${firstName(info.client!.name)},\n\n` +
        (changed
          ? `The dates for your painting job${where} have changed. We're now booked ${when}.\n\n`
          : `Your painting job${where} is booked ${when}.\n\n`) +
        `Our team will be on site from the morning of the first day. Weather can sometimes move things - if it does, we'll let you know.\n\n` +
        `Any questions, just reply to this email or call us on ${PHONE}.\n\n` +
        `Thanks,\nPlatinum Painters\n`,
    });
    if (!result.sent) return `The customer email didn't send (${result.reason}).`;
    await createAdminClient().from("job_bookings").update({ customer_emailed_at: new Date().toISOString() }).eq("id", bookingId);
    return null;
  } catch (e) {
    console.error("[booking email]", e);
    return "The customer email didn't send.";
  }
}

// The day-before reminders. Runs when anyone opens a Hub page, at most
// every 15 minutes per server; each booking's reminder goes once.
export async function runBookingReminders(): Promise<void> {
  if (Date.now() - lastRun < EVERY_MS) return;
  lastRun = Date.now();
  try {
    const admin = createAdminClient();
    const tomorrow = addDays(nzTodayDateString(), 1);
    const { data: due } = await admin
      .from("job_bookings")
      .select("id, job_id, start_date")
      .eq("remind_customer", true)
      .is("customer_reminded_at", null)
      .eq("start_date", tomorrow)
      .returns<{ id: string; job_id: string; start_date: string }[]>();

    for (const b of due ?? []) {
      // Claim it first, so two page loads at once can't both send it.
      const { data: claimed } = await admin
        .from("job_bookings")
        .update({ customer_reminded_at: new Date().toISOString() })
        .eq("id", b.id)
        .is("customer_reminded_at", null)
        .select("id");
      if (!claimed?.length) continue;
      const info = await jobInfo(b.job_id);
      const to = info?.client?.email?.trim();
      if (!info || !to) continue;
      await sendEmail({
        to,
        fromName: "Platinum Painters",
        subject: "Reminder: we start your painting job tomorrow",
        text:
          `Hi ${firstName(info.client!.name)},\n\n` +
          `Just a reminder that our team starts your painting job${info.site ? ` at ${info.site}` : ""} tomorrow, ${longDay(b.start_date)}.\n\n` +
          `It helps if there's clear access to the areas we're painting and somewhere to park. ` +
          `Any questions, reply to this email or call us on ${PHONE}.\n\n` +
          `Thanks,\nPlatinum Painters\n`,
      });
    }
  } catch (e) {
    console.error("[booking reminders]", e);
  }
}
