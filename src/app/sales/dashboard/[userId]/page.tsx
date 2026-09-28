import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSalesViewer } from "@/lib/sales/viewer";
import { loadSalesDashboard } from "@/lib/sales/dashboard";
import { SalesDashboard } from "@/components/sales/SalesDashboard";
import { dashboardFontClass } from "@/components/dashboard/fonts";

export const metadata: Metadata = { title: "Sales dashboard · Platinum Hub" };

// Any salesperson's dashboard, exactly as they see it - opened from the
// Sales page by admins and sales authority. Everyone else only ever gets
// their own (RLS would hide other people's jobs and budgets anyway).
export default async function SalesPersonDashboardPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const viewer = await getSalesViewer();

  if (!viewer.canSeeAll || userId === viewer.userId) redirect("/sales/dashboard");

  const { data: person } = await viewer.supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle<{ full_name: string }>();
  if (!person) redirect("/sales");

  const data = await loadSalesDashboard(viewer.supabase, userId);

  return (
    <SalesDashboard
      data={data}
      fontClass={dashboardFontClass}
      nav={viewer.nav()}
      activeHref="/sales"
      title={`${person.full_name} · sales`}
      canOpenJobs={viewer.canOpenJobs}
      backLink={{ href: "/sales", label: "All sales staff" }}
    />
  );
}
