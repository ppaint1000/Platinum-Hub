import Link from "next/link";
import { FOLLOW_UP_DAYS, type SalesDashboardData, type SalesQuote } from "@/lib/sales/dashboard";
import {
  BLUE,
  QUOTED_FILL,
  Card,
  DashboardShell,
  Empty,
  Headline,
  Pill,
  SectionHeading,
  fmtDate,
  money,
  moneyK,
} from "@/components/dashboard/parts";
import { TopBar, type NavItem } from "@/components/dashboard/TopBar";

const wholePct = (n: number) => `${Math.round(n * 100)}%`;

function ofBudget(actual: number, budget: number, what: string) {
  if (budget <= 0) return "No budget set";
  return `${wholePct(actual / budget)} of ${money(budget)} ${what}`;
}

export function SalesDashboard({
  data,
  fontClass,
  nav,
  activeHref,
  title,
  canOpenJobs,
  backLink,
}: {
  data: SalesDashboardData;
  fontClass: string;
  nav: NavItem[];
  activeHref: string;
  title: string;
  canOpenJobs: boolean;
  backLink?: { href: string; label: string };
}) {
  const { thisMonth, yearToDate, monthLabel } = data;
  return (
    <DashboardShell
      fontClass={fontClass}
      topBar={<TopBar items={nav} activeHref={activeHref} />}
      todayKey={data.todayKey}
      title={title}
    >
      {backLink && (
        <Link
          href={backLink.href}
          className="-mt-3 self-start text-sm font-semibold text-[#1F4E8C] hover:text-[#163A69] hover:underline md:-mt-5"
        >
          ← {backLink.label}
        </Link>
      )}

      <section aria-label="Key figures" className="grid grid-cols-2 gap-2.5 md:gap-4 lg:grid-cols-4">
        <Headline label={`Won · ${monthLabel}`} value={money(thisMonth.won)}>
          {ofBudget(thisMonth.won, thisMonth.budgetWon, "budget")}
        </Headline>
        <Headline label={`Quoted · ${monthLabel}`} value={money(thisMonth.quoted)}>
          {ofBudget(thisMonth.quoted, thisMonth.budgetQuoted, "budget")}
        </Headline>
        <Headline label={`Won · year to date`} value={money(yearToDate.won)}>
          {ofBudget(yearToDate.won, yearToDate.budgetWon, "budget so far")}
        </Headline>
        <Headline
          label="Win rate · year to date"
          value={yearToDate.winRate === null ? "—" : wholePct(yearToDate.winRate)}
        >
          {yearToDate.quoted > 0 ? `${money(yearToDate.won)} won of ${money(yearToDate.quoted)} quoted` : "No quotes yet this year"}
        </Headline>
      </section>

      <MonthlyChart data={data} />

      <div className="grid gap-6 md:gap-8 lg:grid-cols-2">
        <AwaitingSection data={data} canOpenJobs={canOpenJobs} />
        <WinsSection wins={data.recentWins} canOpenJobs={canOpenJobs} />
      </div>
    </DashboardShell>
  );
}

// ── Monthly chart: quoted vs won, with the sales budget marked ─────────

function MonthlyChart({ data }: { data: SalesDashboardData }) {
  const { months } = data;
  const currentKey = data.todayKey.slice(0, 7);
  const max = Math.max(...months.map((m) => Math.max(m.quoted, m.won, m.budgetWon)), 1);
  const chartHeight = 180;

  return (
    <section aria-label="Quoted and won by month">
      <Card className="flex flex-col gap-4 p-4 md:p-5">
        <SectionHeading title={`Quoted vs won · ${data.yearLabel}`} />

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-[#5B6472]" aria-hidden>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm" style={{ background: QUOTED_FILL }} />
            Quoted
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm" style={{ background: BLUE }} />
            Won
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-[#16202E]" />
            Sales budget
          </span>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[560px]">
            <div aria-hidden className="grid grid-cols-12 border-b border-[#D9D6CC]" style={{ height: chartHeight }}>
              {months.map((m) => {
                const future = m.key > currentKey;
                return (
                  <div
                    key={m.key}
                    className={`relative flex items-end justify-center gap-0.5 ${future ? "opacity-40" : ""} ${
                      m.key === currentKey ? "bg-[#F5F4F0]" : ""
                    }`}
                    title={`${m.label}: quoted ${money(m.quoted)}, won ${money(m.won)}, budget ${money(m.budgetWon)}`}
                  >
                    {[
                      [m.quoted, QUOTED_FILL],
                      [m.won, BLUE],
                    ].map(([v, fill], i) => (
                      <div
                        key={i}
                        className="w-3 rounded-t sm:w-4"
                        style={{
                          height: Math.max(((v as number) / max) * chartHeight, (v as number) > 0 ? 2 : 0),
                          background: fill as string,
                        }}
                      />
                    ))}
                    {m.budgetWon > 0 && (
                      <div
                        className="absolute inset-x-1.5 h-0.5 bg-[#16202E]"
                        style={{ bottom: (m.budgetWon / max) * chartHeight }}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Same 12 columns as the bars above, so each label sits under its month. */}
            <div aria-hidden className="grid grid-cols-12 text-center text-xs">
              {months.map((m) => (
                <div
                  key={m.key}
                  className={`flex flex-col pt-1.5 ${m.key === currentKey ? "rounded-b bg-[#F5F4F0]" : ""}`}
                >
                  <span className="font-semibold">{m.label}</span>
                  {m.key <= currentKey && (
                    <>
                      <span className="text-[#5B6472]">{moneyK(m.quoted)}</span>
                      <span className="font-semibold">{moneyK(m.won)}</span>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <table className="sr-only">
          <caption>Quoted, won and sales budget by month, {data.yearLabel}</caption>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Quoted</th>
              <th scope="col">Won</th>
              <th scope="col">Sales budget</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.key}>
                <th scope="row">{m.label}</th>
                <td>{money(m.quoted)}</td>
                <td>{money(m.won)}</td>
                <td>{money(m.budgetWon)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </section>
  );
}

// ── Quotes awaiting reply and recent wins ──────────────────────────────

function QuoteName({ quote, canOpenJobs }: { quote: SalesQuote; canOpenJobs: boolean }) {
  if (!canOpenJobs) return <span className="text-[15px] font-semibold">{quote.name}</span>;
  return (
    <Link href={`/jobs/${quote.id}`} className="text-[15px] font-semibold text-[#1F4E8C] hover:underline">
      {quote.name}
    </Link>
  );
}

function daysAgo(days: number) {
  if (days <= 0) return "today";
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function AwaitingSection({ data, canOpenJobs }: { data: SalesDashboardData; canOpenJobs: boolean }) {
  const followUps = data.awaiting.filter((q) => q.days >= FOLLOW_UP_DAYS).length;
  return (
    <section aria-label="Quotes awaiting reply">
      <Card className="flex h-full flex-col gap-4 p-4 md:p-5">
        <SectionHeading title="Awaiting reply" count={followUps} />
        {data.awaiting.length === 0 ? (
          <Empty>No quotes waiting on a reply.</Empty>
        ) : (
          <ul className="flex flex-col divide-y divide-[#EFEDE7]">
            {data.awaiting.map((q) => (
              <li key={q.id} className="flex items-start justify-between gap-3 py-3 first:pt-0">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <QuoteName quote={q} canOpenJobs={canOpenJobs} />
                  {q.client && <span className="text-[13px] text-[#5B6472]">{q.client}</span>}
                  <span className="text-[13px] text-[#5B6472]">
                    Quoted {fmtDate(q.date)} · {daysAgo(q.days)}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="text-[15px] font-bold">{money(q.value)}</span>
                  {q.days >= FOLLOW_UP_DAYS && <Pill level="alert">Follow up</Pill>}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-auto flex justify-between gap-3 border-t border-[#EFEDE7] pt-3 text-sm">
          <span className="text-[#5B6472]">
            {data.awaiting.length} quote{data.awaiting.length === 1 ? "" : "s"} waiting
          </span>
          <span className="font-bold">{money(data.awaitingValue)}</span>
        </div>
      </Card>
    </section>
  );
}

function WinsSection({ wins, canOpenJobs }: { wins: SalesQuote[]; canOpenJobs: boolean }) {
  return (
    <section aria-label="Recent wins">
      <Card className="flex h-full flex-col gap-4 p-4 md:p-5">
        <SectionHeading title="Recent wins" />
        {wins.length === 0 ? (
          <Empty>No won jobs yet.</Empty>
        ) : (
          <ul className="flex flex-col divide-y divide-[#EFEDE7]">
            {wins.map((w) => (
              <li key={w.id} className="flex items-start justify-between gap-3 py-3 first:pt-0">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <QuoteName quote={w} canOpenJobs={canOpenJobs} />
                  {w.client && <span className="text-[13px] text-[#5B6472]">{w.client}</span>}
                  <span className="text-[13px] text-[#5B6472]">Won {fmtDate(w.date)}</span>
                </div>
                <span className="shrink-0 text-[15px] font-bold">{money(w.value)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
