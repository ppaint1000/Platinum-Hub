// Forecast - money in, month by month, for every live job. Past months show
// what was actually claimed; what's left to claim is spread over the
// working days the job is booked on the Schedule. A job with nothing left
// booked goes in "Due now" (finished, not fully claimed) or "Not
// scheduled".
import Link from "next/link";
import { requireAppAccess } from "@/lib/auth/requireAppAccess";
import { Panel, StatusLabel } from "@/components/ui";
import { fetchClaims, fetchVariations, groupBy, LIVE_STATUSES, money, variationTotals } from "@/lib/jobs/jobFinance";
import type { JobStatus } from "@/lib/jobs/status";

type JobRow = {
  id: string;
  job_number: string | null;
  name: string;
  status: JobStatus;
  quoted_sell_total: number | null;
  client: { name: string } | null;
};

const monthKey = (d: string) => d.slice(0, 7);
const addMonths = (key: string, n: number) => {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};
const monthLabel = (key: string) =>
  new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-NZ", { month: "short", year: "2-digit", timeZone: "UTC" });

// Working days (Mon-Fri) from `from` to `to`, inclusive, as YYYY-MM-DD.
function workingDays(from: string, to: string): string[] {
  const days: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end && days.length < 1000) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) days.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return days;
}

export default async function ForecastPage({ searchParams }: { searchParams: Promise<{ ahead?: string }> }) {
  const { ahead: aheadParam } = await searchParams;
  const ahead = aheadParam === "12" ? 12 : 6;
  const supabase = await requireAppAccess("jobs");

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" });
  const thisMonth = monthKey(today);
  const months = Array.from({ length: ahead + 3 }, (_, i) => addMonths(thisMonth, i - 2));

  const { data: jobRows } = await supabase
    .from("jobs")
    .select("id, job_number, name, status, quoted_sell_total, client:clients(name)")
    .in("status", [...LIVE_STATUSES])
    .returns<JobRow[]>();
  const jobs = jobRows ?? [];
  const ids = jobs.map((j) => j.id);

  const [variations, claims, { data: bookings }] = await Promise.all([
    fetchVariations(supabase, ids),
    fetchClaims(supabase, ids),
    ids.length
      ? supabase.from("job_bookings").select("job_id, start_date, end_date").in("job_id", ids).returns<{ job_id: string; start_date: string; end_date: string }[]>()
      : Promise.resolve({ data: [] as { job_id: string; start_date: string; end_date: string }[] }),
  ]);
  const variationsByJob = groupBy(variations, (v) => v.job_id);
  const claimsByJob = groupBy(claims, (c) => c.job_id);
  const bookingsByJob = groupBy(bookings ?? [], (b) => b.job_id);

  const rows = jobs
    .map((j) => {
      const contract = Number(j.quoted_sell_total ?? 0) + variationTotals(variationsByJob.get(j.id) ?? []).approvedAmount;
      const claimed = new Map<string, number>();
      let claimedTotal = 0;
      for (const c of claimsByJob.get(j.id) ?? []) {
        claimed.set(monthKey(c.claim_date), (claimed.get(monthKey(c.claim_date)) ?? 0) + c.amount);
        claimedTotal += c.amount;
      }

      const left = Math.max(0, contract - claimedTotal);
      const forecast = new Map<string, number>();
      let dueNow = 0;
      let unscheduled = 0;
      let bookedFrom: string | null = null;
      if (left > 0) {
        const days = [
          ...new Set(
            (bookingsByJob.get(j.id) ?? [])
              .filter((b) => b.end_date >= today)
              .flatMap((b) => workingDays(b.start_date < today ? today : b.start_date, b.end_date))
          ),
        ].sort();
        if (days.length) {
          bookedFrom = days[0];
          // Claimed at the end of each month worked - spread by days booked.
          for (const day of days) forecast.set(monthKey(day), (forecast.get(monthKey(day)) ?? 0) + left / days.length);
        } else if (["complete", "invoiced", "in_progress"].includes(j.status)) {
          dueNow = left;
          forecast.set(thisMonth, left);
        } else {
          unscheduled = left;
        }
      }
      return { job: j, contract, claimed, forecast, dueNow, unscheduled, bookedFrom, left };
    })
    .filter((r) => r.contract > 0 || r.claimed.size > 0)
    .sort((a, b) => (a.bookedFrom ?? "9999").localeCompare(b.bookedFrom ?? "9999") || a.job.name.localeCompare(b.job.name));

  const lastMonth = months[months.length - 1];
  const beyond = (r: (typeof rows)[number]) => [...r.forecast.entries()].filter(([m]) => m > lastMonth).reduce((s, [, n]) => s + n, 0);
  const cell = (r: (typeof rows)[number], m: string) => ({
    claimed: r.claimed.get(m) ?? 0,
    forecast: m >= thisMonth ? r.forecast.get(m) ?? 0 : 0,
  });
  const monthTotals = months.map((m) => rows.reduce((acc, r) => {
    const c = cell(r, m);
    return { claimed: acc.claimed + c.claimed, forecast: acc.forecast + c.forecast };
  }, { claimed: 0, forecast: 0 }));
  const unscheduledTotal = rows.reduce((s, r) => s + r.unscheduled, 0);
  const beyondTotal = rows.reduce((s, r) => s + beyond(r), 0);
  const maxMonth = Math.max(1, ...monthTotals.map((t) => t.claimed + t.forecast));

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 sm:p-8">
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Link href="/jobs" className="text-sm font-medium text-ink-soft hover:text-ink">
          ← Jobs
        </Link>
        <Link href="/jobs/live" className="text-sm font-medium text-accent hover:text-accent-hover">
          Live jobs
        </Link>
      </div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-ink">Forecast</h1>
          <p className="text-sm text-ink-soft">
            Money in by month (excl GST). Past months: what was claimed. From this month: what&apos;s left to claim, spread over the days each job is booked on the
            Schedule.
          </p>
        </div>
        <div className="flex gap-1 rounded-md border border-line p-1 text-sm">
          {[6, 12].map((n) => (
            <Link
              key={n}
              href={`/jobs/forecast${n === 12 ? "?ahead=12" : ""}`}
              className={`rounded px-3 py-1 font-medium ${ahead === n ? "bg-ink text-white" : "text-ink-soft hover:bg-black/5"}`}
            >
              {n} months ahead
            </Link>
          ))}
        </div>
      </div>

      {/* Month totals as bars */}
      <Panel className="mb-6 p-5">
        <div className="flex h-40 items-end gap-2">
          {months.map((m, i) => {
            const t = monthTotals[i];
            return (
              <div key={m} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[11px] font-semibold tabular-nums text-ink">{t.claimed + t.forecast ? money(t.claimed + t.forecast) : ""}</span>
                <div className="flex w-full max-w-14 flex-col justify-end overflow-hidden rounded-t" style={{ height: `${((t.claimed + t.forecast) / maxMonth) * 100}%` }}>
                  <div className="bg-[#15803D]" style={{ flex: t.forecast }} title={`Forecast ${money(t.forecast)}`} />
                  <div className="bg-[#1F4E8C]" style={{ flex: t.claimed }} title={`Claimed ${money(t.claimed)}`} />
                </div>
                <span className={`text-xs ${m === thisMonth ? "font-bold text-ink" : "text-ink-soft"}`}>{monthLabel(m)}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex gap-4 text-xs text-ink-soft">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#1F4E8C]" /> Claimed
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#15803D]" /> Forecast
          </span>
          {unscheduledTotal > 0 && <span>· {money(unscheduledTotal)} on jobs not scheduled yet</span>}
        </div>
      </Panel>

      {rows.length === 0 ? (
        <Panel className="p-6 text-center text-ink-soft">No live jobs to forecast.</Panel>
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-sm tabular-nums">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-faint">
                <th className="sticky left-0 z-10 bg-paper-raised px-3 py-2 text-left font-semibold">Job</th>
                <th className="px-2 py-2 text-right font-semibold">Left to claim</th>
                {months.map((m) => (
                  <th key={m} className={`px-1 py-2 text-center font-semibold ${m === thisMonth ? "bg-amber-50 text-ink" : ""}`}>
                    {monthLabel(m)}
                  </th>
                ))}
                <th className="px-2 py-2 text-right font-semibold">Later</th>
                <th className="px-2 py-2 text-right font-semibold">Not scheduled</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.job.id} className="border-b border-line/60">
                  <td className="sticky left-0 z-10 bg-paper-raised px-3 py-2">
                    <Link href={`/jobs/${r.job.id}`} className="font-semibold text-ink hover:text-accent">
                      {r.job.name}
                    </Link>
                    <span className="flex items-center gap-2 text-xs text-ink-soft">
                      {r.job.client?.name ?? "No client"} <StatusLabel status={r.job.status} />
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right">{money(r.left)}</td>
                  {months.map((m) => {
                    const c = cell(r, m);
                    return (
                      <td key={m} className={`px-1 py-2 ${m === thisMonth ? "bg-amber-50/60" : ""}`}>
                        {c.claimed > 0 && (
                          <div className="mb-0.5 rounded bg-[#1F4E8C] px-1.5 py-1 text-center text-xs font-semibold text-white" title="Claimed">
                            {money(c.claimed)}
                          </div>
                        )}
                        {c.forecast > 0 && (
                          <div
                            className="rounded bg-[#15803D] px-1.5 py-1 text-center text-xs font-semibold text-white"
                            title={m === thisMonth && r.dueNow ? "Finished or under way with nothing booked - due to claim now" : "Forecast"}
                          >
                            {money(c.forecast)}
                            {m === thisMonth && r.dueNow > 0 && " due"}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 text-right">{beyond(r) ? money(beyond(r)) : ""}</td>
                  <td className="px-2 py-2 text-right text-ink-soft">{r.unscheduled ? money(r.unscheduled) : ""}</td>
                </tr>
              ))}
              <tr className="bg-black/[0.03] font-semibold">
                <td className="sticky left-0 z-10 bg-[#F3F2EE] px-3 py-2">Total</td>
                <td className="px-2 py-2 text-right">{money(rows.reduce((s, r) => s + r.left, 0))}</td>
                {monthTotals.map((t, i) => (
                  <td key={months[i]} className="px-1 py-2 text-center text-xs">
                    {t.claimed + t.forecast ? money(t.claimed + t.forecast) : ""}
                  </td>
                ))}
                <td className="px-2 py-2 text-right">{beyondTotal ? money(beyondTotal) : ""}</td>
                <td className="px-2 py-2 text-right">{unscheduledTotal ? money(unscheduledTotal) : ""}</td>
              </tr>
            </tbody>
          </table>
        </Panel>
      )}
      <p className="mt-3 text-xs text-ink-soft">
        Record claims on each job&apos;s Invoicing page. Contract value = quote + approved variations. Jobs in progress or finished with nothing booked show as due this
        month.
      </p>
    </div>
  );
}
