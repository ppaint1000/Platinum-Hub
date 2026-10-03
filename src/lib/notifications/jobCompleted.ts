// "Job completed - ready to invoice" email, to whoever has it turned on
// (Notifications page; admins by default). Sent when a job reaches Job
// completed from the Production board, the job page's button or its
// status control. Server-side only; never throws.
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/mailer";
import { notificationRecipients } from "./recipients";

export async function sendJobCompletedEmail(jobId: string): Promise<void> {
  try {
    const { data: job } = await createAdminClient()
      .from("jobs")
      .select("job_number, name, status, client:clients(name)")
      .eq("id", jobId)
      .maybeSingle<{ job_number: string | null; name: string; status: string; client: { name: string } | null }>();
    if (!job || job.status !== "complete") return;

    const to = (await notificationRecipients("job_completed")).join(", ");
    if (!to) return;

    const h = await headers();
    const origin = h.get("origin") ?? `https://${h.get("host")}`;
    const label = job.job_number ? `${job.job_number} ${job.name}` : job.name;
    await sendEmail({
      to,
      fromName: "Platinum Painters Hub",
      subject: `Job completed - ready to invoice: ${label}`,
      text:
        `${label}${job.client?.name ? ` (${job.client.name})` : ""} has been marked Job completed.\n\n` +
        `It's ready to invoice. Once the invoice has gone out, move it to Invoiced on the Production board:\n` +
        `${origin}/production\n\nThe job in the Hub:\n${origin}/jobs/${jobId}\n`,
    });
  } catch (e) {
    console.error("[notifications] job completed email failed", e);
  }
}
