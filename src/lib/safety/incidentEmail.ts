// A new incident report: whoever wants to know (Notifications page -
// admins by default) is emailed straight away. Never throws.
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/mailer";
import { notificationRecipients } from "@/lib/notifications/recipients";
import { SITE_URL } from "@/lib/timesheets/siteUrl";

export async function sendIncidentEmail(reportId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: r } = await admin
      .from("safety_reports")
      .select("id, report_date, location, data, site:sites(name), author:profiles!safety_reports_created_by_fkey(full_name)")
      .eq("id", reportId)
      .maybeSingle<{
        id: string;
        report_date: string;
        location: string | null;
        data: Record<string, unknown>;
        site: { name: string } | null;
        author: { full_name: string } | null;
      }>();
    if (!r) return;
    const to = (await notificationRecipients("safety_incident")).join(", ");
    if (!to) return;
    const d = r.data;
    const s = (k: string) => (typeof d[k] === "string" ? (d[k] as string).trim() : "");
    const people = Array.isArray(d.people_involved) ? (d.people_involved as string[]).join(", ") : "";
    const where = [r.site?.name, r.location].filter(Boolean).join(" - ") || "not given";
    await sendEmail({
      to,
      fromName: "Platinum Painters Hub",
      subject: `Incident reported: ${s("incident_type") || "Incident"} at ${where}`,
      text:
        `${r.author?.full_name ?? "Someone"} reported an incident.\n\n` +
        `Type: ${s("incident_type") || "-"}\nWhen: ${r.report_date}${s("time") ? " " + s("time") : ""}\nWhere: ${where}\n` +
        (people ? `People involved: ${people}\n` : "") +
        `Treatment: ${s("treatment") || "-"}\nNotifiable to WorkSafe: ${s("notifiable") || "-"}\n\n` +
        `What happened:\n${s("what_happened") || "-"}\n\n` +
        `Full report: ${SITE_URL}/safety/reports/${r.id}\n`,
    });
  } catch (e) {
    console.error("[incident email]", e);
  }
}
