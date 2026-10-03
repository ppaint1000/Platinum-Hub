import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/mailer";
import { notificationRecipients } from "@/lib/notifications/recipients";

// A job's online proposal was sent / viewed / accepted:
//  - sent: the link was copied to send to the customer - recorded, a draft
//    job becomes quoted, and the admins are emailed a reminder with the link.
//  - viewed: the customer opened it (count and last time) - emailed to
//    whoever wants to know (Notifications page: first view or each view).
//  - accepted: the customer signed - the job is marked won at the accepted
//    total (including any options they chose), and the admins are emailed.
// Called by the Costing pages and the old Measures webhook route.

export type ProposalActivity = {
  sourceQuoteId: string;
  event: "sent" | "viewed" | "accepted";
  proposalUrl: string;
  location: string | null;
  customerName: string | null;
  viewCount?: number;
  lastViewedAt?: string | null;
  acceptedName?: string | null;
  acceptedTotal?: number | null;
};

const money = (n: number) => "$" + n.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function recordProposalActivity(
  body: ProposalActivity,
  origin: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  const admin = createAdminClient();
  const { data: job } = await admin
    .from("jobs")
    .select("id, name, status, lead_by_user_id")
    .eq("source_quote_id", body.sourceQuoteId)
    .maybeSingle<{ id: string; name: string; status: string; lead_by_user_id: string | null }>();
  // The costing hasn't reached the Hub yet (e.g. never saved) - nothing to update.
  if (!job) return { status: 404, body: { ok: false, reason: "No Hub job for this costing yet." } };

  const jobName = body.location?.trim() || job.name;
  const who = body.customerName?.trim() || "the customer";
  const jobLink = `${origin}/jobs/${job.id}`;
  const update: Record<string, unknown> = { proposal_url: body.proposalUrl };
  // Which notification this is (Notifications page), and its email.
  let notify: string | null = null;
  let email: { subject: string; text: string } | null = null;

  if (body.event === "sent") {
    update.proposal_sent_at = new Date().toISOString();
    if (job.status === "draft") update.status = "quoted";
    notify = "proposal_sent";
    email = {
      subject: `Proposal sent: ${jobName} (${who})`,
      text:
        `The proposal link for ${jobName} was copied to send to ${who}.\n\n` +
        `Reminder: follow up if it hasn't been accepted in a week. You'll see when they open it on the Sales dashboard.\n\n` +
        `Customer's link:\n${body.proposalUrl}\n\nJob in the Hub:\n${jobLink}\n`,
    };
  } else if (body.event === "viewed") {
    update.proposal_viewed_at = body.lastViewedAt ?? new Date().toISOString();
    if (typeof body.viewCount === "number") update.proposal_view_count = body.viewCount;
    notify = "proposal_viewed";
    const times = typeof body.viewCount === "number" && body.viewCount > 1 ? ` (opened ${body.viewCount} times now)` : "";
    email = {
      subject: `Proposal opened: ${jobName} (${who})`,
      text:
        `${who} just opened the proposal for ${jobName}${times}.\n\n` +
        `A good time to follow up.\n\nCustomer's link:\n${body.proposalUrl}\n\nJob in the Hub:\n${jobLink}\n`,
    };
  } else {
    update.proposal_accepted_at = new Date().toISOString();
    // Only moves forward - a job already under way stays where it is.
    if (job.status === "draft" || job.status === "quoted") update.status = "won";
    if (typeof body.acceptedTotal === "number") update.quoted_sell_total = body.acceptedTotal;
    notify = "proposal_accepted";
    email = {
      subject: `Proposal accepted: ${jobName}`,
      text:
        `${body.acceptedName ?? who} accepted the proposal for ${jobName}` +
        (typeof body.acceptedTotal === "number" ? ` at ${money(body.acceptedTotal)} + GST` : "") +
        `.\n\nThe job is now marked Won in the Hub.\n\nSigned proposal:\n${body.proposalUrl}\n\nJob in the Hub:\n${jobLink}\n`,
    };
  }

  const { error } = await admin.from("jobs").update(update).eq("id", job.id);
  if (error) return { status: 500, body: { error: error.message } };

  let emailed: boolean | null = null;
  if (email && notify) {
    const to = (
      await notificationRecipients(notify, {
        ownerUserId: job.lead_by_user_id,
        firstView: body.event === "viewed" ? (body.viewCount ?? 1) <= 1 : undefined,
      })
    ).join(", ");
    if (to) {
      const result = await sendEmail({ to, fromName: "Platinum Painters Hub", ...email });
      emailed = result.sent;
    }
  }

  return { status: 200, body: { ok: true, emailed } };
}
