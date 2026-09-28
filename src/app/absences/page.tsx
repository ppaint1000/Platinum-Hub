import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { loadAbsences, type AbsenceRange } from "@/lib/absences/data";
import { AbsencesDashboard } from "@/components/absences/AbsencesDashboard";
import { DashboardShell } from "@/components/dashboard/parts";
import { ADMIN_NAV, TopBar } from "@/components/dashboard/TopBar";
import { dashboardFontClass } from "@/components/dashboard/fonts";

export const metadata: Metadata = { title: "Absences · Platinum Hub" };

// Admin-only: who's been away, why, and the patterns (most common day, by
// person, by month). Fed by the 9am weekday check and by admins.
export default async function AbsencesPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; error?: string; saved?: string }>;
}) {
  const { range: rangeParam, error, saved } = await searchParams;
  const range: AbsenceRange = rangeParam === "year" || rangeParam === "all" ? rangeParam : "12m";

  const supabase = await requireAdmin();
  const data = await loadAbsences(supabase, range);

  return (
    <DashboardShell
      fontClass={dashboardFontClass}
      topBar={<TopBar items={ADMIN_NAV} activeHref="/absences" />}
      todayKey={data.todayKey}
      title="Absences"
    >
      <AbsencesDashboard data={data} error={error} saved={saved === "1"} />
    </DashboardShell>
  );
}
