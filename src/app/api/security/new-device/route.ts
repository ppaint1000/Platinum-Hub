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
import { deviceLabel, describePlace, describeDevice } from "@/lib/security/describe";
import { deviceNames } from "@/lib/security/deviceNames";
import { isWindows, startWindowsWarning } from "@/lib/security/windowsWarning";

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
    .select("session_id, user_id, device_id, user_agent, ip, city, country, created_at, new_device, profiles(full_name, email, role)")
    .eq("session_id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!row?.new_device) return NextResponse.json({ sent: false, reason: "Not a new device" });

  // Once per sign-in.
  const key = `new_device:${sessionId}`;
  const { data: done } = await db.from("hub_alert_log").select("key").eq("key", key).maybeSingle();
  if (done) return NextResponse.json({ sent: false, reason: "Already emailed" });
  await db.from("hub_alert_log").upsert({ key, detail: "New device sign-in" }, { onConflict: "key", ignoreDuplicates: true });

  // Same person, same kind of phone/browser, same internet connection as a
  // sign-in in the last 30 days: almost certainly the same device whose
  // hub_device cookie got wiped (Safari Private Browsing, a Home Screen icon
  // vs Safari, cleared cookies). Still shows as new in the sign-in log, but
  // no email. New Windows computers still go through the warning below.
  if (!isWindows(row.user_agent as string | null) && (await looksLikeKnownDevice(db, row, sessionId))) {
    return NextResponse.json({ sent: false, reason: "Same device type and connection as a recent sign-in" });
  }

  // A new Windows computer: "Hub WARNING" to every admin, repeated every
  // 15 minutes until one confirms (lib/security/windowsWarning.ts).
  if (isWindows(row.user_agent as string | null)) {
    const sent = await startWindowsWarning(
      {
        session_id: sessionId,
        user_id: row.user_id as string,
        user_agent: row.user_agent as string | null,
        ip: row.ip as string | null,
        city: row.city as string | null,
        country: row.country as string | null,
        created_at: row.created_at as string,
      },
      request.nextUrl.origin
    );
    if (sent) return NextResponse.json({ sent, warning: true });
    // Couldn't start the warning (e.g. its table isn't set up yet) - fall back to the normal email.
  }

  const person = (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles) as
    | { full_name: string; email: string; role: string }
    | null;
  const name = person?.full_name ?? "Someone";
  const to = await notificationRecipients("security_new_device");
  if (!to.length) return NextResponse.json({ sent: false, reason: "Nobody has it turned on" });

  const origin = request.nextUrl.origin;
  const deviceId = row.device_id as string | null;
  const device = deviceLabel(row.user_agent as string | null, deviceId, (await deviceNames([deviceId])).get(deviceId ?? ""));
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

  const r = await sendEmail({ to: to.join(", "), subject, text, html, fromName: "The Hub" });
  return NextResponse.json(r);
}

const RECENT_DAYS = 30;

async function looksLikeKnownDevice(
  db: ReturnType<typeof createAdminClient>,
  row: { user_id: unknown; ip: unknown; user_agent: unknown },
  sessionId: string
): Promise<boolean> {
  const ip = row.ip as string | null;
  const ua = row.user_agent as string | null;
  if (!ip || !ua) return false;
  const since = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from("hub_sign_ins")
    .select("user_agent")
    .eq("user_id", row.user_id as string)
    .eq("ip", ip)
    .neq("session_id", sessionId)
    .not("device_id", "is", null)
    .gte("created_at", since)
    .limit(50);
  if (error || !data) return false;
  const kind = describeDevice(ua);
  return data.some((r) => describeDevice(r.user_agent as string | null) === kind);
}
