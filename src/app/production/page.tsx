// Production — every won job, from To be scheduled through to Paid, as a
// board like PaintScout's Production pipeline. Admins and supervisors only;
// supervisors don't see $ and can't move jobs to Invoiced or Paid.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { loadProductionJobs, PAID_SHOWN_DAYS } from "@/lib/jobs/production";
import { ProductionBoard } from "@/components/production/ProductionBoard";
import { DashboardShell } from "@/components/dashboard/parts";
import { ADMIN_NAV, SUPERVISOR_NAV, TopBar } from "@/components/dashboard/TopBar";
import { dashboardFontClass } from "@/components/dashboard/fonts";
import { nzTodayDateString } from "@/lib/timesheets/formatNZ";

export const metadata: Metadata = { title: "Production · Platinum Hub" };


export default async function ProductionPage() {
  const profile = await getCurrentProfile();
  if (profile.role !== "admin" && profile.role !== "supervisor") redirect("/hub");
  const isAdmin = profile.role === "admin";

  const supabase = await createClient();
  const jobs = await loadProductionJobs(supabase);

  return (
    <DashboardShell
      fontClass={dashboardFontClass}
      topBar={<TopBar items={isAdmin ? ADMIN_NAV : SUPERVISOR_NAV} activeHref="/production" />}
      todayKey={nzTodayDateString()}
      title="Production"
    >
      <ProductionBoard jobs={jobs} isAdmin={isAdmin} paidShownDays={PAID_SHOWN_DAYS} />
    </DashboardShell>
  );
}
