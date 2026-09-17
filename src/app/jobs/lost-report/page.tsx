// Lost-to report — $ lost per competitor, broken down by fiscal month
// (Apr-Mar, same year convention as /sales) with quarter and annual
// totals, all in one table rather than a period toggle.
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAppAccess } from "@/lib/auth/requireAppAccess";
import { Panel } from "@/components/ui";

type JobRow = {
  quoted_sell_total: number | null;
  lost_at: string | null;
  lost_to: string | null;
};

// Same convention as src/app/sales/page.tsx: sales/reporting year runs
// Apr-Mar (NZ tax year), keyed by a "start year" (the calendar year April
// falls in).
function fiscalYearStart(today = new Date()): number {
  return today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
}

function fiscalMonths(startYear: number): { year: number; month: number }[] {
  return Array.from({ length: 12 }, (_, i) => {
    const month = ((3 + i) % 12) + 1; // i=0 -> 4 (Apr) ... i=11 -> 3 (Mar)
    const year = month >= 4 ? startYear : startYear + 1;
    return { year, month };
  });
}

const MONTH_LABELS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
const QUARTERS = [
  { label: "Q1", months: [0, 1, 2] },
  { label: "Q2", months: [3, 4, 5] },
  { label: "Q3", months: [6, 7, 8] },
  { label: "Q4", months: [9, 10, 11] },
];

function money(n: number) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 0,
  }).format(n);
}

export default async function LostReportPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { year: yearParam } = await searchParams;
  const supabase = await requireAppAccess("jobs");

  const defaultStartYear = fiscalYearStart();
  const startYear = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : defaultStartYear;
  const months = fiscalMonths(startYear);
  const monthIndex = new Map(months.map((m, i) => [`${m.year}-${m.month}`, i]));

  const { data: jobs } = await supabase
    .from("jobs")
    .select("quoted_sell_total, lost_at, lost_to")
    .eq("status", "lost")
    .not("lost_at", "is", null)
    .returns<JobRow[]>();

  type CompetitorStats = { name: string; months: number[]; total: number };
  const byCompetitor = new Map<string, CompetitorStats>();

  for (const j of jobs ?? []) {
    if (!j.lost_at) continue;
    const [y, m] = j.lost_at.split("-").map(Number);
    const idx = monthIndex.get(`${y}-${m}`);
    if (idx === undefined) continue;

    const name = j.lost_to?.trim() || "Unknown";
    const stats = byCompetitor.get(name) ?? { name, months: Array(12).fill(0), total: 0 };
    const amount = Number(j.quoted_sell_total ?? 0);
    stats.months[idx] += amount;
    stats.total += amount;
    byCompetitor.set(name, stats);
  }

  const rows = [...byCompetitor.values()].sort((a, b) => b.total - a.total);
  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);
  const monthTotals = Array(12).fill(0);
  for (const r of rows) for (let i = 0; i < 12; i++) monthTotals[i] += r.months[i];
  const quarterTotals = QUARTERS.map((q) => q.months.reduce((sum, i) => sum + monthTotals[i], 0));

  const label = `${startYear}/${String(startYear + 1).slice(-2)}`;

  return (
    <div className="mx-auto w-full max-w-6xl p-8">
      <div className="mb-4 flex items-center justify-between">
        <Link
          href="/jobs"
          className="flex items-center gap-1.5 text-sm font-medium text-ink-soft transition hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Jobs
        </Link>
        <div className="flex items-center gap-2 text-sm">
          <Link
            href={`/jobs/lost-report?year=${startYear - 1}`}
            className="text-ink-soft underline hover:text-ink"
          >
            ← Previous year
          </Link>
          <span className="text-ink-faint">|</span>
          <Link
            href={`/jobs/lost-report?year=${startYear + 1}`}
            className="text-ink-soft underline hover:text-ink"
          >
            Next year →
          </Link>
        </div>
      </div>

      <h1 className="mb-1 text-3xl font-bold text-ink">Lost to</h1>
      <p className="mb-6 text-sm text-ink-soft">
        Quoted $ on jobs marked lost, by who they were lost to — {label}
      </p>

      {rows.length === 0 ? (
        <Panel className="p-6 text-center text-ink-soft">No jobs lost in {label} yet.</Panel>
      ) : (
        <Panel className="overflow-x-auto p-4">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs font-semibold uppercase tracking-wide text-ink-faint">
                <th className="py-2 pr-4">Lost to</th>
                {QUARTERS.map((q, qi) => (
                  <th key={q.label} colSpan={3 + 1} className="py-2 pr-4 text-right">
                    {q.label}
                  </th>
                ))}
                <th className="py-2 pl-4 text-right">Year total</th>
              </tr>
              <tr className="border-b border-line text-xs text-ink-faint">
                <th></th>
                {QUARTERS.flatMap((q) =>
                  [...q.months.map((i) => (
                    <th key={i} className="py-1 pr-2 text-right font-normal">
                      {MONTH_LABELS[i]}
                    </th>
                  )), <th key={`${q.label}-total`} className="py-1 pr-4 text-right font-semibold">Qtr</th>]
                )}
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.name}>
                  <td className="py-2 pr-4 font-medium text-ink">{r.name}</td>
                  {QUARTERS.flatMap((q) => {
                    const qTotal = q.months.reduce((sum, i) => sum + r.months[i], 0);
                    return [
                      ...q.months.map((i) => (
                        <td key={i} className="py-2 pr-2 text-right tabular-nums text-ink-soft">
                          {r.months[i] > 0 ? money(r.months[i]) : "—"}
                        </td>
                      )),
                      <td key={`${q.label}-total`} className="py-2 pr-4 text-right tabular-nums font-medium text-ink">
                        {qTotal > 0 ? money(qTotal) : "—"}
                      </td>,
                    ];
                  })}
                  <td className="py-2 pl-4 text-right tabular-nums font-semibold text-ink">
                    {money(r.total)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line font-semibold">
                <td className="py-2 pr-4 text-ink">Total</td>
                {QUARTERS.flatMap((q, qi) => [
                  ...q.months.map((i) => (
                    <td key={i} className="py-2 pr-2 text-right tabular-nums text-ink-soft">
                      {monthTotals[i] > 0 ? money(monthTotals[i]) : "—"}
                    </td>
                  )),
                  <td key={`${q.label}-total`} className="py-2 pr-4 text-right tabular-nums text-ink">
                    {quarterTotals[qi] > 0 ? money(quarterTotals[qi]) : "—"}
                  </td>,
                ])}
                <td className="py-2 pl-4 text-right tabular-nums text-ink">{money(grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </Panel>
      )}
    </div>
  );
}
