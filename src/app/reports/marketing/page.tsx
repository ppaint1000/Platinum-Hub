// Marketing ROI - which lead sources bring in work, and what each costs.
// Quotes and wins by lead source (date quoted) against the spend entered
// for each source by month; enquiries from Requests. Admins only.
import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { loadReportJobs } from "@/lib/reports/load";
import { parseRange, RANGES, inRange } from "@/lib/reports/range";
import { loadSpend, marketingRoi, REQUEST_SOURCE_LABEL } from "@/lib/reports/marketing";
import { LEAD_SOURCES } from "@/lib/jobs/leadSources";
import { Card, DashboardShell, Headline, SectionHeading, money } from "@/components/dashboard/parts";
import { ADMIN_NAV, TopBar } from "@/components/dashboard/TopBar";
import { dashboardFontClass } from "@/components/dashboard/fonts";
import { SpendEditor } from "@/components/reports/SpendEditor";
import { nzDateKey, nzTodayDateString } from "@/lib/timesheets/formatNZ";

export const metadata: Metadata = { title: "Marketing ROI · Reports · Platinum Hub" };

const pctText = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);
const moneyOr = (n: number | null) => (n == null ? "—" : money(n));
const times = (n: number | null) => (n == null ? "—" : `${n.toFixed(1)}×`);
const th = "px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-[#5B6472]";
const td = "px-3 py-2.5 text-right";

export default async function MarketingPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range: rangeParam } = await searchParams;
  const supabase = await requireAdmin();
  const range = parseRange(rangeParam);

  const [jobs, spend, { data: requests }] = await Promise.all([
    loadReportJobs(supabase),
    loadSpend(supabase),
    supabase.from("requests").select("created_at, source, status").returns<{ created_at: string; source: string; status: string }[]>(),
  ]);
  const { rows, totals } = marketingRoi(jobs, spend, range);

  const enquiries = (requests ?? []).filter((r) => inRange(nzDateKey(r.created_at), range));
  const bySource = [...new Set(enquiries.map((r) => r.source))]
    .map((s) => ({
      source: REQUEST_SOURCE_LABEL[s] ?? s,
      count: enquiries.filter((r) => r.source === s).length,
      converted: enquiries.filter((r) => r.source === s && r.status === "converted").length,
    }))
    .sort((a, b) => b.count - a.count);

  const today = nzTodayDateString();
  const lastMonth = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);

  return (
    <DashboardShell
      fontClass={dashboardFontClass}
      topBar={<TopBar items={ADMIN_NAV} activeHref="/reports" />}
      todayKey={today}
      title="Marketing ROI"
    >
      <div className="flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <Link
            key={r.key}
            href={r.key === "12m" ? "/reports/marketing" : `/reports/marketing?range=${r.key}`}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
              range.key === r.key ? "border-[#16202E] bg-[#16202E] text-white" : "border-[#D9D6CC] bg-white text-[#3F4753] hover:border-[#9DB6D9]"
            }`}
          >
            {r.label}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Headline label="Enquiries" value={String(enquiries.length)}>
          From Requests
        </Headline>
        <Headline label="Quotes" value={String(totals.quotes)}>
          By date quoted
        </Headline>
        <Headline label="Won" value={money(totals.sold)}>
          {totals.won} jobs · {pctText(totals.winRate)} win rate
        </Headline>
        <Headline label="Marketing spend" value={money(totals.spend)}>
          {totals.spend ? "Entered below" : "Nothing entered yet"}
        </Headline>
        <Headline label="Cost per won job" value={moneyOr(totals.costPerWin)}>
          Spend ÷ jobs won
        </Headline>
        <Headline label="Return on spend" value={times(totals.returnOnSpend)}>
          $ won for each $1 spent
        </Headline>
      </div>

      <section className="flex flex-col gap-3">
        <SectionHeading title="By lead source" />
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="border-b border-[#E3E1DA]">
              <tr>
                <th className={`${th} text-left`}>Lead source</th>
                <th className={th}>Quotes</th>
                <th className={th}>Won</th>
                <th className={th}>Win rate</th>
                <th className={th}>$ quoted</th>
                <th className={th}>$ won</th>
                <th className={th}>Spend</th>
                <th className={th}>Cost per quote</th>
                <th className={th}>Cost per win</th>
                <th className={th}>Return</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.source} className="border-b border-[#EEEDE8] last:border-0">
                  <td className="px-3 py-2.5 font-semibold">{r.source}</td>
                  <td className={td}>{r.quotes}</td>
                  <td className={td}>{r.won}</td>
                  <td className={td}>{pctText(r.winRate)}</td>
                  <td className={td}>{money(r.quoted)}</td>
                  <td className={`${td} font-semibold`}>{money(r.sold)}</td>
                  <td className={td}>{r.spend ? money(r.spend) : "—"}</td>
                  <td className={td}>{moneyOr(r.costPerQuote)}</td>
                  <td className={td}>{moneyOr(r.costPerWin)}</td>
                  <td
                    className={`${td} font-semibold`}
                    style={{ color: r.returnOnSpend == null ? undefined : r.returnOnSpend >= 3 ? "#15803D" : r.returnOnSpend < 1 ? "#B91C1C" : undefined }}
                  >
                    {r.spend && !r.won ? <span className="text-[#B91C1C]">No wins</span> : times(r.returnOnSpend)}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-center text-[#5B6472]">
                    No quotes in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
        <p className="text-xs text-[#5B6472]">
          Set each job&apos;s lead source on the job (Edit details) - jobs without one show as &quot;Not recorded&quot;. Win rate = won ÷ (won + lost). Return: green is 3× or
          better, red is less than the spend back.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading title="Enquiries by how they came in" />
        <Card className="overflow-x-auto">
          {bySource.length === 0 ? (
            <p className="px-4 py-6 text-sm text-[#5B6472]">No enquiries in this period.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-[#E3E1DA]">
                <tr>
                  <th className={`${th} text-left`}>Came in by</th>
                  <th className={th}>Enquiries</th>
                  <th className={th}>Turned into a quote</th>
                </tr>
              </thead>
              <tbody>
                {bySource.map((s) => (
                  <tr key={s.source} className="border-b border-[#EEEDE8] last:border-0">
                    <td className="px-3 py-2.5 font-semibold">{s.source}</td>
                    <td className={td}>{s.count}</td>
                    <td className={td}>
                      {s.converted} ({pctText(s.count ? s.converted / s.count : null)})
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading title="Marketing spend" />
        <Card>
          <SpendEditor sources={LEAD_SOURCES.filter((s) => s !== "Repeat client")} spend={spend} defaultMonth={lastMonth} />
        </Card>
      </section>
    </DashboardShell>
  );
}
