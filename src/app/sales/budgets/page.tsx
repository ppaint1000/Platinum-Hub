// Sales budgets — each salesperson's monthly quoted/won $ against separate
// quoted and won budget targets, plus a totals card. Admins edit the budgets
// here; sales authority can see everyone's but not edit (enforced by RLS on
// jobs/profiles/sales_targets, not just this page's own logic — see
// sales_schema.sql). Plain sales staff only get their own dashboard.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSalesViewer } from "@/lib/sales/viewer";
import { fiscalMonths, fiscalYearLabel, fiscalYearStart } from "@/lib/sales/fiscal";
import { nzDateKey, nzTodayDateString } from "@/lib/timesheets/formatNZ";
import { SalesPersonCard, type MonthlyFigures } from "@/components/sales/SalesPersonCard";
import { SalesTabs } from "@/components/sales/SalesTabs";
import { DashboardShell } from "@/components/dashboard/parts";
import { TopBar } from "@/components/dashboard/TopBar";
import { dashboardFontClass } from "@/components/dashboard/fonts";

export const metadata: Metadata = { title: "Sales budgets · Platinum Hub" };

type JobRow = {
  quoted_sell_total: number | null;
  quoted_at: string | null;
  won_at: string | null;
  lead_by_user_id: string | null;
};

function emptyMonths(): number[] {
  return Array(12).fill(0);
}

function emptyFigures(): MonthlyFigures {
  return { budgetQuoted: emptyMonths(), quoted: emptyMonths(), budgetWon: emptyMonths(), won: emptyMonths() };
}

export default async function SalesBudgetsPage() {
  const viewer = await getSalesViewer();
  if (!viewer.canSeeAll) redirect("/sales/dashboard");
  const { supabase, isAdmin } = viewer;

  // NZ dates, the same as the sales dashboards, so a month's figures here
  // match the dashboards exactly.
  const todayKey = nzTodayDateString();
  const [ty, tm] = todayKey.split("-").map(Number);
  const startYear = fiscalYearStart(new Date(Date.UTC(ty, tm - 1, 15)));
  const months = fiscalMonths(startYear);
  const monthIndex = new Map(months.map((m, i) => [`${m.year}-${m.month}`, i]));
  const currentMonthIndex = monthIndex.get(`${ty}-${tm}`) ?? 0;

  // Who gets a card here is driven by the "sales" access flag, not the
  // role column - a role='sales' user always has that flag set (see
  // defaultAccessForRole), but this also lets an admin opt themselves in
  // (toggle their own Sales checkbox on /users) without changing their
  // role, since admins already see everything regardless of role.
  const team = await viewer.loadTeam();

  const [{ data: jobs }, { data: targets }] = await Promise.all([
    supabase
      .from("jobs")
      .select("quoted_sell_total, quoted_at, won_at, lead_by_user_id")
      .not("lead_by_user_id", "is", null)
      .returns<JobRow[]>(),
    supabase
      .from("sales_targets")
      .select("user_id, year, month, budget_quoted, budget_won")
      .in("year", [startYear, startYear + 1])
      .returns<{ user_id: string; year: number; month: number; budget_quoted: number; budget_won: number }[]>(),
  ]);

  const byPerson = new Map(team.map((p) => [p.id, emptyFigures()]));

  for (const t of targets ?? []) {
    const idx = monthIndex.get(`${t.year}-${t.month}`);
    const figures = byPerson.get(t.user_id);
    if (figures && idx !== undefined) {
      figures.budgetQuoted[idx] = Number(t.budget_quoted);
      figures.budgetWon[idx] = Number(t.budget_won);
    }
  }

  for (const job of jobs ?? []) {
    const figures = job.lead_by_user_id ? byPerson.get(job.lead_by_user_id) : undefined;
    if (!figures) continue;
    const amount = Number(job.quoted_sell_total ?? 0);

    if (job.quoted_at) {
      const [y, m] = job.quoted_at.split("-").map(Number);
      const idx = monthIndex.get(`${y}-${m}`);
      if (idx !== undefined) figures.quoted[idx] += amount;
    }
    if (job.won_at) {
      const [y, m] = nzDateKey(job.won_at).split("-").map(Number);
      const idx = monthIndex.get(`${y}-${m}`);
      if (idx !== undefined) figures.won[idx] += amount;
    }
  }

  const totals = emptyFigures();
  for (const figures of byPerson.values()) {
    for (const key of ["budgetQuoted", "quoted", "budgetWon", "won"] as const) {
      for (let i = 0; i < 12; i++) totals[key][i] += figures[key][i];
    }
  }

  const label = fiscalYearLabel(startYear);

  return (
    <DashboardShell
      fontClass={dashboardFontClass}
      topBar={<TopBar items={viewer.nav()} activeHref="/sales" />}
      todayKey={todayKey}
      title={isAdmin ? "Sales budgets" : "Sales budget tables"}
    >
      <SalesTabs
        team={team}
        viewerId={viewer.userId}
        inSalesTeam={viewer.inSalesTeam}
        canEditBudgets={isAdmin}
        activeHref="/sales/budgets"
      />

      {team.length === 0 ? (
        <p className="text-sm text-[#5B6472]">No sales people set up yet. Tick Sales for someone on the Users page.</p>
      ) : (
        <div>
          {team.map((p) => (
            <SalesPersonCard
              key={p.id}
              name={p.name}
              userId={p.id}
              label={label}
              months={months}
              currentMonthIndex={currentMonthIndex}
              figures={(byPerson.get(p.id) as MonthlyFigures) ?? emptyFigures()}
              canEditBudget={isAdmin}
              dashboardHref={p.id === viewer.userId ? "/sales/dashboard" : `/sales/dashboard/${p.id}`}
            />
          ))}
          <SalesPersonCard
            name="Total — all sales staff"
            userId=""
            label={label}
            months={months}
            currentMonthIndex={currentMonthIndex}
            figures={totals}
            canEditBudget={false}
          />
        </div>
      )}
    </DashboardShell>
  );
}
