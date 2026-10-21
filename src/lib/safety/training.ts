// Health & safety → Training: who has which training, when it runs out,
// and the reminder email (30 days before, and again once it's expired) -
// sent from the 7am daily run. See supabase/safety_training.sql.
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/mailer";
import { notificationRecipients } from "@/lib/notifications/recipients";
import { nzTodayDateString } from "@/lib/timesheets/formatNZ";
import { currentRecords, expiryState, fmtDay, TRAINING_WARN_DAYS, type TrainingRecord } from "./trainingShared";

export * from "./trainingShared";

// One email listing anything newly due (within 30 days) or newly expired -
// each record is mentioned once per stage (hub_alert_log), and only while
// it's the person's current record for that course and they're still on
// staff.
export async function sendTrainingExpiryAlerts(origin: string): Promise<{ sent: number }> {
  const db = createAdminClient();
  const [{ data: records }, { data: courses }, { data: people }] = await Promise.all([
    db.from("training_records").select("*").returns<TrainingRecord[]>(),
    db.from("training_courses").select("id, name").returns<{ id: string; name: string }[]>(),
    db.from("profiles").select("id, full_name").eq("is_active", true).is("deleted_at", null).returns<{ id: string; full_name: string }[]>(),
  ]);
  const courseName = new Map((courses ?? []).map((c) => [c.id, c.name]));
  const personName = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const today = nzTodayDateString();

  const items: { key: string; line: string; expired: boolean }[] = [];
  for (const r of currentRecords(records ?? []).values()) {
    if (!personName.has(r.user_id) || r.outcome !== "done" || !r.expires_on) continue;
    const state = expiryState(r.expires_on, today);
    if (state === "ok") continue;
    const key = `training_${state}:${r.id}`;
    const { data: done } = await db.from("hub_alert_log").select("key").eq("key", key).maybeSingle();
    if (done) continue;
    const who = `${personName.get(r.user_id)} - ${courseName.get(r.course_id) ?? "Training"}`;
    items.push({
      key,
      expired: state === "expired",
      line: state === "expired" ? `${who}: expired ${fmtDay(r.expires_on)}` : `${who}: expires ${fmtDay(r.expires_on)}`,
    });
  }
  if (!items.length) return { sent: 0 };

  const to = await notificationRecipients("training_expiry");
  if (!to.length) return { sent: 0 };

  const expired = items.filter((i) => i.expired);
  const due = items.filter((i) => !i.expired);
  const section = (title: string, list: typeof items) => (list.length ? [title, ...list.map((i) => `  • ${i.line}`), ""] : []);
  const htmlSection = (title: string, list: typeof items, colour: string) =>
    list.length
      ? `<p style="margin:12px 0 4px;font-weight:bold;color:${colour}">${title}</p><ul style="margin:0">${list.map((i) => `<li>${i.line}</li>`).join("")}</ul>`
      : "";
  const subject =
    expired.length && due.length
      ? `Training: ${expired.length} expired, ${due.length} expiring soon`
      : expired.length
        ? `Training expired: ${expired.length === 1 ? expired[0].line.split(":")[0] : `${expired.length} people`}`
        : `Training expiring soon: ${due.length === 1 ? due[0].line.split(":")[0] : `${due.length} people`}`;
  const text = [
    ...section("Expired:", expired),
    ...section(`Expiring in the next ${TRAINING_WARN_DAYS} days:`, due),
    `Add the new training in Health & safety → Training: ${origin}/safety/training`,
  ].join("\n");
  const html = `${htmlSection("Expired", expired, "#B91C1C")}${htmlSection(`Expiring in the next ${TRAINING_WARN_DAYS} days`, due, "#B45309")}
<p style="margin-top:16px">Add the new training in <a href="${origin}/safety/training">Health &amp; safety → Training</a>.</p>`;

  const r = await sendEmail({ to: to.join(", "), subject, text, html, fromName: "The Hub" });
  if (!r.sent) return { sent: 0 };
  await db.from("hub_alert_log").upsert(
    items.map((i) => ({ key: i.key, detail: i.line })),
    { onConflict: "key", ignoreDuplicates: true }
  );
  return { sent: items.length };
}
