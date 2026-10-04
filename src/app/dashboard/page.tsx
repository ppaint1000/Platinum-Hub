import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { loadDashboard } from "@/lib/dashboard/data";
import { loadWorkflow } from "@/lib/dashboard/workflow";
import { nzTodayDateString } from "@/lib/timesheets/formatNZ";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { dashboardFontClass } from "@/components/dashboard/fonts";

export const metadata: Metadata = { title: "Dashboard · Platinum Hub" };

// Admin-only. The proxy already redirects non-admins away from /dashboard;
// requireAdmin checks again here so the page never renders for anyone else.
export default async function DashboardPage() {
  const supabase = await requireAdmin();
  const [data, workflow, { count: pendingAbsences }] = await Promise.all([
    loadDashboard(supabase),
    loadWorkflow(supabase, nzTodayDateString().slice(0, 7)),
    // Staff flagged by the 9am check who still need a reason recorded.
    supabase
      .from("absences")
      .select("id", { count: "exact", head: true })
      .is("absence_type", null)
      .is("dismissed_at", null),
  ]);

  return <Dashboard data={data} workflow={workflow} fontClass={dashboardFontClass} pendingAbsences={pendingAbsences ?? 0} />;
}
