// Drips (like DripJobs): automatic customer emails at each stage. A trigger
// (a new enquiry, a proposal sent, a job paid or lost) puts the customer on
// that stage's sequence; each email goes a set number of days after the
// last, and the sequence stops when it no longer applies (the proposal is
// accepted, the enquiry becomes a site measure...) or they unsubscribe.
// Runs on the server with the service role - see supabase/drips.sql.
// Never throws.
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/mailer";
import { SITE_URL } from "@/lib/timesheets/siteUrl";

export type DripTrigger = "request_created" | "proposal_sent" | "job_paid" | "job_lost";

export const TRIGGER_LABEL: Record<DripTrigger, string> = {
  request_created: "When someone enquires",
  proposal_sent: "When a proposal is sent",
  job_paid: "When a job is paid",
  job_lost: "When a quote is lost",
};

export const PLACEHOLDERS = [
  ["{first_name}", "Their first name"],
  ["{job}", "The job / address"],
  ["{proposal_link}", "Link to their proposal"],
  ["{proposal_code}", "Their 6-digit proposal code"],
  ["{review_link}", "Your Google review link"],
  ["{phone}", "Our phone number"],
] as const;

const PHONE = "021 116 4005";
const DAY = 86_400_000;
const EVERY_MS = 15 * 60 * 1000;
let lastRun = 0;

type Enrolment = {
  id: string;
  sequence_id: string;
  client_id: string | null;
  request_id: string | null;
  proposal_id: string | null;
  job_id: string | null;
  email: string;
  name: string | null;
  next_step: number;
  sequence: { trigger: DripTrigger; active: boolean } | null;
};

type Step = { id: string; step_order: number; delay_days: number; subject: string; body: string };

async function stepsOf(sequenceId: string): Promise<Step[]> {
  const { data } = await createAdminClient()
    .from("drip_steps")
    .select("id, step_order, delay_days, subject, body")
    .eq("sequence_id", sequenceId)
    .order("step_order")
    .returns<Step[]>();
  return data ?? [];
}

// Puts someone on the sequence for this trigger (once per enquiry /
// proposal / job). The first email goes straight away if its delay is 0.
export async function enrolDrip(input: {
  trigger: DripTrigger;
  email: string | null | undefined;
  name?: string | null;
  clientId?: string | null;
  requestId?: string | null;
  proposalId?: string | null;
  jobId?: string | null;
}): Promise<void> {
  try {
    const email = input.email?.trim();
    if (!email || !email.includes("@")) return;
    const admin = createAdminClient();
    const { data: seq } = await admin
      .from("drip_sequences")
      .select("id, active")
      .eq("trigger", input.trigger)
      .maybeSingle<{ id: string; active: boolean }>();
    if (!seq?.active) return;
    if (await optedOut(email, input.clientId ?? null, input.trigger)) return;
    const steps = await stepsOf(seq.id);
    if (!steps.length) return;

    const { data: row, error } = await admin
      .from("drip_enrolments")
      .insert({
        sequence_id: seq.id,
        client_id: input.clientId ?? null,
        request_id: input.requestId ?? null,
        proposal_id: input.proposalId ?? null,
        job_id: input.jobId ?? null,
        email,
        name: input.name?.trim() || null,
        next_step: 0,
        next_send_at: new Date(Date.now() + steps[0].delay_days * DAY).toISOString(),
      })
      .select("id")
      .single<{ id: string }>();
    // Already on it (the unique indexes) - nothing to do.
    if (error || !row) return;
    if (steps[0].delay_days === 0) await processDue(row.id);
  } catch (e) {
    console.error("[drips] enrol", e);
  }
}

// Off for this customer: unsubscribed, the client's Automatic emails
// switch off, or this one automation unticked on their client page.
async function optedOut(email: string, clientId: string | null, trigger?: DripTrigger): Promise<boolean> {
  const admin = createAdminClient();
  const [{ data: c }, { data: r }] = await Promise.all([
    clientId
      ? admin.from("clients").select("drip_opt_out, drip_off").eq("id", clientId).maybeSingle<{ drip_opt_out: boolean; drip_off: string[] | null }>()
      : Promise.resolve({ data: null }),
    admin.from("requests").select("id").ilike("email", email).eq("drip_opt_out", true).limit(1),
  ]);
  if (c?.drip_opt_out) return true;
  if (trigger && c?.drip_off?.includes(trigger)) return true;
  if ((r ?? []).length) return true;
  const { data: oc } = await admin.from("clients").select("id").ilike("email", email).eq("drip_opt_out", true).limit(1);
  return (oc ?? []).length > 0;
}

// Why this sequence should stop now, if it should.
async function stopReason(e: Enrolment): Promise<string | null> {
  const admin = createAdminClient();
  if (!e.sequence?.active) return "Sequence turned off";
  if (await optedOut(e.email, e.client_id, e.sequence.trigger)) return "Turned off for this client";
  switch (e.sequence.trigger) {
    case "request_created": {
      const { data } = await admin.from("requests").select("status").eq("id", e.request_id ?? "").maybeSingle<{ status: string }>();
      if (!data) return "Enquiry removed";
      if (data.status === "converted") return "Became a site measure";
      if (data.status === "declined") return "Enquiry declined";
      return null;
    }
    case "proposal_sent": {
      const { data } = await admin
        .from("proposals")
        .select("accepted_at, declined_at")
        .eq("id", e.proposal_id ?? "")
        .maybeSingle<{ accepted_at: string | null; declined_at: string | null }>();
      if (!data) return "Proposal removed";
      if (data.accepted_at) return "Proposal accepted";
      if (data.declined_at) return "Proposal declined";
      return null;
    }
    case "job_lost": {
      const { data } = await admin.from("jobs").select("status").eq("id", e.job_id ?? "").maybeSingle<{ status: string }>();
      return data?.status === "lost" ? null : "No longer lost";
    }
    default:
      return null;
  }
}

async function fill(e: Enrolment, text: string): Promise<{ text: string; missing: string | null }> {
  const admin = createAdminClient();
  let job = "";
  let proposalLink = "";
  let proposalCode = "";
  if (e.proposal_id) {
    const { data } = await admin
      .from("proposals")
      .select("token, access_code, quotes(location)")
      .eq("id", e.proposal_id)
      .maybeSingle<{ token: string; access_code: string | null; quotes: { location: string | null } | null }>();
    if (data) {
      proposalLink = `${SITE_URL}/p/${data.token}`;
      proposalCode = data.access_code ?? "";
      job = data.quotes?.location?.trim() ?? "";
    }
  }
  if (!job && e.job_id) {
    const { data } = await admin.from("jobs").select("name").eq("id", e.job_id).maybeSingle<{ name: string }>();
    job = data?.name ?? "";
  }
  if (!job && e.request_id) {
    const { data } = await admin.from("requests").select("address").eq("id", e.request_id).maybeSingle<{ address: string | null }>();
    job = data?.address ?? "";
  }
  const { data: settings } = await admin.from("drip_settings").select("google_review_url").maybeSingle<{ google_review_url: string | null }>();
  const review = settings?.google_review_url?.trim() ?? "";

  const values: Record<string, string> = {
    "{first_name}": e.name?.trim().split(/\s+/)[0] || "there",
    "{job}": job || "your painting job",
    "{proposal_link}": proposalLink,
    "{proposal_code}": proposalCode,
    "{review_link}": review,
    "{phone}": PHONE,
  };
  let missing: string | null = null;
  if (text.includes("{review_link}") && !review) missing = "No Google review link set (Drips page)";
  if (text.includes("{proposal_link}") && !proposalLink) missing = "No proposal link";
  let out = text;
  for (const [k, v] of Object.entries(values)) out = out.split(k).join(v);
  return { text: out, missing };
}

// Sends the next email for one enrolment if it's due.
async function processDue(enrolmentId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: e } = await admin
    .from("drip_enrolments")
    .select("id, sequence_id, client_id, request_id, proposal_id, job_id, email, name, next_step, sequence:drip_sequences(trigger, active)")
    .eq("id", enrolmentId)
    .eq("status", "active")
    .lte("next_send_at", new Date().toISOString())
    .maybeSingle<Enrolment>();
  if (!e) return;

  const reason = await stopReason(e);
  if (reason) {
    await admin.from("drip_enrolments").update({ status: "stopped", stopped_reason: reason, next_send_at: null }).eq("id", e.id);
    return;
  }

  const steps = await stepsOf(e.sequence_id);
  const step = steps[e.next_step];
  if (!step) {
    await admin.from("drip_enrolments").update({ status: "done", next_send_at: null }).eq("id", e.id);
    return;
  }

  // Claim it first, so two page loads at once can't both send it.
  const { data: claimed } = await admin
    .from("drip_enrolments")
    .update({ next_send_at: null })
    .eq("id", e.id)
    .eq("next_step", e.next_step)
    .not("next_send_at", "is", null)
    .select("id");
  if (!claimed?.length) return;

  const subject = await fill(e, step.subject);
  const body = await fill(e, step.body);
  const missing = subject.missing ?? body.missing;
  // No Google review link yet: wait a day and try again, rather than lose
  // the review request.
  if (missing?.startsWith("No Google review link")) {
    await admin.from("drip_enrolments").update({ next_send_at: new Date(Date.now() + DAY).toISOString() }).eq("id", e.id);
    return;
  }
  if (missing) {
    await admin.from("drip_sends").insert({ enrolment_id: e.id, step_id: step.id, to_email: e.email, subject: subject.text, sent: false, error: missing });
    await admin.from("drip_enrolments").update({ status: "stopped", stopped_reason: missing }).eq("id", e.id);
    return;
  }

  const unsubscribe = `${SITE_URL}/u/${e.id}`;
  const result = await sendEmail({
    to: e.email,
    fromName: "Platinum Painters",
    subject: subject.text,
    text: `${body.text}\n\n--\nDon't want emails like this? Unsubscribe: ${unsubscribe}\n`,
  });
  await admin.from("drip_sends").insert({
    enrolment_id: e.id,
    step_id: step.id,
    to_email: e.email,
    subject: subject.text,
    sent: result.sent,
    error: result.sent ? null : result.reason,
  });

  const next = steps[e.next_step + 1];
  await admin
    .from("drip_enrolments")
    .update(
      next
        ? { next_step: e.next_step + 1, next_send_at: new Date(Date.now() + next.delay_days * DAY).toISOString() }
        : { next_step: e.next_step + 1, status: "done", next_send_at: null }
    )
    .eq("id", e.id);
}

// Jobs marked Paid or Lost in the last week join their sequences (whichever
// page marked them), then everything due is sent. Runs when anyone opens a
// Hub page, at most every 15 minutes per server.
export async function runDrips(): Promise<void> {
  if (Date.now() - lastRun < EVERY_MS) return;
  lastRun = Date.now();
  try {
    const admin = createAdminClient();
    const { data: settings } = await admin.from("drip_settings").select("paused").maybeSingle<{ paused: boolean }>();
    if (!settings || settings.paused) return;

    const weekAgo = new Date(Date.now() - 7 * DAY).toISOString();
    const [{ data: paid }, { data: lost }] = await Promise.all([
      admin
        .from("jobs")
        .select("id, client:clients(id, name, email)")
        .eq("status", "paid")
        .gte("paid_at", weekAgo)
        .returns<{ id: string; client: { id: string; name: string; email: string | null } | null }[]>(),
      admin
        .from("jobs")
        .select("id, client:clients(id, name, email)")
        .eq("status", "lost")
        .gte("lost_at", weekAgo.slice(0, 10))
        .returns<{ id: string; client: { id: string; name: string; email: string | null } | null }[]>(),
    ]);
    for (const j of paid ?? []) await enrolDrip({ trigger: "job_paid", email: j.client?.email, name: j.client?.name, clientId: j.client?.id, jobId: j.id });
    for (const j of lost ?? []) await enrolDrip({ trigger: "job_lost", email: j.client?.email, name: j.client?.name, clientId: j.client?.id, jobId: j.id });

    const { data: due } = await admin
      .from("drip_enrolments")
      .select("id")
      .eq("status", "active")
      .lte("next_send_at", new Date().toISOString())
      .limit(50)
      .returns<{ id: string }[]>();
    for (const d of due ?? []) await processDue(d.id);
  } catch (e) {
    console.error("[drips]", e);
  }
}

// The customer's unsubscribe link: stops this and every other sequence for
// their email, and marks them so they're never added again.
export async function unsubscribe(enrolmentId: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data: e } = await admin
      .from("drip_enrolments")
      .select("email, client_id, request_id")
      .eq("id", enrolmentId)
      .maybeSingle<{ email: string; client_id: string | null; request_id: string | null }>();
    if (!e) return false;
    await admin.from("drip_enrolments").update({ status: "stopped", stopped_reason: "Unsubscribed", next_send_at: null }).ilike("email", e.email).eq("status", "active");
    if (e.client_id) await admin.from("clients").update({ drip_opt_out: true }).eq("id", e.client_id);
    await admin.from("clients").update({ drip_opt_out: true }).ilike("email", e.email);
    await admin.from("requests").update({ drip_opt_out: true }).ilike("email", e.email);
    return true;
  } catch (err) {
    console.error("[drips] unsubscribe", err);
    return false;
  }
}
