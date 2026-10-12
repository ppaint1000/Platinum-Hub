// The monthly business report (lib/reports/monthlyReport.ts) - one month
// against the month before. Emailed to admins on the 1st; can be sent now
// from here. Admins only.
import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { buildMonthlyReport, reportLines, shiftMonth, monthLabel } from "@/lib/reports/monthlyReport";
import { Card, DashboardShell, Headline, SectionHeading, money } from "@/components/dashboard/parts";
import { ADMIN_NAV, TopBar } from "@/components/dashboard/TopBar";
import { dashboardFontClass } from "@/components/dashboard/fonts";
import { nzTodayDateString } from "@/lib/timesheets/formatNZ";
import { sendMonthlyReportNowAction } from "./actions";

export const metadata: Metadata = { title: "Monthly report · Reports · Platinum Hub" };

export default async function MonthlyReportPage({ searchParams }: { searchParams: Promise<{ month?: string; sent?: string }> }) {
  const { month: monthParam, sent } = await searchParams;
  await requireAdmin();
  const today = nzTodayDateString();
  const thisMonth = today.slice(0, 7);
  const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) && monthParam <= thisMonth ? monthParam : shiftMonth(thisMonth, -1);
  const r = await buildMonthlyReport(month);
  const lines = reportLines(r);
  const c = r.current;

  return (
    <DashboardShell fontClass={dashboardFontClass} topBar={<TopBar items={ADMIN_NAV} activeHref="/reports" />} todayKey={today} title={`Monthly report · ${r.label}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/reports/monthly?month=${shiftMonth(month, -1)}`} className="rounded-full border border-[#D9D6CC] bg-white px-3 py-1.5 text-sm font-semibold hover:border-[#9DB6D9]">
          ← {monthLabel(shiftMonth(month, -1))}
        </Link>
        {month < thisMonth && (
          <Link href={`/reports/monthly?month=${shiftMonth(month, 1)}`} className="rounded-full border border-[#D9D6CC] bg-white px-3 py-1.5 text-sm font-semibold hover:border-[#9DB6D9]">
            {monthLabel(shiftMonth(month, 1))} →
          </Link>
        )}
        <form action={sendMonthlyReportNowAction} className="ml-auto">
          <input type="hidden" name="month" value={month} />
          <button type="submit" className="min-h-10 rounded-lg bg-[#16202E] px-4 text-sm font-semibold text-white hover:bg-black">
            Send by email now
          </button>
        </form>
      </div>
      {sent && (
        <p className={`rounded-lg px-4 py-2 text-sm font-semibold ${sent === "1" ? "bg-green-50 text-green-800" : "bg-red-50 text-[#B91C1C]"}`}>
          {sent === "1" ? "Sent to everyone with the Monthly business report turned on." : "Couldn't send - check Notifications → Monthly business report is on for someone."}
        </p>
      )}
      {month === thisMonth && <p className="text-sm text-[#5B6472]">This month so far - it&apos;s sent on the 1st for the month just finished.</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Headline label="Jobs won" value={money(c.wonValue)}>
          {c.won} jobs
        </Headline>
        <Headline label="Quotes sent" value={money(c.quotedValue)}>
          {c.quotesSent} quotes
        </Headline>
        <Headline label="Claimed" value={money(c.claimed)}>
          Invoiced to customers
        </Headline>
        <Headline label="Live jobs now" value={money(r.live.contract)}>
          {r.live.jobs} jobs · {money(r.live.claimed)} claimed
        </Headline>
      </div>

      <section className="flex flex-col gap-3">
        <SectionHeading title={`${r.label} against ${r.previousLabel}`} />
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[#E3E1DA]">
              <tr>
                <th className="px-3 py-2.5 text-left"></th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-[#16202E]">{r.label}</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-[#5B6472]">{r.previousLabel}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.label} className="border-b border-[#EEEDE8] last:border-0">
                  <td className="px-3 py-2.5 font-semibold">{l.label}</td>
                  <td className="px-3 py-2.5 text-right font-semibold" style={{ color: l.up === true ? "#15803D" : l.up === false ? "#B91C1C" : undefined }}>
                    {l.up === true ? "▲ " : l.up === false ? "▼ " : ""}
                    {l.now}
                  </td>
                  <td className="px-3 py-2.5 text-right text-[#5B6472]">{l.before}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="flex flex-col gap-3">
          <SectionHeading title="Won by lead source" href="/reports/marketing" linkLabel="Marketing ROI" />
          <Card>
            {c.topSources.length === 0 ? (
              <p className="px-4 py-6 text-sm text-[#5B6472]">No jobs won this month.</p>
            ) : (
              <ul className="divide-y divide-[#EEEDE8] text-sm">
                {c.topSources.map((s) => (
                  <li key={s.source} className="flex justify-between px-4 py-2.5">
                    <span className="font-semibold">{s.source}</span>
                    <span>{money(s.value)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
        <section className="flex flex-col gap-3">
          <SectionHeading title="Absences" href="/absences" linkLabel="Absences" />
          <Card>
            {Object.keys(c.absences).length === 0 ? (
              <p className="px-4 py-6 text-sm text-[#5B6472]">No absences recorded.</p>
            ) : (
              <ul className="divide-y divide-[#EEEDE8] text-sm">
                {Object.entries(c.absences).map(([k, n]) => (
                  <li key={k} className="flex justify-between px-4 py-2.5">
                    <span className="font-semibold">{k}</span>
                    <span>{n} day{n === 1 ? "" : "s"}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      </div>
    </DashboardShell>
  );
}
