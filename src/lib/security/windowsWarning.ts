// Hub WARNING: someone signed in on a Windows computer they haven't used for
// the Hub before. Every admin gets an email with the subject "Hub WARNING",
// repeated every 15 minutes (Supabase's scheduler -> /api/cron/security-warnings)
// until an admin opens the link in it and confirms they've read it
// (/security/ack/<token>). Table: supabase/security_windows_warning.sql.
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/mailer";
import { formatNZDateTime } from "@/lib/timesheets/formatNZ";
import { deviceLabel, describePlace } from "./describe";
import { deviceNames } from "./deviceNames";

export const WARNING_SUBJECT = "Hub WARNING";
const RESEND_MINUTES = 15;

export const isWindows = (ua: string | null | undefined) => !!ua && /Windows/.test(ua);

type Warning = {
  id: string;
  session_id: string | null;
  user_id: string | null;
  user_agent: string | null;
  ip: string | null;
  city: string | null;
  country: string | null;
  signed_in_at: string;
  ack_token: string;
  send_count: number;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Every active admin - this goes to all of them, whatever their Notifications settings.
async function adminEmails(): Promise<string[]> {
  const { data } = await createAdminClient()
    .from("profiles")
    .select("email")
    .eq("role", "admin")
    .eq("is_active", true)
    .is("deleted_at", null);
  return [...new Set((data ?? []).map((p) => p.email as string | null).filter((e): e is string => !!e))];
}

async function sendWarning(w: Warning, origin: string): Promise<boolean> {
  const db = createAdminClient();
  const to = await adminEmails();
  if (!to.length) return false;
  const { data: person } = w.user_id
    ? await db.from("profiles").select("full_name, role").eq("id", w.user_id).maybeSingle()
    : { data: null };
  const name = (person?.full_name as string | undefined) ?? "Someone";
  const role = person?.role as string | undefined;
  const { data: signIn } = w.session_id
    ? await db.from("hub_sign_ins").select("device_id").eq("session_id", w.session_id).maybeSingle()
    : { data: null };
  const deviceId = (signIn?.device_id as string | null) ?? null;
  const device = deviceLabel(w.user_agent, deviceId, (await deviceNames([deviceId])).get(deviceId ?? ""));
  const place = describePlace(w.city, w.country, w.ip);
  const when = formatNZDateTime(w.signed_in_at);
  const ack = `${origin}/security/ack/${w.ack_token}`;
  const repeat = w.send_count > 0 ? ` (reminder ${w.send_count + 1})` : "";

  const text = [
    `${name}${role ? ` (${role})` : ""} signed in to the Hub on a Windows computer they haven't used before.${repeat}`,
    "",
    `When: ${when}`,
    `Device: ${device}`,
    `Where: ${place}`,
    "",
    `This email repeats every ${RESEND_MINUTES} minutes until an admin confirms they've read it:`,
    ack,
    "",
    `If this wasn't them, turn their account off or reset their password in Users: ${origin}/users`,
  ].join("\n");
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;color:#16202E;max-width:560px;font-size:15px;line-height:1.5">` +
    `<p style="font-size:18px;font-weight:bold;color:#D21F26">Hub WARNING${esc(repeat)}</p>` +
    `<p><strong>${esc(name)}</strong>${role ? ` (${esc(role)})` : ""} signed in to the Hub on a <strong>Windows computer</strong> they haven't used before.</p>` +
    `<p>When: ${esc(when)}<br>Device: ${esc(device)}<br>Where: ${esc(place)}</p>` +
    `<p><a href="${ack}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#D21F26;color:#ffffff;text-decoration:none;font-weight:bold">I've read this - stop the warnings</a></p>` +
    `<p style="color:#5B6472;font-size:13px">This email repeats every ${RESEND_MINUTES} minutes until an admin confirms. If this wasn't them, turn their account off or reset their password in <a href="${origin}/users">Users</a>.</p></div>`;

  const r = await sendEmail({ to: to.join(", "), subject: WARNING_SUBJECT, text, html, fromName: "The Hub" });
  if (!r.sent) return false;
  await db
    .from("hub_security_warnings")
    .update({ send_count: w.send_count + 1, last_sent_at: new Date().toISOString() })
    .eq("id", w.id);
  return true;
}

// From the new-device route: record the warning and send the first email.
export async function startWindowsWarning(
  row: { session_id: string; user_id: string; user_agent: string | null; ip: string | null; city: string | null; country: string | null; created_at: string },
  origin: string
): Promise<boolean> {
  const db = createAdminClient();
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const { data, error } = await db
    .from("hub_security_warnings")
    .upsert(
      {
        session_id: row.session_id,
        user_id: row.user_id,
        user_agent: row.user_agent,
        ip: row.ip,
        city: row.city,
        country: row.country,
        signed_in_at: row.created_at,
        ack_token: token,
      },
      { onConflict: "session_id", ignoreDuplicates: true }
    )
    .select("id, session_id, user_id, user_agent, ip, city, country, signed_in_at, ack_token, send_count")
    .maybeSingle<Warning>();
  if (error || !data) return false;
  return sendWarning(data, origin);
}

// Every 15 minutes: resend any warning nobody has confirmed yet.
export async function resendOpenWarnings(origin: string): Promise<{ sent: number; open: number }> {
  const db = createAdminClient();
  // A minute's slack so a run landing slightly early still counts.
  const cutoff = new Date(Date.now() - (RESEND_MINUTES - 1) * 60 * 1000).toISOString();
  const { data } = await db
    .from("hub_security_warnings")
    .select("id, session_id, user_id, user_agent, ip, city, country, signed_in_at, ack_token, send_count, last_sent_at")
    .is("acknowledged_at", null)
    .or(`last_sent_at.is.null,last_sent_at.lte.${cutoff}`)
    .returns<Warning[]>();
  let sent = 0;
  for (const w of data ?? []) if (await sendWarning(w, origin)) sent++;
  return { sent, open: data?.length ?? 0 };
}

export async function warningByToken(token: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const { data } = await createAdminClient()
    .from("hub_security_warnings")
    .select("id, user_id, user_agent, signed_in_at, acknowledged_at, acknowledged_by, send_count, profiles(full_name)")
    .eq("ack_token", token)
    .maybeSingle();
  return data;
}
