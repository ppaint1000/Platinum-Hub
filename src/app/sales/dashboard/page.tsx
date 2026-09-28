import type { Metadata } from "next";
import { getSalesViewer } from "@/lib/sales/viewer";
import { loadSalesDashboard } from "@/lib/sales/dashboard";
import { SalesDashboard } from "@/components/sales/SalesDashboard";
import { dashboardFontClass } from "@/components/dashboard/fonts";

export const metadata: Metadata = { title: "My sales · Platinum Hub" };

// A salesperson's own dashboard - where sales staff land after signing in.
export default async function MySalesPage() {
  const viewer = await getSalesViewer();
  const data = await loadSalesDashboard(viewer.supabase, viewer.userId);

  return (
    <SalesDashboard
      data={data}
      fontClass={dashboardFontClass}
      nav={viewer.nav()}
      activeHref={viewer.isAdmin ? "/sales" : "/sales/dashboard"}
      title="My sales"
      canOpenJobs={viewer.canOpenJobs}
      backLink={viewer.isAdmin ? { href: "/sales", label: "All sales staff" } : undefined}
    />
  );
}
