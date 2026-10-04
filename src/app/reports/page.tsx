// Reports — every report, grouped like PaintScout's Reports page. Admins only.
import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { OTHER_REPORT_GROUPS, REPORT_GROUPS } from "@/lib/reports/build";
import { DashboardShell } from "@/components/dashboard/parts";
import { ADMIN_NAV, TopBar } from "@/components/dashboard/TopBar";
import { dashboardFontClass } from "@/components/dashboard/fonts";
import { nzTodayDateString } from "@/lib/timesheets/formatNZ";

export const metadata: Metadata = { title: "Reports · Platinum Hub" };

function Tile({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-1 rounded-xl border border-[#E3E1DA] bg-white px-4 py-3.5 transition hover:border-[#9DB6D9] hover:bg-[#F8FAFD]"
    >
      <span className="font-semibold text-[#1F4E8C]">{title}</span>
      <span className="text-sm text-[#5B6472]">{description}</span>
    </Link>
  );
}

export default async function ReportsPage() {
  await requireAdmin();
  return (
    <DashboardShell
      fontClass={dashboardFontClass}
      topBar={<TopBar items={ADMIN_NAV} activeHref="/reports" />}
      todayKey={nzTodayDateString()}
      title="Reports"
    >
      {REPORT_GROUPS.map((g) => (
        <section key={g.title} id={g.title.toLowerCase().replace(/[^a-z]+/g, "-")} aria-label={g.title} className="flex scroll-mt-24 flex-col gap-3">
          <h2 className="text-lg font-bold text-[#16202E]">{g.title}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.reports.map((r) => (
              <Tile key={r.slug} href={`/reports/${r.slug}`} title={r.title} description={r.description} />
            ))}
          </div>
        </section>
      ))}
      {OTHER_REPORT_GROUPS.map((g) => (
        <section key={g.title} id={g.title.toLowerCase().replace(/[^a-z]+/g, "-")} aria-label={g.title} className="flex scroll-mt-24 flex-col gap-3">
          <h2 className="text-lg font-bold text-[#16202E]">{g.title}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.reports.map((r) => (
              <Tile key={r.href} {...r} />
            ))}
          </div>
        </section>
      ))}
    </DashboardShell>
  );
}
