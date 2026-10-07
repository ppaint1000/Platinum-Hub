// Live jobs - every job won and not yet paid: totals across the top, a
// filter, then each job's contract value, claims, and budget vs actual by
// hours, labour, materials, access and other costs.
import Link from "next/link";
import { requireAppAccess } from "@/lib/auth/requireAppAccess";
import { Panel, StatusLabel } from "@/components/ui";
import { jobMargin } from "@/lib/jobs/margin";
import { categoryGroup, fetchClaims, fetchVariations, groupBy, LIVE_STATUSES, money, variationTotals } from "@/lib/jobs/jobFinance";
import { jobStatusLabel } from "@/design/tailwind.tokens";
import type { JobStatus } from "@/lib/jobs/status";

type JobRow = {
  id: string;
  job_number: string | null;
  name: string;
  status: JobStatus;
  quoted_sell_total: number | null;
  quoted_hours: number | null;
  client_id: string | null;
  lead_by_user_id: string | null;
  client: { name: string } | null;
  lead: { full_name: string } | null;
};

type BudgetRow = { job_id: string; category_id: string; category_key: string; budgeted_amount: number; actual_amount: number };

const RED = "#B91C1C";
const GREEN = "#15803D";
const GROUPS = [
  { key: "labour", label: "Labour" },
  { key: "materials", label: "Materials" },
  { key: "access", label: "Access" },
  { key: "other", label: "Other" },
] as const;

type Pair = { budget: number; actual: number };
const pair = (): Pair => ({ budget: 0, actual: 0 });

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Panel className="p-4">
      <p className="text-xs uppercase tracking-wide text-ink-faint">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{value}</p>
      {sub && <p className="text-xs text-ink-soft">{sub}</p>}
    </Panel>
  );
}

// Budget, actual and how much of the budget is used, coloured.
function PairCells({ p, hours }: { p: Pair; hours?: boolean }) {
  const fmt = (n: number) => (hours ? `${Math.round(n)}` : money(n));
  const pct = p.budget > 0 ? Math.round((p.actual / p.budget) * 100) : null;
  return (
    <>
      <td className="border-l border-line px-2 py-2 text-right">{p.budget ? fmt(p.budget) : "—"}</td>
      <td className="px-2 py-2 text-right">{p.actual ? fmt(p.actual) : "—"}</td>
      <td className="px-2 py-2 text-right font-semibold" style={{ color: pct == null ? (p.actual > 0 ? RED : undefined) : pct > 100 ? RED : GREEN }}>
        {pct == null ? (p.actual > 0 ? "No budget" : "—") : `${pct}%`}
      </td>
    </>
  );
}

export default async function LiveJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; client?: string; sales?: string; q?: string }>;
}) {
  const filters = await searchParams;
  const supabase = await requireAppAccess("jobs");

  const { data: allJobs } = await supabase
    .from("jobs")
    .select("id, job_number, name, status, quoted_sell_total, quoted_hours, client_id, lead_by_user_id, client:clients(name), lead:profiles!lead_by_user_id(full_name)")
    .in("status", [...LIVE_STATUSES])
    .order("job_number", { ascending: false })
    .returns<JobRow[]>();

  const live = allJobs ?? [];
  const q = (filters.q ?? "").trim().toLowerCase();
  const jobs = live.filter(
    (j) =>
      (!filters.status || j.status === filters.status) &&
      (!filters.client || j.client_id === filters.client) &&
      (!filters.sales || j.lead_by_user_id === filters.sales) &&
      (!q || `${j.job_number ?? ""} ${j.name} ${j.client?.name ?? ""}`.toLowerCase().includes(q))
  );
  const ids = jobs.map((j) => j.id);

  const [{ data: budgetRows }, { data: totals }, variations, claims] = await Promise.all([
    ids.length
      ? supabase.from("job_budget_vs_actual").select("job_id, category_id, category_key, budgeted_amount, actual_amount").in("job_id", ids).returns<BudgetRow[]>()
      : Promise.resolve({ data: [] as BudgetRow[] }),
    ids.length
      ? supabase.from("job_totals").select("job_id, hours_actual, actual_total").in("job_id", ids).returns<{ job_id: string; hours_actual: number; actual_total: number }[]>()
      : Promise.resolve({ data: [] as { job_id: string; hours_actual: number; actual_total: number }[] }),
    fetchVariations(supabase, ids),
    fetchClaims(supabase, ids),
  ]);

  const budgetsByJob = groupBy(budgetRows ?? [], (r) => r.job_id);
  const totalsByJob = new Map((totals ?? []).map((t) => [t.job_id, t]));
  const variationsByJob = groupBy(variations, (v) => v.job_id);
  const claimsByJob = groupBy(claims, (c) => c.job_id);
  const categoryKey = new Map((budgetRows ?? []).map((r) => [r.category_id, r.category_key]));

  const rows = jobs.map((j) => {
    const v = variationTotals(variationsByJob.get(j.id) ?? []);
    const contract = Number(j.quoted_sell_total ?? 0) + v.approvedAmount;
    const claimed = (claimsByJob.get(j.id) ?? []).reduce((s, c) => s + c.amount, 0);
    const groups = { labour: pair(), materials: pair(), access: pair(), other: pair() };
    for (const b of budgetsByJob.get(j.id) ?? []) {
      const g = groups[categoryGroup(b.category_key)];
      g.budget += Number(b.budgeted_amount);
      g.actual += Number(b.actual_amount);
    }
    for (const x of variationsByJob.get(j.id) ?? []) {
      if (x.status !== "approved" || !x.budget_amount) continue;
      groups[categoryGroup(x.budget_category_id ? categoryKey.get(x.budget_category_id) ?? "other" : "other")].budget += x.budget_amount;
    }
    const total: Pair = {
      budget: Object.values(groups).reduce((s, g) => s + g.budget, 0),
      actual: Object.values(groups).reduce((s, g) => s + g.actual, 0),
    };
    const hours: Pair = { budget: Number(j.quoted_hours ?? 0) + v.approvedHours, actual: Number(totalsByJob.get(j.id)?.hours_actual ?? 0) };
    const m = jobMargin({ quoted: contract, budgeted: total.budget, actual: Number(totalsByJob.get(j.id)?.actual_total ?? 0) });
    return { job: j, contract, claimed, groups, total, hours, margin: m, pendingVariations: v.pendingCount };
  });

  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + f(r), 0);
  const contractTotal = sum((r) => r.contract);
  const claimedTotal = sum((r) => r.claimed);
  const notStarted = sum((r) => (r.job.status === "won" || r.job.status === "scheduled" ? r.contract : 0));
  const withMargin = rows.filter((r) => r.margin.profit != null);
  const avgMargin =
    withMargin.length && withMargin.reduce((s, r) => s + r.contract, 0) > 0
      ? withMargin.reduce((s, r) => s + (r.margin.profit ?? 0), 0) / withMargin.reduce((s, r) => s + r.contract, 0)
      : null;
  const overBudget = rows.filter((r) => r.total.budget > 0 && r.total.actual > r.total.budget).length;
  const totalPair = (f: (r: (typeof rows)[number]) => Pair): Pair => ({ budget: sum((r) => f(r).budget), actual: sum((r) => f(r).actual) });

  const clients = [...new Map(live.filter((j) => j.client_id).map((j) => [j.client_id!, j.client?.name ?? "—"])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const sales = [...new Map(live.filter((j) => j.lead_by_user_id).map((j) => [j.lead_by_user_id!, j.lead?.full_name ?? "—"])).entries()].sort((a, b) =>
    a[1].localeCompare(b[1])
  );
  const filtered = !!(filters.status || filters.client || filters.sales || q);
  const selectClass = "w-full rounded border border-line bg-white px-2 py-1.5 text-sm";

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 sm:p-8">
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Link href="/jobs" className="text-sm font-medium text-ink-soft hover:text-ink">
          ← Jobs
        </Link>
        <Link href="/jobs/forecast" className="text-sm font-medium text-accent hover:text-accent-hover">
          Forecast
        </Link>
      </div>
      <h1 className="text-3xl font-bold text-ink">Live jobs</h1>
      <p className="mb-6 text-sm text-ink-soft">Every job won and not yet paid{filtered ? " - filtered" : ""}.</p>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Kpi label="Live jobs" value={String(rows.length)} sub={overBudget ? `${overBudget} over budget` : "None over budget"} />
        <Kpi label="Total contract value" value={money(contractTotal)} />
        <Kpi label="Claimed to date" value={money(claimedTotal)} sub={contractTotal ? `${Math.round((claimedTotal / contractTotal) * 100)}%` : undefined} />
        <Kpi label="Left to claim" value={money(contractTotal - claimedTotal)} />
        <Kpi label="Not started yet" value={money(notStarted)} sub="Won and scheduled" />
        <Kpi label="Cost to date" value={money(sum((r) => r.total.actual))} sub={`of ${money(sum((r) => r.total.budget))} budget`} />
        <Kpi label="Average margin" value={avgMargin == null ? "—" : `${(avgMargin * 100).toFixed(0)}%`} sub="Actual, or budgeted if not started" />
      </div>

      <Panel className="mb-6 p-4">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" method="get">
          <label className="space-y-1">
            <span className="text-xs font-semibold text-ink-soft">Search</span>
            <input name="q" defaultValue={filters.q ?? ""} placeholder="Job, number or client" className={selectClass} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-ink-soft">Status</span>
            <select name="status" defaultValue={filters.status ?? ""} className={selectClass}>
              <option value="">All live</option>
              {LIVE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s === "won" ? "To be scheduled" : jobStatusLabel[s] ?? s}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-ink-soft">Client</span>
            <select name="client" defaultValue={filters.client ?? ""} className={selectClass}>
              <option value="">All clients</option>
              {clients.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-ink-soft">Sales person</span>
            <select name="sales" defaultValue={filters.sales ?? ""} className={selectClass}>
              <option value="">Everyone</option>
              {sales.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white">
              Search
            </button>
            {filtered && (
              <Link href="/jobs/live" className="rounded-md px-3 py-2 text-sm font-medium text-ink-soft hover:bg-black/5">
                Clear
              </Link>
            )}
          </div>
        </form>
      </Panel>

      {rows.length === 0 ? (
        <Panel className="p-6 text-center text-ink-soft">{filtered ? "No live jobs match." : "No live jobs right now."}</Panel>
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[1500px] text-sm tabular-nums">
            <thead className="text-xs uppercase tracking-wide text-ink-faint">
              <tr className="border-b border-line">
                <th rowSpan={2} className="sticky left-0 z-10 bg-paper-raised px-3 py-2 text-left font-semibold">
                  Job
                </th>
                <th rowSpan={2} className="px-2 py-2 text-left font-semibold">Status</th>
                <th rowSpan={2} className="px-2 py-2 text-right font-semibold">Contract value</th>
                <th rowSpan={2} className="px-2 py-2 text-right font-semibold">Claimed</th>
                <th rowSpan={2} className="px-2 py-2 text-right font-semibold">Left to claim</th>
                {[{ key: "hours", label: "Hours" }, ...GROUPS, { key: "total", label: "Total cost" }].map((g) => (
                  <th key={g.key} colSpan={3} className="border-l border-line px-2 py-2 text-center font-semibold text-ink">
                    {g.label}
                  </th>
                ))}
                <th rowSpan={2} className="border-l border-line px-2 py-2 text-right font-semibold">Margin</th>
              </tr>
              <tr className="border-b border-line">
                {Array.from({ length: 6 }).flatMap((_, i) => [
                  <th key={`b${i}`} className="border-l border-line px-2 py-1 text-right font-medium">Budget</th>,
                  <th key={`a${i}`} className="px-2 py-1 text-right font-medium">Actual</th>,
                  <th key={`r${i}`} className="px-2 py-1 text-right font-medium">Used</th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.job.id} className="border-b border-line/60 hover:bg-black/[0.02]">
                  <td className="sticky left-0 z-10 bg-paper-raised px-3 py-2">
                    <Link href={`/jobs/${r.job.id}`} className="font-semibold text-ink hover:text-accent">
                      {r.job.name}
                    </Link>
                    <span className="block text-xs text-ink-soft">
                      <span className="font-mono">{r.job.job_number ?? "—"}</span> · {r.job.client?.name ?? "No client"}
                      {r.pendingVariations > 0 && <span className="text-amber-700"> · {r.pendingVariations} variation{r.pendingVariations === 1 ? "" : "s"} waiting</span>}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <StatusLabel status={r.job.status} />
                  </td>
                  <td className="px-2 py-2 text-right">{money(r.contract)}</td>
                  <td className="px-2 py-2 text-right">{money(r.claimed)}</td>
                  <td className="px-2 py-2 text-right">{money(r.contract - r.claimed)}</td>
                  <PairCells p={r.hours} hours />
                  {GROUPS.map((g) => (
                    <PairCells key={g.key} p={r.groups[g.key]} />
                  ))}
                  <PairCells p={r.total} />
                  <td
                    className="border-l border-line px-2 py-2 text-right font-semibold"
                    style={{ color: r.margin.margin != null && r.margin.margin < 0 ? RED : undefined }}
                    title={r.margin.estimated ? "Budgeted - no costs yet" : undefined}
                  >
                    {r.margin.margin == null ? "—" : `${(r.margin.margin * 100).toFixed(0)}%${r.margin.estimated ? "*" : ""}`}
                  </td>
                </tr>
              ))}
              <tr className="bg-black/[0.03] font-semibold">
                <td className="sticky left-0 z-10 bg-[#F3F2EE] px-3 py-2">Total ({rows.length})</td>
                <td></td>
                <td className="px-2 py-2 text-right">{money(contractTotal)}</td>
                <td className="px-2 py-2 text-right">{money(claimedTotal)}</td>
                <td className="px-2 py-2 text-right">{money(contractTotal - claimedTotal)}</td>
                <PairCells p={totalPair((r) => r.hours)} hours />
                {GROUPS.map((g) => (
                  <PairCells key={g.key} p={totalPair((r) => r.groups[g.key])} />
                ))}
                <PairCells p={totalPair((r) => r.total)} />
                <td className="border-l border-line px-2 py-2 text-right">{avgMargin == null ? "—" : `${(avgMargin * 100).toFixed(0)}%`}</td>
              </tr>
            </tbody>
          </table>
        </Panel>
      )}
      <p className="mt-3 text-xs text-ink-soft">
        Contract value = quote + approved variations. Used = actual as a % of budget (red over 100%). * margin from the budget - no costs recorded yet.
      </p>
    </div>
  );
}
