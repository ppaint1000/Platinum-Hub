// Proposal follow-up reminders: the salesperson (and anyone else who's
// turned it on - Notifications page) is emailed when a sent proposal
//  - hasn't been opened 3 days after it was sent, or
//  - was opened but hasn't been accepted 7 days after it was last opened.
// Each reminder goes once per proposal.
// The customer also gets one polite reminder (with their link and code) a
// set number of days after it was sent, if they haven't accepted or
// declined and it hasn't expired (Settings → Proposal templates). Runs when an admin opens a Hub page
// (like the absence check), at most every 15 minutes per server.
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/mailer";
import { notificationRecipients } from "@/lib/notifications/recipients";
import { SITE_URL } from "@/lib/timesheets/siteUrl";

const UNOPENED_DAYS = 3;
const FOLLOW_UP_DAYS = 7;
const EVERY_MS = 15 * 60 * 1000;
let lastRun = 0;

type Row = {
  id: string;
  token: string;
  access_code: string | null;
  quote_id: string;
  sent_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
  expires_on?: string | null;
  quotes: {
    location: string | null;
    owner_id: string | null;
    customers: { name: string; email?: string | null } | null;
  } | null;
};

const daysAgoIso = (days: number) => new Date(Date.now() - days * 86400000).toISOString();
const nzDay = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-NZ", { day: "numeric", month: "short", timeZone: "Pacific/Auckland" }) : "";

export async function runProposalFollowUps(): Promise<void> {
  if (Date.now() - lastRun < EVERY_MS) return;
  lastRun = Date.now();
  try {
    const admin = createAdminClient();
    const select =
      "id, token, access_code, quote_id, sent_at, last_viewed_at, view_count, quotes(location, owner_id, customers:clients(name))";
    const [{ data: unopened }, { data: stale }] = await Promise.all([
      admin
        .from("proposals")
        .select(select)
        .not("sent_at", "is", null)
        .is("accepted_at", null)
        .eq("view_count", 0)
        .is("reminded_unopened_at", null)
        .is("declined_at", null)
        .lt("sent_at", daysAgoIso(UNOPENED_DAYS))
        .returns<Row[]>(),
      admin
        .from("proposals")
        .select(select)
        .gt("view_count", 0)
        .is("accepted_at", null)
        .is("reminded_followup_at", null)
        .is("declined_at", null)
        .lt("last_viewed_at", daysAgoIso(FOLLOW_UP_DAYS))
        .returns<Row[]>(),
    ]);

    for (const p of unopened ?? []) await remind(p, "unopened");
    for (const p of stale ?? []) await remind(p, "followup");
    await remindCustomers();
  } catch (e) {
    console.error("[proposal follow-ups]", e);
  }
}

async function remind(p: Row, kind: "unopened" | "followup") {
  const admin = createAdminClient();
  const column = kind === "unopened" ? "reminded_unopened_at" : "reminded_followup_at";
  // Claim it first, so two page loads at once can't both send it.
  const { data: claimed } = await admin
    .from("proposals")
    .update({ [column]: new Date().toISOString() })
    .eq("id", p.id)
    .is(column, null)
    .select("id");
  if (!claimed?.length) return;

  const to = (await notificationRecipients("proposal_follow_up", { ownerUserId: p.quotes?.owner_id ?? null })).join(", ");
  if (!to) return;

  const job = p.quotes?.location?.trim() || "a job";
  const who = p.quotes?.customers?.name?.trim() || "the customer";
  const link = `${SITE_URL}/p/${p.token}`;
  const hubLink = `${SITE_URL}/costing/${p.quote_id}/proposal`;
  const resend = p.access_code ? `\n\nTheir link: ${link}\nTheir code: ${p.access_code}` : `\n\nTheir link: ${link}`;

  const email =
    kind === "unopened"
      ? {
          subject: `Not opened yet: proposal for ${job} (${who})`,
          text:
            `The proposal for ${job} was sent to ${who} on ${nzDay(p.sent_at)} and hasn't been opened yet.\n\n` +
            `Worth a call to check they got it.${resend}\n\nIn the Hub: ${hubLink}\n`,
        }
      : {
          subject: `Time to follow up: proposal for ${job} (${who})`,
          text:
            `${who} opened the proposal for ${job} (${p.view_count} time${p.view_count === 1 ? "" : "s"}, last on ${nzDay(p.last_viewed_at)}) ` +
            `but hasn't accepted it.\n\nA good time to follow up.${resend}\n\nIn the Hub: ${hubLink}\n`,
        };

  await sendEmail({ to, fromName: "Platinum Painters Hub", ...email });
}

// The customer's reminder: once, N days after sending (0 = off).
async function remindCustomers() {
  const admin = createAdminClient();
  const { data: settings } = await admin
    .from("proposal_settings")
    .select("customer_reminder_days")
    .maybeSingle<{ customer_reminder_days: number | null }>();
  const days = settings?.customer_reminder_days ?? 7;
  if (days <= 0) return;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" });

  const { data: due } = await admin
    .from("proposals")
    .select("id, token, access_code, quote_id, sent_at, last_viewed_at, view_count, expires_on, quotes(location, owner_id, customers:clients(name, email))")
    .not("sent_at", "is", null)
    .is("accepted_at", null)
    .is("declined_at", null)
    .is("customer_reminded_at", null)
    .lt("sent_at", daysAgoIso(days))
    // Not proposals sent long ago (before this started) - only recent ones.
    .gt("sent_at", daysAgoIso(days + 14))
    .returns<Row[]>();

  for (const p of due ?? []) {
    if (p.expires_on && p.expires_on < today) continue;
    const to = p.quotes?.customers?.email?.trim();
    if (!to) continue;
    const { data: claimed } = await admin
      .from("proposals")
      .update({ customer_reminded_at: new Date().toISOString() })
      .eq("id", p.id)
      .is("customer_reminded_at", null)
      .select("id");
    if (!claimed?.length) continue;

    const name = p.quotes?.customers?.name?.trim().split(/s+/)[0] || "there";
    const job = p.quotes?.location?.trim();
    const until = p.expires_on
      ? new Date(`${p.expires_on}T00:00:00Z`).toLocaleDateString("en-NZ", { day: "numeric", month: "long", timeZone: "UTC" })
      : null;
    await sendEmail({
      to,
      fromName: "Platinum Painters",
      subject: "Your painting proposal from Platinum Painters",
      text:
        `Hi ${name},

` +
        `Just checking you received our painting proposal${job ? ` for ${job}` : ""}. ` +
        `You can view it, choose any options and accept it online here:

${SITE_URL}/p/${p.token}
` +
        (p.access_code ? `Your code to open it: ${p.access_code}
` : "") +
        (until ? `
The price is held until ${until}.
` : "") +
        `
If you have any questions, or would like anything changed, just reply to this email or call us on 021 116 4005.

` +
        `Thanks,
Platinum Painters
`,
    });
  }
}
