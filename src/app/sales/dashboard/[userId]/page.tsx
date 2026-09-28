import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSalesViewer } from "@/lib/sales/viewer";
import { loadSalesDashboard } from "@/lib/sales/dashboard";
import { SalesDashboard } from "@/components/sales/SalesDashboard";
import { SalesTabs } from "@/components/sales/SalesTabs";
import { dashboardFontClass } from "@/components/dashboard/fonts";

export const metadata: Metadata = { title: "Sales dashboard · Platinum Hub" };

// Any salesperson's dashboard, exactly as they see it - one of the Sales
// tabs for admins and sales authority. Everyone else only ever gets their
// own (RLS would hide other people's jobs and budgets anyway).
export default async function SalesPersonDashboardPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const viewer = await getSalesViewer();

  if (!viewer.canSeeAll || userId === viewer.userId) redirect("/sales/dashboard");

  const team = await viewer.loadTeam();
  const person = team.find((p) => p.id === userId);
  if (!person) redirect("/sales");

  const data = await loadSalesDashboard(viewer.supabase, [person]);

  return (
    <SalesDashboard
      data={data}
      fontClass={dashboardFontClass}
      nav={viewer.nav()}
      activeHref="/sales"
      title={`${person.name} · sales`}
      canOpenJobs={viewer.canOpenJobs}
      tabs={
        <SalesTabs
          team={team}
          viewerId={viewer.userId}
          inSalesTeam={viewer.inSalesTeam}
          canEditBudgets={viewer.isAdmin}
          activeHref={`/sales/dashboard/${person.id}`}
        />
      }
    />
  );
}
