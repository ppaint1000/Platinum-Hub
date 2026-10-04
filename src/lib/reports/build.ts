// Every report: its charts, summary, table columns and rows, worked out
// from the jobs (lib/reports/load.ts) for a date range. Laid out like
// PaintScout's reports - charts, then a summary and a table to export.
import { nzDateKey } from "@/lib/timesheets/formatNZ";
import { jobStatusLabel } from "@/design/tailwind.tokens";
import { PRODUCTION_STAGES, isWonStatus } from "@/lib/jobs/status";
import { inRange, rangeMonths, type DateRange } from "./range";
import type { ReportJob } from "./load";
import type { Format } from "@/components/reports/charts";

export type Month = { key: string; label: string };
export type ChartSpec =
  | { kind: "hbar"; title: string; data: { label: string; value: number; sub?: string }[]; format: Format; colour?: string; note?: string }
  | { kind: "columns" | "line"; title: string; months: Month[]; series: { name: string; values: number[]; colour?: string }[]; format: Format; note?: string }
  | { kind: "donut"; title: string; data: { label: string; value: number; colour?: string }[]; format: Format; note?: string };

export type CellFormat = "text" | "money" | "date" | "pct" | "number" | "hours";
export type Column = { key: string; label: string; format: CellFormat };
export type Cell = string | number | null;
export type ReportRow = { id: string; cells: Record<string, Cell>; href?: string };

export type Report = {
  slug: string;
  title: string;
  description: string;
  // What the date range is matched against, e.g. "Date quoted".
  dateBasis: string | null;
  charts: ChartSpec[];
  summary: { label: string; value: string }[];
  columns: Column[];
  rows: ReportRow[];
};

export type ReportGroup = { title: string; reports: { slug: string; title: string; description: string }[] };

export const REPORT_GROUPS: ReportGroup[] = [
  {
    title: "Sales",
    reports: [
      { slug: "new-quotes", title: "New Quotes", description: "A summary of quotes sent." },
      { slug: "lead-conversions", title: "Lead Conversions", description: "Win rate and dollars won by lead source." },
      { slug: "estimator-performance", title: "Salesperson Performance", description: "A summary of sales performance across salespeople." },
      { slug: "all-quotes", title: "All Quotes", description: "A complete list of all quotes." },
      { slug: "won-quotes", title: "Won Quotes", description: "A summary of all quotes that have been won." },
      { slug: "lost-quotes", title: "Lost Quotes & Lost To", description: "Quotes we lost, and who we lost them to." },
    ],
  },
  {
    title: "Jobs",
    reports: [
      { slug: "all-jobs", title: "All Jobs", description: "A complete list of all jobs." },
      { slug: "job-costing", title: "Job Costing", description: "Understand how your jobs are performing." },
      { slug: "job-hours", title: "Job Hours", description: "Approved timesheet hours against quoted hours." },
      { slug: "production", title: "Production", description: "Won jobs by production stage, right now." },
      { slug: "outstanding-invoices", title: "Outstanding Invoices", description: "Jobs invoiced but not yet paid." },
    ],
  },
  {
    title: "Activity",
    reports: [{ slug: "activity", title: "All Activity", description: "Everything that happened on quotes and jobs." }],
  },
];

// The Hub's other reports - kept on their own pages, listed here so every
// report is in one place.
export const OTHER_REPORT_GROUPS: { title: string; reports: { href: string; title: string; description: string }[] }[] = [
  {
    title: "Clients and sales",
    reports: [
      { href: "/sales", title: "Sales Overview", description: "The team's quoted and won against budget." },
      { href: "/sales/budgets", title: "Sales Budgets", description: "Quoted and won against each salesperson's budget." },
      { href: "/clients/dashboard", title: "Clients Dashboard", description: "Quoted, won, lost and win rate across clients." },
      { href: "/clients/report", title: "Win Rate by Client", description: "Each client's quotes, wins and losses." },
      { href: "/jobs/lost-report", title: "Lost To by Month", description: "Who we lose work to, month by month." },
    ],
  },
  {
    title: "Timesheets and staff",
    reports: [
      { href: "/timesheets/admin/reports", title: "Timesheet Report", description: "Hours by person and day, with CSV, PDF and Excel export." },
      { href: "/timesheets/admin/reports/by-job", title: "Hours by Job (Timesheets)", description: "Paid hours per person on each job site, rounded like payroll." },
      { href: "/timesheets/admin/activity", title: "Clock-in Activity", description: "Who clocked in and out, and where." },
      { href: "/absences", title: "Absences", description: "Who's been away, why, and the patterns." },
    ],
  },
  {
    title: "Fleet",
    reports: [{ href: "/fleet/fuel-report", title: "Fuel Report", description: "Fuel use and cost per km by vehicle." }],
  },
];

// ── Helpers ────────────────────────────────────────────────────────────

const dayKey = (d: string) => (d.length === 10 ? d : nzDateKey(d));
const monthOf = (d: string) => dayKey(d).slice(0, 7);
const statusLabel = (s: string) => jobStatusLabel[s] ?? s;
const jobLabel = (j: ReportJob) => (j.job_number ? `${j.job_number} · ${j.name}` : j.name);
const money = (n: number) => "$" + Math.round(n).toLocaleString("en-NZ");
const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const NONE = "Not recorded";

function earliest(dates: (string | null)[]): string | null {
  const ds = dates.filter((d): d is string => !!d).map(dayKey).sort();
  return ds[0] ?? null;
}

function byMonth(months: Month[], items: { date: string; value: number }[]): number[] {
  const index = new Map(months.map((m, i) => [m.key, i]));
  const out = months.map(() => 0);
  for (const it of items) {
    const i = index.get(monthOf(it.date));
    if (i !== undefined) out[i] += it.value;
  }
  return out;
}

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    m.set(k, [...(m.get(k) ?? []), it]);
  }
  return m;
}

const jobRow = (j: ReportJob, cells: Record<string, Cell>): ReportRow => ({ id: j.id, cells, href: `/jobs/${j.id}` });
const winRate = (won: number, lost: number) => (won + lost > 0 ? won / (won + lost) : null);
const isLost = (j: ReportJob) => j.status === "lost";

const C = {
  quoted: { key: "quoted", label: "Date quoted", format: "date" },
  job: { key: "job", label: "Job", format: "text" },
  client: { key: "client", label: "Client", format: "text" },
  person: { key: "person", label: "Salesperson", format: "text" },
  source: { key: "source", label: "Lead source", format: "text" },
  status: { key: "status", label: "Status", format: "text" },
  value: { key: "value", label: "Value", format: "money" },
} satisfies Record<string, Column>;

// ── Reports ────────────────────────────────────────────────────────────

export function buildReport(slug: string, all: ReportJob[], range: DateRange): Report | null {
  const meta = REPORT_GROUPS.flatMap((g) => g.reports).find((r) => r.slug === slug);
  if (!meta) return null;
  const base = { slug, title: meta.title, description: meta.description };

  switch (slug) {
    case "new-quotes": {
      const jobs = all.filter((j) => j.status !== "draft" && inRange(j.quoted_at, range));
      const months = rangeMonths(range, earliest(jobs.map((j) => j.quoted_at)));
      const sources = [...groupBy(jobs, (j) => j.lead_source ?? NONE)].sort((a, b) => b[1].length - a[1].length);
      const total = sum(jobs.map((j) => j.value));
      return {
        ...base,
        dateBasis: "Date quoted",
        charts: [
          { kind: "columns", title: "Quotes Sent", months, series: [{ name: "Quotes", values: byMonth(months, jobs.map((j) => ({ date: j.quoted_at!, value: 1 }))) }], format: "count" },
          { kind: "columns", title: "Quoted Value", months, series: [{ name: "Quoted $", values: byMonth(months, jobs.map((j) => ({ date: j.quoted_at!, value: j.value }))) }], format: "money" },
          { kind: "hbar", title: "Quotes by Lead Source", data: sources.map(([label, js]) => ({ label, value: js.length })), format: "count" },
        ],
        summary: [
          { label: "Quotes", value: String(jobs.length) },
          { label: "Total quoted", value: money(total) },
          { label: "Average quote", value: jobs.length ? money(total / jobs.length) : "—" },
        ],
        columns: [C.quoted, C.job, C.client, C.person, C.source, C.status, C.value],
        rows: jobs
          .sort((a, b) => (b.quoted_at ?? "").localeCompare(a.quoted_at ?? ""))
          .map((j) => jobRow(j, { quoted: j.quoted_at, job: jobLabel(j), client: j.clientName, person: j.person, source: j.lead_source, status: statusLabel(j.status), value: j.value })),
      };
    }

    case "lead-conversions": {
      const jobs = all.filter((j) => j.status !== "draft" && inRange(j.quoted_at, range));
      const sources = [...groupBy(jobs, (j) => j.lead_source ?? NONE)].map(([label, js]) => {
        const won = js.filter((j) => isWonStatus(j.status));
        const lost = js.filter(isLost);
        return { label, quotes: js.length, won: won.length, lost: lost.length, rate: winRate(won.length, lost.length), sold: sum(won.map((j) => j.value)) };
      });
      const wonJobs = jobs.filter((j) => isWonStatus(j.status));
      return {
        ...base,
        dateBasis: "Date quoted",
        charts: [
          {
            kind: "hbar",
            title: "Win Rate by Lead Source",
            data: sources.filter((s) => s.rate !== null).sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0)).map((s) => ({ label: s.label, value: s.rate!, sub: `${s.won} of ${s.won + s.lost}` })),
            format: "pct",
            note: "Won ÷ (won + lost). Quotes still waiting aren't counted.",
          },
          { kind: "hbar", title: "Total Sold by Lead Source", data: sources.filter((s) => s.sold > 0).sort((a, b) => b.sold - a.sold).map((s) => ({ label: s.label, value: s.sold })), format: "money" },
          { kind: "hbar", title: "Quotes by Lead Source", data: [...sources].sort((a, b) => b.quotes - a.quotes).map((s) => ({ label: s.label, value: s.quotes })), format: "count", colour: "#9DB6D9" },
        ],
        summary: [
          { label: "Quotes", value: String(jobs.length) },
          { label: "Won", value: `${wonJobs.length} · ${money(sum(wonJobs.map((j) => j.value)))}` },
          { label: "Win rate", value: pct(winRate(wonJobs.length, jobs.filter(isLost).length)) },
        ],
        columns: [C.quoted, { key: "won", label: "Date won", format: "date" }, C.source, C.job, C.client, C.status, C.person, C.value],
        rows: jobs
          .sort((a, b) => (b.quoted_at ?? "").localeCompare(a.quoted_at ?? ""))
          .map((j) => jobRow(j, { quoted: j.quoted_at, won: isWonStatus(j.status) ? j.won_at : null, source: j.lead_source ?? NONE, job: jobLabel(j), client: j.clientName, status: statusLabel(j.status), person: j.person, value: j.value })),
      };
    }

    case "estimator-performance": {
      const quoted = all.filter((j) => j.status !== "draft" && inRange(j.quoted_at, range));
      const wins = all.filter((j) => isWonStatus(j.status) && inRange(j.won_at, range));
      const months = rangeMonths(range, earliest([...quoted.map((j) => j.quoted_at), ...wins.map((j) => j.won_at)]));
      const people = [...new Set([...quoted, ...wins].map((j) => j.person ?? "No salesperson"))].sort();
      const rows = people.map((p) => {
        const mine = quoted.filter((j) => (j.person ?? "No salesperson") === p);
        const won = mine.filter((j) => isWonStatus(j.status));
        const lost = mine.filter(isLost);
        const open = mine.filter((j) => j.status === "quoted");
        const worth = sum(mine.map((j) => j.value));
        const wonValue = sum(won.map((j) => j.value));
        const sales = sum(wins.filter((j) => (j.person ?? "No salesperson") === p).map((j) => j.value));
        return {
          id: p,
          cells: {
            person: p,
            total: mine.length,
            worth,
            avg: mine.length ? worth / mine.length : null,
            won: won.length,
            avgSale: won.length ? wonValue / won.length : null,
            open: open.length,
            openWorth: sum(open.map((j) => j.value)),
            winRate: winRate(won.length, lost.length),
            closeRate: mine.length ? won.length / mine.length : null,
            dollarsWon: worth > 0 ? wonValue / worth : null,
            sales,
          } as Record<string, Cell>,
        };
      });
      const monthly = people.map((p) => ({
        name: p,
        values: byMonth(months, wins.filter((j) => (j.person ?? "No salesperson") === p).map((j) => ({ date: j.won_at!, value: j.value }))),
      }));
      const cumulative = monthly.map((s) => ({ name: s.name, values: s.values.map((_, i) => sum(s.values.slice(0, i + 1))) }));
      return {
        ...base,
        dateBasis: "Date quoted (quotes) and date won (sales)",
        charts: [
          { kind: "line", title: "Cumulative Total Sold", months, series: cumulative, format: "money" },
          { kind: "columns", title: "Total Sold", months, series: monthly, format: "money" },
        ],
        summary: [
          { label: "Quotes", value: String(quoted.length) },
          { label: "Quoted", value: money(sum(quoted.map((j) => j.value))) },
          { label: "Sales", value: money(sum(wins.map((j) => j.value))) },
        ],
        columns: [
          { key: "person", label: "Salesperson", format: "text" },
          { key: "total", label: "Total quotes", format: "number" },
          { key: "worth", label: "Total quote worth", format: "money" },
          { key: "avg", label: "Average quote", format: "money" },
          { key: "won", label: "Quotes won", format: "number" },
          { key: "avgSale", label: "Average sale", format: "money" },
          { key: "open", label: "Open quotes", format: "number" },
          { key: "openWorth", label: "Open quotes worth", format: "money" },
          { key: "winRate", label: "Win rate", format: "pct" },
          { key: "closeRate", label: "Close rate", format: "pct" },
          { key: "dollarsWon", label: "Dollars won", format: "pct" },
          { key: "sales", label: "Sales", format: "money" },
        ],
        rows,
      };
    }

    case "all-quotes": {
      const jobs = all.filter((j) => j.status !== "draft" && inRange(j.quoted_at, range));
      const statuses = [...groupBy(jobs, (j) => statusLabel(j.status))];
      return {
        ...base,
        dateBasis: "Date quoted",
        charts: [
          { kind: "donut", title: "Quotes by Status", data: statuses.map(([label, js]) => ({ label, value: js.length })), format: "count" },
          { kind: "donut", title: "Quote Value by Status", data: statuses.map(([label, js]) => ({ label, value: sum(js.map((j) => j.value)) })), format: "money" },
        ],
        summary: [
          { label: "Quotes", value: String(jobs.length) },
          { label: "Total", value: money(sum(jobs.map((j) => j.value))) },
        ],
        columns: [C.quoted, C.job, C.client, C.person, C.status, { key: "views", label: "Proposal opened", format: "number" }, C.value],
        rows: jobs
          .sort((a, b) => (b.quoted_at ?? "").localeCompare(a.quoted_at ?? ""))
          .map((j) => jobRow(j, { quoted: j.quoted_at, job: jobLabel(j), client: j.clientName, person: j.person, status: statusLabel(j.status), views: j.proposal_view_count ?? 0, value: j.value })),
      };
    }

    case "won-quotes": {
      const jobs = all.filter((j) => isWonStatus(j.status) && inRange(j.won_at, range));
      const months = rangeMonths(range, earliest(jobs.map((j) => j.won_at)));
      const online = jobs.filter((j) => j.proposal_accepted_at);
      return {
        ...base,
        dateBasis: "Date won",
        charts: [
          {
            kind: "donut",
            title: "How They Were Won",
            data: [
              { label: "Accepted online", value: online.length },
              { label: "Marked won", value: jobs.length - online.length },
            ],
            format: "count",
          },
          { kind: "columns", title: "Won by Month", months, series: [{ name: "Won $", values: byMonth(months, jobs.map((j) => ({ date: j.won_at!, value: j.value }))) }], format: "money" },
        ],
        summary: [
          { label: "Won", value: String(jobs.length) },
          { label: "Total", value: money(sum(jobs.map((j) => j.value))) },
          { label: "Average", value: jobs.length ? money(sum(jobs.map((j) => j.value)) / jobs.length) : "—" },
        ],
        columns: [{ key: "won", label: "Date won", format: "date" }, C.job, C.client, C.person, { key: "how", label: "How won", format: "text" }, C.status, C.value],
        rows: jobs
          .sort((a, b) => (b.won_at ?? "").localeCompare(a.won_at ?? ""))
          .map((j) => jobRow(j, { won: j.won_at, job: jobLabel(j), client: j.clientName, person: j.person, how: j.proposal_accepted_at ? "Accepted online" : "Marked won", status: statusLabel(j.status), value: j.value })),
      };
    }

    case "lost-quotes": {
      const jobs = all.filter((j) => isLost(j) && inRange(j.lost_at, range));
      const months = rangeMonths(range, earliest(jobs.map((j) => j.lost_at)));
      const lostTo = [...groupBy(jobs, (j) => j.lost_to?.trim() || NONE)]
        .map(([label, js]) => ({ label, count: js.length, value: sum(js.map((j) => j.value)) }))
        .sort((a, b) => b.count - a.count || b.value - a.value);
      const wonInRange = all.filter((j) => isWonStatus(j.status) && inRange(j.won_at, range)).length;
      return {
        ...base,
        dateBasis: "Date lost",
        charts: [
          { kind: "hbar", title: "Lost To", data: lostTo.map((l) => ({ label: l.label, value: l.count, sub: money(l.value) })), format: "count", colour: "#B91C1C" },
          { kind: "hbar", title: "Value Lost by Who We Lost To", data: [...lostTo].sort((a, b) => b.value - a.value).map((l) => ({ label: l.label, value: l.value })), format: "money", colour: "#B91C1C" },
          { kind: "columns", title: "Lost by Month", months, series: [{ name: "Lost $", values: byMonth(months, jobs.map((j) => ({ date: j.lost_at!, value: j.value }))), colour: "#B91C1C" }], format: "money" },
        ],
        summary: [
          { label: "Lost", value: String(jobs.length) },
          { label: "Value lost", value: money(sum(jobs.map((j) => j.value))) },
          { label: "Win rate", value: pct(winRate(wonInRange, jobs.length)) },
        ],
        columns: [{ key: "lost", label: "Date lost", format: "date" }, C.job, C.client, C.person, { key: "lostTo", label: "Lost to", format: "text" }, C.source, C.value],
        rows: jobs
          .sort((a, b) => (b.lost_at ?? "").localeCompare(a.lost_at ?? ""))
          .map((j) => jobRow(j, { lost: j.lost_at, job: jobLabel(j), client: j.clientName, person: j.person, lostTo: j.lost_to?.trim() || NONE, source: j.lead_source, value: j.value })),
      };
    }

    case "all-jobs": {
      const jobs = all.filter((j) => inRange(j.created_at, range));
      const statuses = [...groupBy(jobs, (j) => statusLabel(j.status))];
      return {
        ...base,
        dateBasis: "Date added",
        charts: [
          { kind: "donut", title: "Jobs by Status", data: statuses.map(([label, js]) => ({ label, value: js.length })), format: "count" },
          { kind: "hbar", title: "Value by Status", data: statuses.map(([label, js]) => ({ label, value: sum(js.map((j) => j.value)) })).sort((a, b) => b.value - a.value), format: "money" },
        ],
        summary: [
          { label: "Jobs", value: String(jobs.length) },
          { label: "Total value", value: money(sum(jobs.map((j) => j.value))) },
        ],
        columns: [{ key: "added", label: "Date added", format: "date" }, C.job, C.client, C.status, C.person, C.source, C.value],
        rows: jobs
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .map((j) => jobRow(j, { added: j.created_at, job: jobLabel(j), client: j.clientName, status: statusLabel(j.status), person: j.person, source: j.lead_source, value: j.value })),
      };
    }

    case "job-costing": {
      const jobs = all.filter((j) => isWonStatus(j.status) && j.completed_at && inRange(j.completed_at, range));
      const months = rangeMonths(range, earliest(jobs.map((j) => j.completed_at)));
      const withProfit = jobs.map((j) => ({ j, profit: j.value - j.cost, margin: j.value > 0 ? (j.value - j.cost) / j.value : null }));
      const totalValue = sum(jobs.map((j) => j.value));
      const totalProfit = sum(withProfit.map((x) => x.profit));
      return {
        ...base,
        dateBasis: "Date completed",
        charts: [
          { kind: "columns", title: "Profit by Month", months, series: [{ name: "Profit", values: byMonth(months, withProfit.map((x) => ({ date: x.j.completed_at!, value: x.profit }))) }], format: "money" },
          {
            kind: "hbar",
            title: "Margin by Job",
            data: withProfit.filter((x) => x.margin !== null).sort((a, b) => (b.margin ?? 0) - (a.margin ?? 0)).slice(0, 12).map((x) => ({ label: jobLabel(x.j), value: Math.max(0, x.margin!) })),
            format: "pct",
            note: "Best 12. Cost is what's been recorded against the job so far.",
          },
        ],
        summary: [
          { label: "Jobs", value: String(jobs.length) },
          { label: "Value", value: money(totalValue) },
          { label: "Profit", value: money(totalProfit) },
          { label: "Margin", value: pct(totalValue > 0 ? totalProfit / totalValue : null) },
        ],
        columns: [{ key: "done", label: "Date completed", format: "date" }, C.job, C.client, C.person, C.source, C.value, { key: "cost", label: "Cost", format: "money" }, { key: "profit", label: "Profit", format: "money" }, { key: "margin", label: "Margin", format: "pct" }],
        rows: withProfit
          .sort((a, b) => (b.j.completed_at ?? "").localeCompare(a.j.completed_at ?? ""))
          .map(({ j, profit, margin }) => jobRow(j, { done: j.completed_at, job: jobLabel(j), client: j.clientName, person: j.person, source: j.lead_source, value: j.value, cost: j.cost, profit, margin })),
      };
    }

    case "job-hours": {
      const jobs = all.filter(
        (j) =>
          isWonStatus(j.status) &&
          (j.hoursActual > 0 || j.quoted_hours) &&
          (["won", "scheduled", "in_progress"].includes(j.status) || inRange(j.completed_at, range))
      );
      const rows = jobs.map((j) => {
        const quoted = Number(j.quoted_hours ?? 0);
        return { j, quoted, used: quoted > 0 ? j.hoursActual / quoted : null };
      });
      return {
        ...base,
        dateBasis: "Jobs under way, plus those completed in the range",
        charts: [
          {
            kind: "hbar",
            title: "Hours Used of Quoted",
            data: rows.filter((r) => r.used !== null).sort((a, b) => (b.used ?? 0) - (a.used ?? 0)).slice(0, 12).map((r) => ({ label: jobLabel(r.j), value: r.used!, sub: `${Math.round(r.j.hoursActual)} / ${Math.round(r.quoted)}` })),
            format: "pct",
            note: "Most used first. Over 100% means more hours than quoted.",
          },
        ],
        summary: [
          { label: "Jobs", value: String(rows.length) },
          { label: "Quoted hours", value: `${Math.round(sum(rows.map((r) => r.quoted))).toLocaleString("en-NZ")}` },
          { label: "Approved hours", value: `${Math.round(sum(rows.map((r) => r.j.hoursActual))).toLocaleString("en-NZ")}` },
        ],
        columns: [C.job, C.client, C.status, { key: "quotedHrs", label: "Quoted hours", format: "hours" }, { key: "actual", label: "Approved hours", format: "hours" }, { key: "left", label: "Hours left", format: "hours" }, { key: "used", label: "Used", format: "pct" }],
        rows: rows
          .sort((a, b) => (b.used ?? -1) - (a.used ?? -1))
          .map(({ j, quoted, used }) => jobRow(j, { job: jobLabel(j), client: j.clientName, status: statusLabel(j.status), quotedHrs: quoted || null, actual: j.hoursActual, left: quoted ? quoted - j.hoursActual : null, used })),
      };
    }

    case "production": {
      const jobs = all.filter((j) => PRODUCTION_STAGES.some((s) => s.status === j.status) && (j.status !== "paid" || inRange(j.paid_at, range)));
      const since = (j: ReportJob) =>
        ({ won: j.won_at, scheduled: j.scheduled_at, in_progress: null, complete: j.completed_at, invoiced: j.invoiced_at, paid: j.paid_at } as Record<string, string | null>)[j.status] ?? null;
      const stages = PRODUCTION_STAGES.map((s) => {
        const js = jobs.filter((j) => j.status === s.status);
        return { label: s.label, count: js.length, value: sum(js.map((j) => j.value)) };
      });
      return {
        ...base,
        dateBasis: "Right now (Paid: paid in the range)",
        charts: [
          { kind: "hbar", title: "Jobs by Stage", data: stages.map((s) => ({ label: s.label, value: s.count })), format: "count" },
          { kind: "hbar", title: "Value by Stage", data: stages.map((s) => ({ label: s.label, value: s.value })), format: "money", colour: "#16202E" },
        ],
        summary: [
          { label: "Jobs", value: String(jobs.length) },
          { label: "Value", value: money(sum(jobs.map((j) => j.value))) },
          { label: "Ready to invoice", value: String(jobs.filter((j) => j.status === "complete").length) },
        ],
        columns: [{ key: "stage", label: "Stage", format: "text" }, C.job, C.client, { key: "since", label: "Since", format: "date" }, C.value],
        rows: jobs
          .sort((a, b) => PRODUCTION_STAGES.findIndex((s) => s.status === a.status) - PRODUCTION_STAGES.findIndex((s) => s.status === b.status))
          .map((j) => jobRow(j, { stage: PRODUCTION_STAGES.find((s) => s.status === j.status)!.label, job: jobLabel(j), client: j.clientName, since: since(j), value: j.value })),
      };
    }

    case "outstanding-invoices": {
      const today = range.to;
      const jobs = all.filter((j) => j.status === "invoiced");
      const age = (j: ReportJob) =>
        j.invoiced_at ? Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dayKey(j.invoiced_at)}T00:00:00Z`)) / 86_400_000)) : null;
      const buckets = [
        { label: "0–30 days", test: (d: number) => d <= 30 },
        { label: "31–60 days", test: (d: number) => d > 30 && d <= 60 },
        { label: "61–90 days", test: (d: number) => d > 60 && d <= 90 },
        { label: "Over 90 days", test: (d: number) => d > 90 },
      ];
      return {
        ...base,
        dateBasis: "Right now",
        charts: [
          {
            kind: "hbar",
            title: "Outstanding by Age",
            data: buckets.map((b) => ({ label: b.label, value: sum(jobs.filter((j) => b.test(age(j) ?? 0)).map((j) => j.value)) })),
            format: "money",
            colour: "#B91C1C",
          },
        ],
        summary: [
          { label: "Invoices", value: String(jobs.length) },
          { label: "Outstanding", value: money(sum(jobs.map((j) => j.value))) },
        ],
        columns: [{ key: "invoiced", label: "Date invoiced", format: "date" }, { key: "days", label: "Days outstanding", format: "number" }, C.job, C.client, C.value],
        rows: jobs
          .sort((a, b) => (age(b) ?? 0) - (age(a) ?? 0))
          .map((j) => jobRow(j, { invoiced: j.invoiced_at, days: age(j), job: jobLabel(j), client: j.clientName, value: j.value })),
      };
    }

    case "activity": {
      const kinds: [string, (j: ReportJob) => string | null][] = [
        ["Quoted", (j) => j.quoted_at],
        ["Proposal sent", (j) => j.proposal_sent_at],
        ["Proposal opened", (j) => (Number(j.proposal_view_count ?? 0) > 0 ? j.proposal_viewed_at : null)],
        ["Accepted online", (j) => j.proposal_accepted_at],
        ["Won", (j) => (isWonStatus(j.status) && !j.proposal_accepted_at ? j.won_at : null)],
        ["Lost", (j) => (isLost(j) ? j.lost_at : null)],
        ["On hold", (j) => (j.status === "on_hold" ? j.on_hold_at : null)],
        ["Scheduled", (j) => j.scheduled_at],
        ["Completed", (j) => j.completed_at],
        ["Invoiced", (j) => j.invoiced_at],
        ["Paid", (j) => j.paid_at],
      ];
      const events = all.flatMap((j) =>
        kinds.map(([what, get]) => ({ j, what, date: get(j) })).filter((e): e is { j: ReportJob; what: string; date: string } => !!e.date && inRange(e.date, range))
      );
      const months = rangeMonths(range, earliest(events.map((e) => e.date)));
      return {
        ...base,
        dateBasis: "Date it happened",
        charts: [
          { kind: "hbar", title: "Activity by Type", data: kinds.map(([what]) => ({ label: what, value: events.filter((e) => e.what === what).length })).filter((d) => d.value > 0), format: "count" },
          { kind: "columns", title: "Activity by Month", months, series: [{ name: "Events", values: byMonth(months, events.map((e) => ({ date: e.date, value: 1 }))) }], format: "count" },
        ],
        summary: [{ label: "Events", value: String(events.length) }],
        columns: [{ key: "date", label: "Date", format: "date" }, { key: "what", label: "What happened", format: "text" }, C.job, C.client, C.person, C.value],
        rows: events
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((e, i) => ({ id: `${e.j.id}-${i}`, href: `/jobs/${e.j.id}`, cells: { date: e.date, what: e.what, job: jobLabel(e.j), client: e.j.clientName, person: e.j.person, value: e.j.value } })),
      };
    }
  }
  return null;
}
