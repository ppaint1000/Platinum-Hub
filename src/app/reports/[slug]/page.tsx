// One report (see lib/reports/build.ts). Admins only.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { loadReportJobs } from "@/lib/reports/load";
import { buildReport, REPORT_GROUPS } from "@/lib/reports/build";
import { parsePeriod, parseRange } from "@/lib/reports/range";
import { ReportView } from "@/components/reports/ReportView";
import { DashboardShell } from "@/components/dashboard/parts";
import { ADMIN_NAV, TopBar } from "@/components/dashboard/TopBar";
import { dashboardFontClass } from "@/components/dashboard/fonts";
import { nzTodayDateString } from "@/lib/timesheets/formatNZ";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const title = REPORT_GROUPS.flatMap((g) => g.reports).find((r) => r.slug === slug)?.title ?? "Report";
  return { title: `${title} · Reports · Platinum Hub` };
}

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ range?: string; by?: string }>;
}) {
  const [{ slug }, { range: rangeParam, by }] = await Promise.all([params, searchParams]);
  const supabase = await requireAdmin();
  const range = parseRange(rangeParam);
  const report = buildReport(slug, await loadReportJobs(supabase), range, parsePeriod(by));
  if (!report) notFound();

  return (
    <DashboardShell
      fontClass={dashboardFontClass}
      topBar={<TopBar items={ADMIN_NAV} activeHref="/reports" />}
      todayKey={nzTodayDateString()}
      title={report.title}
    >
      <ReportView report={report} range={range} />
    </DashboardShell>
  );
}
