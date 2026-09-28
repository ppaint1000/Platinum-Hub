import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { loadDashboard } from "@/lib/dashboard/data";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { dashboardFontClass } from "@/components/dashboard/fonts";

export const metadata: Metadata = { title: "Dashboard · Platinum Hub" };

// Admin-only. The proxy already redirects non-admins away from /dashboard;
// requireAdmin checks again here so the page never renders for anyone else.
export default async function DashboardPage() {
  const supabase = await requireAdmin();
  const [data, { count: pendingAbsences }] = await Promise.all([
    loadDashboard(supabase),
    // Staff flagged by the 9am check who still need a reason recorded.
    supabase.from("absences").select("id", { count: "exact", head: true }).is("absence_type", null),
  ]);

  return <Dashboard data={data} fontClass={dashboardFontClass} pendingAbsences={pendingAbsences ?? 0} />;
}
