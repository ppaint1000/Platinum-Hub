// Who gets a notification email: everyone it applies to who has it turned
// on (their choice on the Notifications page, else the default), narrowed
// by their option - e.g. "My quotes" only for quotes they're the
// salesperson on. Read with the service role; server-side only.
import { createAdminClient } from "@/lib/supabase/admin";
import { notificationByKey, type Audience } from "./catalog";

// The address payroll/timesheet emails always go to.
export const FIXED_TIMESHEET_ADDRESS = process.env.WEEKLY_REPORT_EMAIL || "nrichmond@platinumpainters.co.nz";

type Person = {
  id: string;
  email: string | null;
  role: string;
  user_app_access: { sales: boolean } | { sales: boolean }[] | null;
};

export function audienceOf(role: string, hasSales: boolean): Audience | null {
  if (role === "admin") return "admin";
  if (role === "supervisor") return "supervisor";
  if (role === "sales" && hasSales) return "sales";
  return null;
}

export async function notificationRecipients(
  key: string,
  opts: { ownerUserId?: string | null; firstView?: boolean } = {}
): Promise<string[]> {
  const n = notificationByKey(key);
  if (!n) return [];
  const admin = createAdminClient();
  const [{ data: people }, { data: prefs }] = await Promise.all([
    admin
      .from("profiles")
      .select("id, email, role, user_app_access(sales)")
      .eq("is_active", true)
      .is("deleted_at", null)
      .returns<Person[]>(),
    admin
      .from("notification_preferences")
      .select("user_id, enabled, scope")
      .eq("key", key)
      .returns<{ user_id: string; enabled: boolean; scope: string | null }[]>(),
  ]);
  const prefBy = new Map((prefs ?? []).map((p) => [p.user_id, p]));

  const emails: string[] = [];
  for (const p of people ?? []) {
    if (!p.email) continue;
    const access = Array.isArray(p.user_app_access) ? p.user_app_access[0] : p.user_app_access;
    const aud = audienceOf(p.role, !!access?.sales);
    if (!aud || !n.audiences.includes(aud)) continue;
    const pref = prefBy.get(p.id);
    const enabled = pref?.enabled ?? n.defaultOn[aud] ?? false;
    if (!enabled) continue;
    const scope = pref?.scope ?? n.defaultScope?.[aud] ?? null;

    if (scope === "mine" && opts.ownerUserId !== p.id) continue;
    if (key === "proposal_viewed") {
      // Sales staff only hear about their own quotes.
      if (aud === "sales" && opts.ownerUserId !== p.id) continue;
      if (scope !== "each" && !opts.firstView) continue;
    }
    emails.push(p.email);
  }
  return [...new Set(emails)];
}

// The fixed address plus anyone who's opted in, for timesheet emails.
export async function timesheetRecipients(key: string): Promise<string> {
  let extra: string[] = [];
  try {
    extra = await notificationRecipients(key);
  } catch {
    // Still goes to the fixed address.
  }
  const all = [FIXED_TIMESHEET_ADDRESS, ...extra];
  return [...new Map(all.map((e) => [e.toLowerCase(), e])).values()].join(", ");
}
