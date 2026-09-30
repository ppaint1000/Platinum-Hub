// Clients dashboard — quoted, won, lost and win rate across clients for the
// current month/quarter/year, with a toggle back to the win-rate report.
// Same access gate as the rest of Clients/Jobs.
import type { Metadata } from "next";
import Link from "next/link";
import { requireAppAccess } from "@/lib/auth/requireAppAccess";
import { parsePeriod } from "@/lib/clients/winRate";
import { MIN_DECIDED, loadClientsDashboard, type ClientStat, type ClientsDashboardData } from "@/lib/clients/dashboard";
import { ClientsViewToggle, PeriodPills } from "@/components/clients/ClientsViewToggle";
import {
  BLUE,
  QUOTED_FILL,
  RED,
  Card,
  DashboardShell,
  Empty,
  Headline,
  Pill,
  SectionHeading,
  WinRings,
  money,
  moneyK,
} from "@/components/dashboard/parts";
import { ADMIN_NAV, TopBar } from "@/components/dashboard/TopBar";
import { dashboardFontClass } from "@/components/dashboard/fonts";

export const metadata: Metadata = { title: "Clients dashboard · Platinum Hub" };

const wholePct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);
const quotes = (n: number) => `${n} quote${n === 1 ? "" : "s"}`;

export default async function ClientsDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: periodParam } = await searchParams;
  const period = parsePeriod(periodParam);

  const supabase = await requireAppAccess("jobs");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data: profile }, data] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user?.id ?? "").single<{ role: string }>(),
    loadClientsDashboard(supabase, period),
  ]);
  const isAdmin = profile?.role === "admin";

  return (
    <DashboardShell
      fontClass={dashboardFontClass}
      topBar={isAdmin ? <TopBar items={ADMIN_NAV} activeHref="/clients" /> : null}
      todayKey={data.todayKey}
      title={<span className="capitalize">Clients · {period}</span>}
    >
      <div className="-mt-2 flex flex-wrap items-center justify-between gap-3 md:-mt-4">
        <Link href="/clients" className="text-sm font-semibold text-[#1F4E8C] hover:underline">
          ← Clients
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <ClientsViewToggle active="dashboard" period={period} />
          <PeriodPills period={period} basePath="/clients/dashboard" />
        </div>
      </div>

      <Headlines data={data} />
      <MonthChart data={data} />

      <div className="grid gap-6 md:gap-8 lg:grid-cols-2">
        <TopClients clients={data.topByWon} />
        <OpenQuotes clients={data.openQuotes} total={data.totals.openValue} />
      </div>

      <div className="grid gap-6 md:gap-8 lg:grid-cols-2">
        <WinRateList
          title="Best win rate"
          clients={data.bestWinRate}
          empty={`No client has ${MIN_DECIDED}+ won or lost quotes in this period yet.`}
        />
        <WinRateList
          title="Lowest win rate"
          clients={data.worstWinRate}
          empty={`No client has ${MIN_DECIDED}+ won or lost quotes in this period yet.`}
          warn
        />
      </div>

      <LeadSources data={data} />

      <LostTo data={data} />
    </DashboardShell>
  );
}

function Headlines({ data }: { data: ClientsDashboardData }) {
  const t = data.totals;
  return (
    <section aria-label="Key figures" className="grid grid-cols-2 gap-2.5 md:gap-4 lg:grid-cols-4">
      <Headline label="Quoted" value={money(t.quotedValue)}>
        {quotes(t.quotedCount)} · {money(t.openValue)} awaiting
      </Headline>
      <Headline label="Won" value={money(t.wonValue)}>
        {t.wonCount} job{t.wonCount === 1 ? "" : "s"}
        {t.avgDaysToDecide !== null && <span className="block">Avg {t.avgDaysToDecide} days to decide</span>}
      </Headline>
      <Headline label="Lost" value={money(t.lostValue)}>
        {quotes(t.lostCount)}
      </Headline>
      <WinRings
        winRate={t.winRate}
        winSub={`${t.wonCount} won · ${t.lostCount} lost`}
        dollarsWon={t.quotedValue > 0 ? t.wonValue / t.quotedValue : null}
        dollarsSub={`of ${money(t.quotedValue)} quoted`}
      />
    </section>
  );
}

function MonthChart({ data }: { data: ClientsDashboardData }) {
  const height = 170;
  const max = Math.max(...data.months.map((m) => Math.max(m.quoted, m.won, m.lost)), 1);
  const series = [
    ["quoted", QUOTED_FILL, "Quoted"],
    ["won", BLUE, "Won"],
    ["lost", RED, "Lost"],
  ] as const;
  return (
    <section aria-label="Quoted, won and lost by month">
      <Card className="flex flex-col gap-4 p-4 md:p-5">
        <SectionHeading title="Last 12 months" />
        <div className="flex flex-wrap gap-4 text-[13px] text-[#5B6472]" aria-hidden>
          {series.map(([, fill, label]) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm" style={{ background: fill }} />
              {label}
            </span>
          ))}
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[600px]">
            <div aria-hidden className="grid grid-cols-12 border-b border-[#D9D6CC]" style={{ height }}>
              {data.months.map((m) => (
                <div
                  key={m.key}
                  className="flex items-end justify-center gap-0.5"
                  title={`${m.label}: quoted ${money(m.quoted)}, won ${money(m.won)}, lost ${money(m.lost)}`}
                >
                  {series.map(([key, fill]) => (
                    <div
                      key={key}
                      className="w-2.5 rounded-t sm:w-3"
                      style={{ height: Math.max((m[key] / max) * height, m[key] > 0 ? 2 : 0), background: fill }}
                    />
                  ))}
                </div>
              ))}
            </div>
            <div aria-hidden className="grid grid-cols-12 text-center text-xs">
              {data.months.map((m) => (
                <div key={m.key} className="flex flex-col pt-1.5">
                  <span className="font-semibold">{m.label}</span>
                  <span className="text-[#5B6472]">{moneyK(m.won)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <table className="sr-only">
          <caption>Quoted, won and lost by month, last 12 months</caption>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Quoted</th>
              <th scope="col">Won</th>
              <th scope="col">Lost</th>
            </tr>
          </thead>
          <tbody>
            {data.months.map((m) => (
              <tr key={m.key}>
                <th scope="row">{m.label}</th>
                <td>{money(m.quoted)}</td>
                <td>{money(m.won)}</td>
                <td>{money(m.lost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </section>
  );
}

function TopClients({ clients }: { clients: ClientStat[] }) {
  const max = Math.max(...clients.map((c) => c.wonValue), 1);
  return (
    <section aria-label="Top clients by work won">
      <Card className="flex h-full flex-col gap-4 p-4 md:p-5">
        <SectionHeading title="Top clients · won" />
        {clients.length === 0 ? (
          <Empty>No work won in this period yet.</Empty>
        ) : (
          <ul className="flex flex-col gap-3">
            {clients.map((c) => (
              <li key={c.id} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-[15px] font-semibold">{c.name}</span>
                  <span className="shrink-0 text-[15px] font-bold">{money(c.wonValue)}</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#ECEAE3]" aria-hidden>
                  <div className="h-full rounded-full" style={{ width: `${(c.wonValue / max) * 100}%`, background: BLUE }} />
                </div>
                <span className="text-xs text-[#5B6472]">
                  {c.wonCount} won of {quotes(c.quotedCount)} · win rate {wholePct(c.winRate)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}

function OpenQuotes({ clients, total }: { clients: ClientStat[]; total: number }) {
  return (
    <section aria-label="Quotes awaiting a decision">
      <Card className="flex h-full flex-col gap-4 p-4 md:p-5">
        <SectionHeading title="Awaiting a decision" />
        {clients.length === 0 ? (
          <Empty>No quotes waiting on a client in this period.</Empty>
        ) : (
          <ul className="flex flex-col divide-y divide-[#EFEDE7]">
            {clients.map((c) => (
              <li key={c.id} className="flex items-baseline justify-between gap-3 py-2.5 first:pt-0">
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold">{c.name}</span>
                  <span className="text-xs text-[#5B6472]">{quotes(c.openCount)}</span>
                </span>
                <span className="shrink-0 text-[15px] font-bold">{money(c.openValue)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-auto flex justify-between border-t border-[#EFEDE7] pt-3 text-sm">
          <span className="text-[#5B6472]">Total awaiting</span>
          <span className="font-bold">{money(total)}</span>
        </div>
      </Card>
    </section>
  );
}

function WinRateList({
  title,
  clients,
  empty,
  warn = false,
}: {
  title: string;
  clients: ClientStat[];
  empty: string;
  warn?: boolean;
}) {
  return (
    <section aria-label={title}>
      <Card className="flex h-full flex-col gap-4 p-4 md:p-5">
        <SectionHeading title={title} />
        {clients.length === 0 ? (
          <Empty>{empty}</Empty>
        ) : (
          <ul className="flex flex-col divide-y divide-[#EFEDE7]">
            {clients.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold">{c.name}</span>
                  <span className="text-xs text-[#5B6472]">
                    {c.wonCount} won · {c.lostCount} lost
                  </span>
                </span>
                {warn && (c.winRate ?? 0) < 0.5 ? (
                  <Pill level="alert">{wholePct(c.winRate)}</Pill>
                ) : (
                  <span className="shrink-0 text-[15px] font-bold">{wholePct(c.winRate)}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-auto text-xs text-[#5B6472]">Clients with {MIN_DECIDED} or more won or lost quotes in this period.</p>
      </Card>
    </section>
  );
}

// Win rate for each lead source, with a bar for its share of the quotes.
function LeadSources({ data }: { data: ClientsDashboardData }) {
  const max = Math.max(...data.bySource.map((s) => s.quotedCount), 1);
  return (
    <section aria-label="Win rate by lead source">
      <Card className="flex flex-col gap-4 p-4 md:p-5">
        <SectionHeading title="Win rate by lead source" />
        {data.bySource.length === 0 ? (
          <Empty>No quotes in this period.</Empty>
        ) : (
          <ul className="grid gap-x-8 gap-y-3 md:grid-cols-2">
            {data.bySource.map((s) => (
              <li key={s.name} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold">{s.name}</span>
                    <span className="text-xs text-[#5B6472]">
                      {quotes(s.quotedCount)} · {s.wonCount} won · {s.lostCount} lost · {money(s.wonValue)} won
                    </span>
                  </span>
                  <span className="shrink-0 text-[15px] font-bold">{wholePct(s.winRate)}</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#ECEAE3]" aria-hidden>
                  <div className="h-full rounded-full" style={{ width: `${(s.quotedCount / max) * 100}%`, background: BLUE }} />
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-[#5B6472]">
          Win rate is won ÷ (won + lost). Set a job&apos;s lead source with Edit details on the job.
        </p>
      </Card>
    </section>
  );
}

function LostTo({ data }: { data: ClientsDashboardData }) {
  const max = Math.max(...data.lostTo.map((l) => l.count), 1);
  return (
    <section aria-label="Who we lost to">
      <Card className="flex flex-col gap-4 p-4 md:p-5">
        <SectionHeading title="Lost to" />
        {data.lostTo.length === 0 ? (
          <Empty>No lost quotes in this period.</Empty>
        ) : (
          <ul className="grid gap-x-8 gap-y-3 md:grid-cols-2">
            {data.lostTo.map((l) => (
              <li key={l.name} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-[15px] font-semibold">{l.name}</span>
                  <span className="shrink-0 text-sm">
                    <span className="font-bold">{l.count}</span>
                    <span className="text-[#5B6472]"> · {money(l.value)}</span>
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#ECEAE3]" aria-hidden>
                  <div className="h-full rounded-full" style={{ width: `${(l.count / max) * 100}%`, background: RED }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
