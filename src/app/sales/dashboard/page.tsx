import type { Metadata } from "next";
import { getSalesViewer } from "@/lib/sales/viewer";
import { loadSalesDashboard } from "@/lib/sales/dashboard";
import { SalesDashboard } from "@/components/sales/SalesDashboard";
import { SalesTabs } from "@/components/sales/SalesTabs";
import { dashboardFontClass } from "@/components/dashboard/fonts";

export const metadata: Metadata = { title: "My sales · Platinum Hub" };

// A salesperson's own dashboard - where sales staff land after signing in.
// Admins and sales authority also get the Sales tabs here.
export default async function MySalesPage() {
  const viewer = await getSalesViewer();
  const [data, team] = await Promise.all([
    loadSalesDashboard(viewer.supabase, [{ id: viewer.userId, name: viewer.fullName }]),
    viewer.canSeeAll ? viewer.loadTeam() : Promise.resolve([]),
  ]);

  return (
    <SalesDashboard
      data={data}
      fontClass={dashboardFontClass}
      nav={viewer.nav()}
      activeHref={viewer.canSeeAll ? "/sales" : "/sales/dashboard"}
      title="My sales"
      canOpenJobs={viewer.canOpenJobs}
      tabs={
        viewer.canSeeAll && (
          <SalesTabs
            team={team}
            viewerId={viewer.userId}
            inSalesTeam
            canEditBudgets={viewer.isAdmin}
            activeHref="/sales/dashboard"
          />
        )
      }
    />
  );
}
