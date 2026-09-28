// Sales overview for admins and sales authority: the whole team's figures
// added together, how each salesperson is tracking, and tabs to each
// person's dashboard and the budget tables. Plain sales staff get their own
// dashboard (/sales/dashboard) instead.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSalesViewer } from "@/lib/sales/viewer";
import { loadSalesDashboard } from "@/lib/sales/dashboard";
import { SalesDashboard } from "@/components/sales/SalesDashboard";
import { SalesTabs } from "@/components/sales/SalesTabs";
import { dashboardFontClass } from "@/components/dashboard/fonts";

export const metadata: Metadata = { title: "Sales · Platinum Hub" };

export default async function SalesOverviewPage() {
  const viewer = await getSalesViewer();
  if (!viewer.canSeeAll) redirect("/sales/dashboard");

  const team = await viewer.loadTeam();
  const data = await loadSalesDashboard(viewer.supabase, team);

  return (
    <SalesDashboard
      data={data}
      fontClass={dashboardFontClass}
      nav={viewer.nav()}
      activeHref="/sales"
      title="Sales · overall"
      canOpenJobs={viewer.canOpenJobs}
      overall
      tabs={
        <SalesTabs
          team={team}
          viewerId={viewer.userId}
          inSalesTeam={viewer.inSalesTeam}
          canEditBudgets={viewer.isAdmin}
          activeHref="/sales"
        />
      }
    />
  );
}
