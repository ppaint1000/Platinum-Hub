import { Fragment } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Briefcase,
  Calculator,
  ChevronDown,
  Clock,
  LayoutDashboard,
  LayoutGrid,
  Menu,
  Ruler,
  ShoppingCart,
  TrendingUp,
  Truck,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import { SignOutButton } from "@/components/SignOutButton";
import { MEASURES_URL } from "@/lib/measuresUrl";
import {
  MARGIN_TARGET,
  STANDARD_WEEK_HOURS,
  type DashboardData,
  type DashboardJob,
  type DashboardVehicle,
  type Level,
} from "@/lib/dashboard/data";

// Colours from the Dashboard brief. Warnings are always solid red with white
// text; "due soon" is light blue.
const BLUE = "#1F4E8C";
const RED = "#B91C1C";

// Costing and Measures live in the separate Measures app, so they open in a
// new tab, the same as their Hub tiles.
const NAV: { href: string; label: string; icon: LucideIcon; external?: boolean }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/timesheets/admin", label: "Timesheets", icon: Clock },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/sales", label: "Sales", icon: TrendingUp },
  { href: `${MEASURES_URL}/costing`, label: "Costing", icon: Calculator, external: true },
  { href: `${MEASURES_URL}/site-measures`, label: "Measures", icon: Ruler, external: true },
  { href: "/orders", label: "Orders", icon: ShoppingCart },
  { href: "/fleet", label: "Fleet", icon: Truck },
  { href: "/users", label: "Users", icon: UserCog },
  { href: "/hub", label: "All apps", icon: LayoutGrid },
];

const NAVY = "#16202E";

const display = "[font-family:var(--font-display)]";

// ── Formatting ─────────────────────────────────────────────────────────

const money = (n: number) =>
  (n < 0 ? "−$" : "$") + Math.round(Math.abs(n)).toLocaleString("en-NZ");
const moneyK = (n: number) => (n >= 1000 ? `$${Math.round(n / 1000)}k` : money(n));
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const hrs = (n: number) => (Math.round(n * 10) / 10).toLocaleString("en-NZ");

function fmtDate(key: string | null) {
  if (!key) return "—";
  return new Date(`${key}T00:00:00Z`).toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function inDays(days: number) {
  if (days === 0) return "Today";
  if (days < 0) return `${-days} day${days === -1 ? "" : "s"} overdue`;
  return `In ${days} day${days === 1 ? "" : "s"}`;
}

// ── Small pieces ───────────────────────────────────────────────────────

const PILL: Record<Level, string> = {
  alert: "bg-[#B91C1C] text-white",
  soon: "bg-[#E3ECF8] text-[#163A69]",
  ok: "bg-[#ECEAE3] text-[#3F4753]",
};

function Pill({ level, children }: { level: Level; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${PILL[level]}`}
    >
      {children}
    </span>
  );
}

function Bar({ value, max, alert, label }: { value: number; max: number; alert: boolean; label: string }) {
  const width = max > 0 ? Math.min(value / max, 1) * 100 : 0;
  return (
    <div
      role="img"
      aria-label={label}
      className="h-2.5 w-full overflow-hidden rounded-full bg-[#ECEAE3]"
    >
      <div
        className="h-full rounded-full"
        style={{ width: `${width}%`, background: alert ? RED : BLUE }}
      />
    </div>
  );
}

function SectionHeading({
  title,
  count,
  href,
  linkLabel,
}: {
  title: string;
  count?: number;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <h2 className={`${display} text-lg font-bold md:text-xl`}>{title}</h2>
        {count ? (
          <span className="rounded-full bg-[#B91C1C] px-2 py-0.5 text-xs font-semibold text-white">
            {count}
          </span>
        ) : null}
      </div>
      {href && (
        <Link
          href={href}
          className="py-2.5 text-sm font-semibold text-[#1F4E8C] hover:text-[#163A69] hover:underline"
        >
          {linkLabel} →
        </Link>
      )}
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-[#E3E1DA] bg-white ${className}`}>{children}</div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-6 text-sm text-[#5B6472]">{children}</p>;
}

// ── Page ───────────────────────────────────────────────────────────────

export function Dashboard({ data, fontClass }: { data: DashboardData; fontClass: string }) {
  const todayLabel = new Date(`${data.todayKey}T00:00:00Z`).toLocaleDateString("en-NZ", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <div
      className={`${fontClass} flex min-h-screen flex-col bg-[#F5F4F0] text-[#16202E] [font-family:var(--font-body)] [font-variant-numeric:tabular-nums]`}
    >
      <TopBar />

      <main className="min-w-0 flex-1 px-4 pb-10 pt-5 md:px-8 md:pt-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 md:gap-8">
          <div>
            <p className="text-[13px] text-[#5B6472] md:text-sm">{todayLabel}</p>
            <h1 className={`${display} text-[28px] font-bold leading-tight md:text-3xl`}>Dashboard</h1>
          </div>

          <Headlines data={data} />
          <JobsSection jobs={data.jobs} />
          <div className="grid gap-6 md:gap-8 lg:grid-cols-2">
            <SalesSection data={data} />
            <PainterSection data={data} />
          </div>
          <FleetSection vehicles={data.vehicles} />
        </div>
      </main>
    </div>
  );
}

const tabClass =
  "flex items-center border-b-[3px] px-3 pt-[3px] text-sm font-medium whitespace-nowrap transition";
const tabIdle = "border-transparent text-[#C9D1DC] hover:bg-white/10 hover:text-white";

// Desktop: one row of links across the top bar, Xero style. Costing and
// Measures (the separate Measures app) sit together in a drop-down tab,
// listed the same way as the phone menu.
function NavRow() {
  const inRow = NAV.filter((item) => !item.external);
  const measures = NAV.filter((item) => item.external);
  const dropdownAfter = NAV.findIndex((item) => item.external) - 1;

  return (
    <ul className="flex h-full items-stretch">
      {inRow.map((item) => {
        const active = item.href === "/dashboard";
        return (
          <Fragment key={item.href}>
            <li className="flex">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`${tabClass} ${active ? "border-white text-white" : tabIdle}`}
              >
                {item.label}
              </Link>
            </li>
            {item === NAV[dropdownAfter] && <MeasuresDropdown items={measures} />}
          </Fragment>
        );
      })}
    </ul>
  );
}

function MeasuresDropdown({ items }: { items: typeof NAV }) {
  return (
    <li className="relative flex">
      <details className="group flex">
        <summary className={`${tabClass} ${tabIdle} cursor-pointer list-none gap-1 group-open:bg-white/10 group-open:text-white [&::-webkit-details-marker]:hidden`}>
          Costing &amp; Measures
          <ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden />
        </summary>
        <ul
          className="absolute left-0 top-full z-30 flex min-w-52 flex-col gap-0.5 rounded-b-lg p-2 shadow-lg"
          style={{ background: NAVY }}
        >
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <a
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-[#C9D1DC] transition hover:bg-white/10 hover:text-white"
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                  {item.label}
                </a>
              </li>
            );
          })}
        </ul>
      </details>
    </li>
  );
}

// Phone and tablet: the same links in a drop-down list.
function NavList() {
  return (
    <ul className="flex flex-col gap-0.5">
      {NAV.map((item) => {
        const active = item.href === "/dashboard";
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              target={item.external ? "_blank" : undefined}
              rel={item.external ? "noopener noreferrer" : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition ${
                active ? "bg-white/15 font-semibold text-white" : "text-[#C9D1DC] hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Logo({ className }: { className: string }) {
  return (
    <Link href="/dashboard" className="block">
      <Image
        src="/platinum-painters-logo.png"
        alt="Platinum Painters"
        width={1983}
        height={793}
        priority
        className={`h-auto ${className}`}
      />
    </Link>
  );
}

function TopBar() {
  return (
    <header className="sticky top-0 z-20 text-white shadow-sm" style={{ background: NAVY }}>
      {/* Desktop */}
      <div className="hidden px-8 xl:block">
        <div className="mx-auto flex h-16 max-w-6xl items-stretch gap-6">
          <div className="flex items-center">
            <Logo className="w-28" />
          </div>
          <nav aria-label="Main" className="flex-1">
            <NavRow />
          </nav>
          <div className="flex items-center">
            <SignOutButton className="min-h-10 whitespace-nowrap rounded-lg px-3 text-sm font-medium text-[#C9D1DC] hover:bg-white/10 hover:text-white" />
          </div>
        </div>
      </div>

      {/* Phone and tablet */}
      <details className="group px-4 py-2.5 xl:hidden">
        <summary className="flex list-none items-center justify-between [&::-webkit-details-marker]:hidden">
          <Logo className="w-24" />
          <span className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg border border-[#2A3748] group-open:bg-white/10">
            <Menu className="h-5 w-5" aria-hidden />
            <span className="sr-only">Menu</span>
          </span>
        </summary>
        <nav aria-label="Main" className="mt-3 border-t border-[#2A3748] pb-2 pt-3">
          <NavList />
          <SignOutButton className="mt-1 min-h-11 w-full rounded-lg px-3 text-left text-sm font-medium text-[#C9D1DC] hover:bg-white/10 hover:text-white" />
        </nav>
      </details>
    </header>
  );
}

// ── 1. Headline figures ────────────────────────────────────────────────

function Headline({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-1 p-3.5 md:p-5">
      <span className="text-xs font-semibold text-[#5B6472] md:text-sm">{label}</span>
      <span className={`${display} text-2xl font-bold md:text-[32px] md:leading-tight`}>{value}</span>
      <div className="text-xs text-[#5B6472] md:text-sm">{children}</div>
    </Card>
  );
}

function Headlines({ data }: { data: DashboardData }) {
  const margin = data.forecastMargin;
  const month = data.monthLabel;
  return (
    <section aria-label="Key figures" className="grid grid-cols-2 gap-2.5 md:gap-4 lg:grid-cols-4">
      <Headline label={`Sales won · ${month}`} value={money(data.won.value)}>
        {data.won.count} job{data.won.count === 1 ? "" : "s"} won
      </Headline>
      <Headline label={`Quoted · ${month}`} value={money(data.quoted.value)}>
        {data.quoted.winRate === null ? "No quotes yet this month" : `Win rate ${Math.round(data.quoted.winRate * 100)}%`}
      </Headline>
      <Headline label="Forecast margin · active jobs" value={margin === null ? "—" : pct(margin)}>
        {margin !== null && margin < MARGIN_TARGET ? (
          <Pill level="alert">Below {MARGIN_TARGET * 100}% target</Pill>
        ) : (
          `Target ${MARGIN_TARGET * 100}%`
        )}
      </Headline>
      <Headline label="Hours · this week" value={`${hrs(data.hours.logged)} h`}>
        of {hrs(data.hours.rosteredWeek)} h rostered
        <span className="block">{hrs(data.hours.rosteredToDate)} h rostered so far</span>
      </Headline>
    </section>
  );
}

// ── 2. Job profit & hours to budget ────────────────────────────────────

function JobStatus({ job }: { job: DashboardJob }) {
  if (job.overHours) return <Pill level="alert">Over hours</Pill>;
  return <Pill level="ok">{job.status === "won" ? "Won" : "In progress"}</Pill>;
}

function JobMargin({ job }: { job: DashboardJob }) {
  if (job.margin === null) return <span className="text-[#5B6472]">—</span>;
  if (job.margin < MARGIN_TARGET) return <Pill level="alert">{pct(job.margin)}</Pill>;
  return <span className="font-semibold">{pct(job.margin)}</span>;
}

function JobHours({ job }: { job: DashboardJob }) {
  if (job.hoursBudget === null) {
    return <span className="text-sm text-[#5B6472]">{hrs(job.hoursUsed)} h · no hours budget</span>;
  }
  const label = `${hrs(job.hoursUsed)} of ${hrs(job.hoursBudget)} hours used`;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between gap-2 text-[13px]">
        <span className="font-semibold">
          {hrs(job.hoursUsed)} / {hrs(job.hoursBudget)} h
        </span>
        {job.overHours && (
          <span className="font-semibold text-[#B91C1C]">+{hrs(job.hoursUsed - job.hoursBudget)} h</span>
        )}
      </div>
      <Bar value={job.hoursUsed} max={job.hoursBudget} alert={job.overHours} label={label} />
    </div>
  );
}

function JobsSection({ jobs }: { jobs: DashboardJob[] }) {
  const th = "px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[#5B6472]";
  const num = "text-right";
  return (
    <section aria-label="Job profit and hours to budget" className="flex flex-col gap-3">
      <SectionHeading title="Job profit & hours to budget" href="/jobs" linkLabel="All jobs" />

      {jobs.length === 0 ? (
        <Card>
          <Empty>No active jobs. Jobs show here once they&apos;re won.</Empty>
        </Card>
      ) : (
        <>
          {/* Desktop: one row per job */}
          <Card className="hidden overflow-x-auto xl:block">
            <table className="w-full border-collapse text-sm">
              <thead className="border-b border-[#E3E1DA]">
                <tr>
                  <th className={th}>Job</th>
                  <th className={th}>Client</th>
                  <th className={th}>Scope</th>
                  <th className={th}>Status</th>
                  <th className={`${th} ${num}`}>Quoted</th>
                  <th className={`${th} ${num}`}>Cost to date</th>
                  <th className={`${th} ${num}`}>Fcst profit</th>
                  <th className={`${th} ${num}`}>Margin</th>
                  <th className={`${th} w-52`}>Hours used / budget</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-b border-[#EFEDE7] last:border-0">
                    <td className="whitespace-nowrap px-3 py-3 font-semibold">
                      <Link href={`/jobs/${job.id}`} className="text-[#1F4E8C] hover:underline">
                        {job.jobNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-3">{job.client}</td>
                    <td className="max-w-56 px-3 py-3 text-[#5B6472]">{job.scope}</td>
                    <td className="px-3 py-3">
                      <JobStatus job={job} />
                    </td>
                    <td className={`px-3 py-3 ${num}`}>{money(job.quoted)}</td>
                    <td className={`px-3 py-3 ${num}`}>{money(job.costToDate)}</td>
                    <td className={`px-3 py-3 ${num} font-semibold`}>
                      {job.forecastProfit === null ? "—" : money(job.forecastProfit)}
                    </td>
                    <td className={`px-3 py-3 ${num}`}>
                      <JobMargin job={job} />
                    </td>
                    <td className="px-3 py-3">
                      <JobHours job={job} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Phone and tablet: one card per job */}
          <ul className="grid gap-2.5 md:grid-cols-2 xl:hidden">
            {jobs.map((job) => (
              <li key={job.id}>
                <Card className="flex flex-col gap-3 p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <Link href={`/jobs/${job.id}`} className="text-[15px] font-bold hover:underline">
                        {job.jobNumber} · {job.client}
                      </Link>
                      <span className="text-[13px] text-[#5B6472]">{job.scope}</span>
                    </div>
                    <JobStatus job={job} />
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                    {[
                      ["Quoted", money(job.quoted)],
                      ["Cost to date", money(job.costToDate)],
                      ["Fcst profit", job.forecastProfit === null ? "—" : money(job.forecastProfit)],
                    ].map(([k, v]) => (
                      <div key={k} className="flex flex-col">
                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#5B6472]">{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                    <div className="flex flex-col items-start">
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#5B6472]">Margin</dt>
                      <dd>
                        <JobMargin job={job} />
                      </dd>
                    </div>
                  </dl>
                  <JobHours job={job} />
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

// ── 3. Sales, quoted vs won ────────────────────────────────────────────

const QUOTED_FILL = "#9DB6D9";

function SalesSection({ data }: { data: DashboardData }) {
  const { months, won6, winRate6, awaitingCount, awaitingValue } = data.sales;
  const max = Math.max(...months.map((m) => Math.max(m.quoted, m.won)), 1);
  const chartHeight = 160;

  return (
    <section aria-label="Sales, quoted vs won">
      <Card className="flex h-full flex-col gap-4 p-4 md:p-5">
        <SectionHeading title="Sales · quoted vs won" href="/sales" linkLabel="Sales" />

        <div className="flex gap-4 text-[13px] text-[#5B6472]" aria-hidden>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm" style={{ background: QUOTED_FILL }} />
            Quoted
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm" style={{ background: BLUE }} />
            Won
          </span>
        </div>

        <div aria-hidden className="grid grid-cols-6 border-b border-[#D9D6CC]" style={{ height: chartHeight }}>
          {months.map((m) => (
            <div
              key={m.key}
              className="flex items-end justify-center gap-0.5"
              title={`${m.label}: quoted ${money(m.quoted)}, won ${money(m.won)}`}
            >
              {[
                [m.quoted, QUOTED_FILL],
                [m.won, BLUE],
              ].map(([v, fill], i) => (
                <div
                  key={i}
                  className="w-3.5 rounded-t sm:w-5"
                  style={{
                    height: Math.max(((v as number) / max) * chartHeight, (v as number) > 0 ? 2 : 0),
                    background: fill as string,
                  }}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Same 6 columns as the bars above, so each label sits under its month. */}
        <div aria-hidden className="-mt-2 grid grid-cols-6 text-center text-xs">
          {months.map((m) => (
            <div key={m.key} className="flex flex-col pt-1">
              <span className="font-semibold">{m.label}</span>
              <span className="text-[#5B6472]">{moneyK(m.quoted)}</span>
              <span className="font-semibold">{moneyK(m.won)}</span>
            </div>
          ))}
        </div>
        <table className="sr-only">
          <caption>Quoted and won by month, last 6 months</caption>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Quoted</th>
              <th scope="col">Won</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.key}>
                <th scope="row">{m.label}</th>
                <td>{money(m.quoted)}</td>
                <td>{money(m.won)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="mt-auto grid grid-cols-2 gap-3 border-t border-[#EFEDE7] pt-3 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold text-[#5B6472]">Won · 6 months</dt>
            <dd className="text-lg font-bold">{money(won6)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-[#5B6472]">Average win rate</dt>
            <dd className="text-lg font-bold">{winRate6 === null ? "—" : `${Math.round(winRate6 * 100)}%`}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-[#5B6472]">Awaiting reply</dt>
            <dd className="text-lg font-bold">
              {awaitingCount} · {money(awaitingValue)}
            </dd>
          </div>
        </dl>
      </Card>
    </section>
  );
}

// ── 4. Painter hours this week ─────────────────────────────────────────

function PainterSection({ data }: { data: DashboardData }) {
  return (
    <section aria-label="Painter hours this week">
      <Card className="flex h-full flex-col gap-4 p-4 md:p-5">
        <SectionHeading title="Painter hours · this week" href="/timesheets/admin/reports" linkLabel="Reports" />
        {data.painters.length === 0 ? (
          <Empty>No painters on the timesheet yet.</Empty>
        ) : (
          <ul className="flex flex-col gap-3.5">
            {data.painters.map((p) => {
              const over = p.hours > STANDARD_WEEK_HOURS;
              return (
                <li key={p.id} className="flex flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col">
                      <span className="text-[15px] font-semibold">{p.name}</span>
                      <span className="text-xs text-[#5B6472]">
                        {p.mainJob ?? "No hours yet"} · 4-wk avg {hrs(p.avg4)} h
                      </span>
                    </div>
                    {over ? (
                      <Pill level="alert">{hrs(p.hours)} h</Pill>
                    ) : (
                      <span className="text-[15px] font-bold">{hrs(p.hours)} h</span>
                    )}
                  </div>
                  <Bar
                    value={p.hours}
                    max={STANDARD_WEEK_HOURS}
                    alert={over}
                    label={`${hrs(p.hours)} of ${STANDARD_WEEK_HOURS} hours`}
                  />
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-auto flex justify-between gap-3 border-t border-[#EFEDE7] pt-3 text-sm">
          <span className="text-[#5B6472]">Total · vs {STANDARD_WEEK_HOURS} h week</span>
          <span className="font-bold">
            {hrs(data.weekTotal)} h{data.overtime > 0 && ` · ${hrs(data.overtime)} h over`}
          </span>
        </div>
      </Card>
    </section>
  );
}

// ── 5. Fleet WOF & servicing ───────────────────────────────────────────

function WofCell({ v }: { v: DashboardVehicle }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <span>{fmtDate(v.wofExpiry)}</span>
      {v.wofDays !== null && <Note level={v.wofLevel}>{v.wofDays < 0 ? "Expired" : inDays(v.wofDays)}</Note>}
    </div>
  );
}

function ServiceCell({ v }: { v: DashboardVehicle }) {
  if (!v.serviceDate && v.serviceKm === null) return <span className="text-[#5B6472]">Not set</span>;
  const parts: string[] = [];
  if (v.serviceDays !== null) parts.push(inDays(v.serviceDays));
  if (v.serviceKmLeft !== null) {
    parts.push(
      v.serviceKmLeft < 0
        ? `${(-v.serviceKmLeft).toLocaleString("en-NZ")} km over`
        : `${v.serviceKmLeft.toLocaleString("en-NZ")} km to go`
    );
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <span>
        {[v.serviceDate && fmtDate(v.serviceDate), v.serviceKm !== null && `${v.serviceKm.toLocaleString("en-NZ")} km`]
          .filter(Boolean)
          .join(" or ")}
      </span>
      {parts.length > 0 && <Note level={v.serviceLevel}>{parts.join(" · ")}</Note>}
    </div>
  );
}

function Note({ level, children }: { level: Level; children: React.ReactNode }) {
  if (level === "ok") return <span className="text-[13px] text-[#5B6472]">{children}</span>;
  return <Pill level={level}>{children}</Pill>;
}

function VehicleStatus({ v }: { v: DashboardVehicle }) {
  return (
    <div className="flex flex-wrap justify-end gap-1.5 lg:justify-start">
      {v.labels.map((l) => (
        <Pill key={l.text} level={l.level}>
          {l.text}
        </Pill>
      ))}
    </div>
  );
}

function FleetSection({ vehicles }: { vehicles: DashboardVehicle[] }) {
  const alerts = vehicles.filter((v) => v.labels[0].level === "alert").length;
  const th = "px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[#5B6472]";
  return (
    <section aria-label="Fleet WOF and servicing" className="flex flex-col gap-3">
      <SectionHeading title="Fleet · WOF & servicing" count={alerts} href="/fleet" linkLabel="Fleet" />

      {vehicles.length === 0 ? (
        <Card>
          <Empty>No vehicles in Fleet yet.</Empty>
        </Card>
      ) : (
        <>
          <Card className="hidden overflow-x-auto lg:block">
            <table className="w-full border-collapse text-sm">
              <thead className="border-b border-[#E3E1DA]">
                <tr>
                  <th className={th}>Vehicle</th>
                  <th className={th}>Plate</th>
                  <th className={th}>Driver</th>
                  <th className={th}>WOF expires</th>
                  <th className={th}>Next service</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => (
                  <tr key={v.id} className="border-b border-[#EFEDE7] align-top last:border-0">
                    <td className="px-3 py-3 font-semibold">{v.name}</td>
                    <td className="px-3 py-3 font-mono text-[13px]">{v.plate}</td>
                    <td className="px-3 py-3">{v.driver ?? <span className="text-[#5B6472]">Unassigned</span>}</td>
                    <td className="px-3 py-3">
                      <WofCell v={v} />
                    </td>
                    <td className="px-3 py-3">
                      <ServiceCell v={v} />
                    </td>
                    <td className="px-3 py-3">
                      <VehicleStatus v={v} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <ul className="grid gap-2.5 md:grid-cols-2 lg:hidden">
            {vehicles.map((v) => (
              <li key={v.id}>
                <Card className="flex flex-col gap-3 p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[15px] font-bold">
                        {v.name} · {v.plate}
                      </span>
                      <span className="text-[13px] text-[#5B6472]">{v.driver ?? "Unassigned"}</span>
                    </div>
                    <VehicleStatus v={v} />
                  </div>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#5B6472]">WOF expires</dt>
                      <dd>
                        <WofCell v={v} />
                      </dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#5B6472]">Next service</dt>
                      <dd>
                        <ServiceCell v={v} />
                      </dd>
                    </div>
                  </dl>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
