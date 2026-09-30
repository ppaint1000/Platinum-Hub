import Link from "next/link";
import {
  MARGIN_TARGET,
  STANDARD_WEEK_HOURS,
  type DashboardData,
  type DashboardJob,
  type DashboardVehicle,
  type Level,
} from "@/lib/dashboard/data";
import {
  BLUE,
  QUOTED_FILL,
  Bar,
  Card,
  DashboardShell,
  Empty,
  Headline,
  Pill,
  Ring,
  SectionHeading,
  fmtDate,
  money,
  moneyK,
  pct,
} from "./parts";
import { ADMIN_NAV, TopBar } from "./TopBar";

const hrs = (n: number) => (Math.round(n * 10) / 10).toLocaleString("en-NZ");

function inDays(days: number) {
  if (days === 0) return "Today";
  if (days < 0) return `${-days} day${days === -1 ? "" : "s"} overdue`;
  return `In ${days} day${days === 1 ? "" : "s"}`;
}

// ── Page ───────────────────────────────────────────────────────────────

export function Dashboard({
  data,
  fontClass,
  pendingAbsences = 0,
}: {
  data: DashboardData;
  fontClass: string;
  pendingAbsences?: number;
}) {
  return (
    <DashboardShell
      fontClass={fontClass}
      topBar={<TopBar items={ADMIN_NAV} activeHref="/dashboard" />}
      todayKey={data.todayKey}
      title="Dashboard"
    >
      {pendingAbsences > 0 && (
        <Link
          href="/absences"
          className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-[#B91C1C] px-4 py-3 text-sm font-semibold text-white hover:bg-[#991B1B]"
        >
          <span>
            {pendingAbsences} absence{pendingAbsences === 1 ? "" : "s"} still need{pendingAbsences === 1 ? "s" : ""} a
            reason recorded
          </span>
          <span aria-hidden>→</span>
        </Link>
      )}
      <Headlines data={data} />
      <JobsSection jobs={data.jobs} />
      <div className="grid gap-6 md:gap-8 lg:grid-cols-2">
        <SalesSection data={data} />
        <PainterSection data={data} />
      </div>
      <FleetSection vehicles={data.vehicles} />
    </DashboardShell>
  );
}

// ── 1. Headline figures ────────────────────────────────────────────────

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


function SalesSection({ data }: { data: DashboardData }) {
  const { months, won6, winRate6, wonCount6, lostCount6, countWinRate6, awaitingCount, awaitingValue } = data.sales;
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

        <div className="flex justify-around gap-3 border-t border-[#EFEDE7] pt-4">
          <Ring
            value={countWinRate6}
            label="Win rate · 6 months"
            sub={`${wonCount6} won · ${lostCount6} lost`}
            size={88}
          />
          <Ring value={winRate6} label="Dollars won · 6 months" sub={`${money(won6)} won`} size={88} />
        </div>

        <dl className="mt-auto grid grid-cols-2 gap-3 border-t border-[#EFEDE7] pt-3">
          <div>
            <dt className="text-xs font-semibold text-[#5B6472]">Won · 6 months</dt>
            <dd className="text-lg font-bold">{money(won6)}</dd>
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
