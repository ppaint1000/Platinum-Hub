// Repaint and maintenance reminders (like Tradify's service reminders):
// added automatically when a job is completed, or by hand. When one is due
// the customer is emailed and the office told. Admins only.
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { DashboardShell } from "@/components/dashboard/parts";
import { ADMIN_NAV, TopBar } from "@/components/dashboard/TopBar";
import { dashboardFontClass } from "@/components/dashboard/fonts";
import { nzTodayDateString } from "@/lib/timesheets/formatNZ";
import { RemindersList, type ReminderRow } from "@/components/reminders/RemindersList";

export const metadata: Metadata = { title: "Reminders · Platinum Hub" };

export default async function RemindersPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const { client } = await searchParams;
  const supabase = await requireAdmin();
  const [{ data: rows, error }, { data: clients }, { data: settings }] = await Promise.all([
    supabase
      .from("client_reminders")
      .select("id, kind, due_on, note, email_customer, status, sent_at, client:clients(id, name, email), job:jobs(id, name)")
      .order("due_on")
      .returns<ReminderRow[]>(),
    supabase.from("clients").select("id, name").order("name").returns<{ id: string; name: string }[]>(),
    supabase
      .from("reminder_settings")
      .select("maintenance_months, repaint_years")
      .maybeSingle<{ maintenance_months: number; repaint_years: number }>(),
  ]);

  return (
    <DashboardShell
      fontClass={dashboardFontClass}
      topBar={<TopBar items={ADMIN_NAV} activeHref="/clients" />}
      todayKey={nzTodayDateString()}
      title="Repaint & check-up reminders"
    >
      {error ? (
        <p className="rounded-lg border border-[#E3E1DA] bg-white p-4 text-sm">
          Reminders need their database script (client_reminders.sql) run first.
        </p>
      ) : (
        <RemindersList
          rows={rows ?? []}
          clients={clients ?? []}
          today={nzTodayDateString()}
          clientFilter={client ?? null}
          maintenanceMonths={settings?.maintenance_months ?? 12}
          repaintYears={settings?.repaint_years ?? 7}
        />
      )}
    </DashboardShell>
  );
}
