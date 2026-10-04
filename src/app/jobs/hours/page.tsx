// Hours to approve — timesheet hours only count on a job once an admin
// approves them, a painter's week on a job at a time. Admins only. In the
// dashboard frame (top bar, colours) like Absences.
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { groupEntries, loadHoursEntries, loadNoRate } from "@/lib/jobs/hoursApproval";
import { HoursApproval } from "@/components/jobs/HoursApproval";
import { DashboardShell } from "@/components/dashboard/parts";
import { dashboardFontClass } from "@/components/dashboard/fonts";
import { nzTodayDateString } from "@/lib/timesheets/formatNZ";

export const metadata: Metadata = { title: "Hours to approve · Platinum Hub" };

// Approved groups stay listed this long, so a mistake can be undone.
const UNDO_DAYS = 14;

export default async function HoursToApprovePage() {
  const supabase = await requireAdmin();
  const [entries, noRate] = await Promise.all([loadHoursEntries(supabase, UNDO_DAYS), loadNoRate(supabase)]);

  const waiting = groupEntries(entries.filter((e) => !e.approved_at));
  const approved = groupEntries(entries.filter((e) => e.approved_at)).sort((a, b) =>
    (b.approvedAt ?? "").localeCompare(a.approvedAt ?? "")
  );

  return (
    <DashboardShell
      fontClass={dashboardFontClass}
      // The Jobs layout draws the top bar.
      topBar={null}
      todayKey={nzTodayDateString()}
      title="Hours to approve"
    >
      <HoursApproval waiting={waiting} approved={approved} noRate={noRate} undoDays={UNDO_DAYS} />
    </DashboardShell>
  );
}
