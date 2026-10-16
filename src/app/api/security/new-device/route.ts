// Emails admins (Notifications → "When someone signs in on a new device")
// when a person signs in from a phone or computer they haven't used for
// the Hub before. Posted by the request gate (lib/security/signInGate.ts)
// with that person's own sign-in cookies; only that sign-in can be
// reported, and only once.
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/mailer";
import { notificationRecipients } from "@/lib/notifications/recipients";
import { formatNZDateTime } from "@/lib/timesheets/formatNZ";
import { describeDevice, describePlace } from "@/lib/security/describe";

export async function POST(request: NextRequest) {
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const { sessionId } = (await request.json().catch(() => ({}))) as { sessionId?: string };
  if (!sessionId) return NextResponse.json({ error: "No session" }, { status: 400 });

  const db = createAdminClient();
  const { data: row } = await db
    .from("hub_sign_ins")
    .select("user_id, user_agent, ip, city, country, created_at, new_device, profiles(full_name, email, role)")
    .eq("session_id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!row?.new_device) return NextResponse.json({ sent: false, reason: "Not a new device" });

  // Once per sign-in.
  const key = `new_device:${sessionId}`;
  const { data: done } = await db.from("hub_alert_log").select("key").eq("key", key).maybeSingle();
  if (done) return NextResponse.json({ sent: false, reason: "Already emailed" });
  await db.from("hub_alert_log").upsert({ key, detail: "New device sign-in" }, { onConflict: "key", ignoreDuplicates: true });

  const person = (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles) as
    | { full_name: string; email: string; role: string }
    | null;
  const name = person?.full_name ?? "Someone";
  const to = await notificationRecipients("security_new_device");
  if (!to.length) return NextResponse.json({ sent: false, reason: "Nobody has it turned on" });

  const origin = request.nextUrl.origin;
  const device = describeDevice(row.user_agent as string | null);
  const place = describePlace(row.city as string | null, row.country as string | null, row.ip as string | null);
  const when = formatNZDateTime(row.created_at as string);
  const subject = `New device sign-in: ${name}`;
  const text = [
    `${name}${person?.role ? ` (${person.role})` : ""} signed in to the Hub on a device they haven't used before.`,
    "",
    `When: ${when}`,
    `Device: ${device}`,
    `Where: ${place}`,
    "",
    `If this wasn't them, turn their account off or reset their password in Users: ${origin}/users`,
    `Sign-in log: ${origin}/users/sign-ins`,
  ].join("\n");
  const html = `<p><strong>${name}</strong>${person?.role ? ` (${person.role})` : ""} signed in to the Hub on a device they haven't used before.</p>
<p>When: ${when}<br>Device: ${device}<br>Where: ${place}</p>
<p style="color:#5B6472">If this wasn't them, turn their account off or reset their password in <a href="${origin}/users">Users</a>. See the <a href="${origin}/users/sign-ins">sign-in log</a>.</p>`;

  const r = await sendEmail({ to: to.join(", "), subject, text, html, fromName: "Platinum Hub - Security" });
  return NextResponse.json(r);
}
