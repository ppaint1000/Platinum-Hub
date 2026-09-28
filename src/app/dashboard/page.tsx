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
  const data = await loadDashboard(supabase);

  return <Dashboard data={data} fontClass={dashboardFontClass} />;
}
