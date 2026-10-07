// A job's Overview: the dashboard circles, then cards - financials (contract
// value, claimed, budget used), the job's details, a budget chart, budget vs
// actual, its schedule, variations and invoicing at a glance.
import Link from "next/link";
import { requireAppAccess } from "@/lib/auth/requireAppAccess";
import { Panel, StatusLabel } from "@/components/ui";
import { JobHealth, type HealthItem } from "@/components/jobs/JobHealth";
import { jobMargin } from "@/lib/jobs/margin";
import { fetchClaims, fetchVariations, money, variationTotals } from "@/lib/jobs/jobFinance";
import type { JobStatus } from "@/lib/jobs/status";

type JobRow = {
  id: string;
  job_number: string | null;
  name: string;
  description: string | null;
  status: JobStatus;
  quoted_sell_total: number | null;
  quoted_hours: number | null;
  lead_source: string | null;
  quoted_at: string | null;
  won_at: string | null;
  completed_at: string | null;
  client: { name: string } | null;
  lead: { full_name: string } | null;
};

type BudgetRow = {
  category_id: string;
  category_label: string;
  budgeted_amount: number;
  actual_amount: number;
};

const RED = "#B91C1C";
const GREEN = "#15803D";
const BLUE = "#1F4E8C";

const nzDate = (d: string | null) =>
  d ? new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" }) : "—";

function Card({ title, action, children, className = "" }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Panel className={`p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">{title}</h2>
        {action}
      </div>
      {children}
    </Panel>
  );
}

function CardLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-sm font-semibold text-accent hover:text-accent-hover">
      {children}
    </Link>
  );
}

// A big percentage, a bar, and what it's of.
function Progress({ share, label, left, right, over }: { share: number; label: string; left: string; right: string; over?: boolean }) {
  const pct = Math.round(share * 100);
  const colour = over ? RED : share > 0 ? GREEN : BLUE;
  return (
    <div>
      <p className="text-ink">
        <span className="text-2xl font-bold tabular-nums" style={{ color: colour }}>
          {pct}%
        </span>{" "}
        <span className="text-sm text-ink-soft">{label}</span>
      </p>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#ECEAE3]">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: colour }} />
      </div>
      <div className="mt-1 flex justify-between text-xs text-ink-soft">
        <span>{left}</span>
        <span>{right}</span>
      </div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}

export default async function JobOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await requireAppAccess("jobs");

  const [{ data: job }, { data: budgetRows }, { data: totals }, { data: sites }, { data: bookings }, { data: hoursWaiting }, variations, claims] =
    await Promise.all([
      supabase
        .from("jobs")
        .select(
          "id, job_number, name, description, status, quoted_sell_total, quoted_hours, lead_source, quoted_at, won_at, completed_at, client:clients(name), lead:profiles!lead_by_user_id(full_name)"
        )
        .eq("id", id)
        .single<JobRow>(),
      supabase
        .from("job_budget_vs_actual")
        .select("category_id, category_label, budgeted_amount, actual_amount")
        .eq("job_id", id)
        .order("sort_order")
        .returns<BudgetRow[]>(),
      supabase.from("job_totals").select("actual_total, hours_actual").eq("job_id", id).maybeSingle<{ actual_total: number; hours_actual: number }>(),
      supabase.from("sites").select("name, address").eq("job_id", id).returns<{ name: string; address: string | null }[]>(),
      supabase
        .from("job_bookings")
        .select("id, start_date, end_date, crew, notes")
        .eq("job_id", id)
        .order("start_date")
        .returns<{ id: string; start_date: string; end_date: string; crew: string[]; notes: string | null }[]>(),
      supabase.rpc("job_hours_pending", { p_job_id: id }),
      fetchVariations(supabase, [id]),
      fetchClaims(supabase, [id]),
    ]);

  if (!job) return null;

  const crewIds = [...new Set((bookings ?? []).flatMap((b) => b.crew))];
  const { data: crewRows } = crewIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", crewIds).returns<{ id: string; full_name: string }[]>()
    : { data: [] as { id: string; full_name: string }[] };
  const crewName = new Map((crewRows ?? []).map((p) => [p.id, p.full_name]));

  const v = variationTotals(variations);
  const quoted = Number(job.quoted_sell_total ?? 0);
  const contractValue = quoted + v.approvedAmount;
  const claimed = claims.reduce((s, c) => s + c.amount, 0);

  // Budget by category, with approved variations' cost budget added on.
  const categories = (budgetRows ?? [])
    .map((r) => ({
      id: r.category_id,
      label: r.category_label,
      budget: Number(r.budgeted_amount) + (v.budgetByCategory.get(r.category_id) ?? 0),
      actual: Number(r.actual_amount),
    }))
    .filter((c) => c.budget > 0 || c.actual > 0);
  const uncategorisedVariationBudget = v.approvedBudget - [...v.budgetByCategory.values()].reduce((s, n) => s + n, 0);
  const budgetTotal = categories.reduce((s, c) => s + c.budget, 0) + uncategorisedVariationBudget;
  const actualTotal = categories.reduce((s, c) => s + c.actual, 0);
  const hoursBudget = Number(job.quoted_hours ?? 0) + v.approvedHours;
  const hoursActual = Number(totals?.hours_actual ?? 0);
  const waitingHours = Number(hoursWaiting ?? 0);
  const { profit, margin, estimated } = jobMargin({ quoted: contractValue, budgeted: budgetTotal, actual: Number(totals?.actual_total ?? 0) });

  const healthItems: HealthItem[] = ["won", "scheduled", "in_progress", "complete", "invoiced", "paid"].includes(job.status)
    ? [
        budgetTotal > 0
          ? { label: "Whole job", actual: actualTotal, budget: budgetTotal }
          : { label: "Whole job (vs quote)", actual: actualTotal, budget: contractValue },
        ...(hoursBudget ? [{ label: "Hours", actual: hoursActual, budget: hoursBudget, unit: "h" as const }] : []),
        ...categories.map((c) => ({ label: c.label, actual: c.actual, budget: c.budget })),
      ]
    : [];

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" });
  const upcoming = (bookings ?? []).filter((b) => b.end_date >= today);
  const chartMax = Math.max(1, ...categories.map((c) => Math.max(c.budget, c.actual)));

  return (
    <div className="space-y-6">
      {waitingHours > 0 && (
        <Link
          href="/jobs/hours"
          className="flex flex-wrap items-center gap-x-3 rounded-lg border border-[#E5484D]/40 bg-[#FDECEC] px-4 py-3 text-sm hover:bg-[#FBE0E0]"
        >
          <span className="font-semibold text-ink">{waitingHours.toFixed(1)} timesheet hours waiting for approval</span>
          <span className="text-ink-soft">Not in Labour or Hours until approved.</span>
          <span className="ml-auto font-semibold text-accent">Approve →</span>
        </Link>
      )}

      <JobHealth items={healthItems} />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Job financials" action={<CardLink href={`/jobs/${id}/invoicing`}>Invoicing →</CardLink>}>
          <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Detail label="Contract value">{money(contractValue)}</Detail>
            <Detail label="Claimed">{money(claimed)}</Detail>
            <Detail label="Left to claim">{money(Math.max(0, contractValue - claimed))}</Detail>
            <Detail label={estimated ? "Est. margin" : "Margin"}>
              {margin != null ? (
                <span style={{ color: margin < 0 ? RED : undefined }}>
                  {(margin * 100).toFixed(0)}% · {money(profit ?? 0)}
                </span>
              ) : (
                "—"
              )}
            </Detail>
          </div>
          <div className="space-y-5">
            <Progress
              share={contractValue > 0 ? claimed / contractValue : 0}
              label="of contract value claimed"
              left={`Claimed ${money(claimed)}`}
              right={`Contract ${money(contractValue)}`}
              over={claimed > contractValue && contractValue > 0}
            />
            <Progress
              share={budgetTotal > 0 ? actualTotal / budgetTotal : 0}
              label="of total budget used"
              left={`Actual cost ${money(actualTotal)}`}
              right={`Budget ${money(budgetTotal)}`}
              over={budgetTotal > 0 && actualTotal > budgetTotal}
            />
          </div>
          {v.approvedAmount !== 0 || v.pendingAmount !== 0 ? (
            <p className="mt-4 text-xs text-ink-soft">
              Quote {money(quoted)}
              {v.approvedAmount !== 0 && ` + approved variations ${money(v.approvedAmount)}`}
              {v.pendingAmount !== 0 && ` · ${money(v.pendingAmount)} of variations waiting for approval`}
            </p>
          ) : null}
        </Card>

        <Card title="Job details">
          <dl className="grid grid-cols-2 gap-4">
            <Detail label="Status">
              <StatusLabel status={job.status} />
            </Detail>
            <Detail label="Job number">{job.job_number ?? "—"}</Detail>
            <Detail label="Client">{job.client?.name ?? "—"}</Detail>
            <Detail label="Sales person">{job.lead?.full_name ?? "—"}</Detail>
            <Detail label="Site">
              {(sites ?? []).length
                ? (sites ?? []).map((s) => (
                    <span key={s.name} className="block">
                      {s.name}
                      {s.address && s.address !== s.name && <span className="block text-xs font-normal text-ink-soft">{s.address}</span>}
                    </span>
                  ))
                : "No clock-in site yet"}
            </Detail>
            <Detail label="Lead source">{job.lead_source ?? "—"}</Detail>
            <Detail label="Quoted">{nzDate(job.quoted_at)}</Detail>
            <Detail label="Won">{nzDate(job.won_at)}</Detail>
            {job.completed_at && <Detail label="Completed">{nzDate(job.completed_at)}</Detail>}
          </dl>
          {job.description && <p className="mt-4 border-t border-line pt-3 text-sm text-ink-soft">{job.description}</p>}
        </Card>

        <Card title="Budget" action={<CardLink href={`/jobs/${id}/costs`}>Budget & costs →</CardLink>}>
          {categories.length === 0 ? (
            <p className="text-sm text-ink-soft">No budget or costs on this job yet.</p>
          ) : (
            <>
              <div className="space-y-3">
                {categories.map((c) => {
                  const over = c.budget > 0 && c.actual > c.budget;
                  return (
                    <div key={c.id}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="font-medium text-ink">{c.label}</span>
                        <span className="tabular-nums text-ink-soft">
                          {money(c.actual)} of {money(c.budget)}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <div className="h-2 rounded-full bg-[#CFD8E3]" style={{ width: `${(c.budget / chartMax) * 100}%` }} title={`Budget ${money(c.budget)}`} />
                        <div
                          className="h-2 rounded-full"
                          style={{ width: `${Math.max(c.actual > 0 ? 1 : 0, (c.actual / chartMax) * 100)}%`, background: over ? RED : GREEN }}
                          title={`Actual ${money(c.actual)}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex gap-4 text-xs text-ink-soft">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-4 rounded-full bg-[#CFD8E3]" /> Budget
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-4 rounded-full" style={{ background: GREEN }} /> Actual
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-4 rounded-full" style={{ background: RED }} /> Over budget
                </span>
              </div>
            </>
          )}
        </Card>

        <Card title="Budget vs actual">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                  <th className="py-2 pr-2 font-semibold"></th>
                  <th className="px-2 py-2 text-right font-semibold">Budget</th>
                  <th className="px-2 py-2 text-right font-semibold">Actual</th>
                  <th className="px-2 py-2 text-right font-semibold">Variance</th>
                  <th className="py-2 pl-2 text-right font-semibold">% of budget</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {[
                  ...(hoursBudget || hoursActual ? [{ id: "hours", label: "Hours", budget: hoursBudget, actual: hoursActual, hours: true }] : []),
                  ...categories.map((c) => ({ ...c, hours: false })),
                ].map((r) => {
                  const fmt = (n: number) => (r.hours ? `${n.toFixed(0)} h` : money(n));
                  const variance = r.budget - r.actual;
                  const pct = r.budget > 0 ? Math.round((r.actual / r.budget) * 100) : null;
                  return (
                    <tr key={r.id} className="border-b border-line/60">
                      <td className="py-2 pr-2 font-medium text-ink">{r.label}</td>
                      <td className="px-2 py-2 text-right">{fmt(r.budget)}</td>
                      <td className="px-2 py-2 text-right">{fmt(r.actual)}</td>
                      <td className="px-2 py-2 text-right" style={{ color: variance < 0 ? RED : GREEN }}>
                        {fmt(variance)}
                      </td>
                      <td className="py-2 pl-2 text-right" style={{ color: pct == null ? undefined : pct > 100 ? RED : GREEN }}>
                        {pct == null ? "—" : `${pct}%`}
                      </td>
                    </tr>
                  );
                })}
                <tr className="font-semibold">
                  <td className="py-2 pr-2">Total cost</td>
                  <td className="px-2 py-2 text-right">{money(budgetTotal)}</td>
                  <td className="px-2 py-2 text-right">{money(actualTotal)}</td>
                  <td className="px-2 py-2 text-right" style={{ color: budgetTotal - actualTotal < 0 ? RED : GREEN }}>
                    {money(budgetTotal - actualTotal)}
                  </td>
                  <td className="py-2 pl-2 text-right" style={{ color: budgetTotal > 0 && actualTotal > budgetTotal ? RED : GREEN }}>
                    {budgetTotal > 0 ? `${Math.round((actualTotal / budgetTotal) * 100)}%` : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Schedule" action={<CardLink href="/schedule">Schedule →</CardLink>}>
          {upcoming.length === 0 ? (
            <p className="text-sm text-ink-soft">
              {(bookings ?? []).length ? "Nothing booked from today on." : "Not on the schedule yet."}
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {upcoming.slice(0, 6).map((b) => (
                <li key={b.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                  <span className="font-medium text-ink">
                    {nzDate(b.start_date)}
                    {b.end_date !== b.start_date && ` – ${nzDate(b.end_date)}`}
                  </span>
                  <span className="text-ink-soft">{b.crew.map((c) => crewName.get(c) ?? "—").join(", ") || "No crew yet"}</span>
                  {b.notes && <span className="w-full text-xs text-ink-faint">{b.notes}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Variations" action={<CardLink href={`/jobs/${id}/variations`}>Variations →</CardLink>}>
          {variations.length === 0 ? (
            <p className="text-sm text-ink-soft">No variations on this job.</p>
          ) : (
            <>
              <div className="mb-3 grid grid-cols-3 gap-4">
                <Detail label="Approved">{money(v.approvedAmount)}</Detail>
                <Detail label="Waiting">
                  <span className={v.pendingCount ? "text-amber-700" : undefined}>
                    {v.pendingCount} · {money(v.pendingAmount)}
                  </span>
                </Detail>
                <Detail label="Extra hours">{v.approvedHours ? `${v.approvedHours} h` : "—"}</Detail>
              </div>
              <ul className="divide-y divide-line text-sm">
                {variations.slice(-5).map((x) => (
                  <li key={x.id} className="flex justify-between gap-2 py-1.5">
                    <span className="text-ink">
                      <span className="font-mono text-xs text-ink-faint">{x.reference}</span> {x.name}
                    </span>
                    <span className="tabular-nums text-ink-soft">
                      {money(x.amount)} · {x.status === "approved" ? "Approved" : x.status === "declined" ? "Declined" : "Waiting"}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
