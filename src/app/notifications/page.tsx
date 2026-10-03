// Notifications — each person picks which Hub emails they get (like
// PaintScout's), and sees the alerts that show inside the Hub. Admins,
// sales staff and supervisors; the list shows only what applies to them.
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { EMAIL_NOTIFICATIONS, HUB_ALERTS } from "@/lib/notifications/catalog";
import { audienceOf, FIXED_TIMESHEET_ADDRESS } from "@/lib/notifications/recipients";
import { NotificationsForm, type NotificationChoice } from "@/components/notifications/NotificationsForm";
import { DashboardShell } from "@/components/dashboard/parts";
import { ADMIN_NAV, SUPERVISOR_NAV, TopBar, staffNav } from "@/components/dashboard/TopBar";
import { dashboardFontClass } from "@/components/dashboard/fonts";
import { nzTodayDateString } from "@/lib/timesheets/formatNZ";

export const metadata: Metadata = { title: "Notifications · Platinum Hub" };

type Access = { timesheets: boolean; jobs: boolean; orders: boolean; fleet: boolean; sales: boolean; sales_authority: boolean };

export default async function NotificationsPage() {
  const profile = await getCurrentProfile();
  const supabase = await createClient();
  const [{ data: access }, { data: prefs }, { data: me }] = await Promise.all([
    supabase
      .from("user_app_access")
      .select("timesheets, jobs, orders, fleet, sales, sales_authority")
      .eq("user_id", profile.id)
      .maybeSingle<Access>(),
    supabase
      .from("notification_preferences")
      .select("key, enabled, scope")
      .eq("user_id", profile.id)
      .returns<{ key: string; enabled: boolean; scope: string | null }[]>(),
    supabase.from("profiles").select("email").eq("id", profile.id).maybeSingle<{ email: string | null }>(),
  ]);
  const aud = audienceOf(profile.role, !!access?.sales);
  const prefBy = new Map((prefs ?? []).map((p) => [p.key, p]));

  const choices: NotificationChoice[] = aud
    ? EMAIL_NOTIFICATIONS.filter((n) => n.audiences.includes(aud)).map((n) => {
        const pref = prefBy.get(n.key);
        return {
          key: n.key,
          group: n.group,
          label: n.label,
          description: n.description,
          options: n.options ?? [],
          enabled: pref?.enabled ?? n.defaultOn[aud] ?? false,
          scope: pref?.scope ?? n.defaultScope?.[aud] ?? null,
          fixedAddress: n.alsoFixedAddress ? FIXED_TIMESHEET_ADDRESS : null,
        };
      })
    : [];
  const alerts = aud ? HUB_ALERTS.filter((a) => a.audiences.includes(aud)) : [];

  const nav =
    profile.role === "admin"
      ? ADMIN_NAV
      : profile.role === "supervisor"
        ? SUPERVISOR_NAV
        : staffNav({
            timesheets: access?.timesheets,
            jobs: access?.jobs,
            orders: access?.orders,
            fleet: access?.fleet,
            salesAuthority: access?.sales_authority,
          });

  return (
    <DashboardShell
      fontClass={dashboardFontClass}
      topBar={<TopBar items={nav} activeHref="/notifications" />}
      todayKey={nzTodayDateString()}
      title="Notifications"
    >
      <NotificationsForm choices={choices} alerts={alerts} email={me?.email ?? null} />
    </DashboardShell>
  );
}
