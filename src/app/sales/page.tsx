// Sales — each salesperson's monthly quoted/won $ against separate quoted
// and won budget targets. Admins and anyone with the "authority" flag see
// everyone's (enforced by RLS on jobs/profiles/sales_targets, not just this
// page's own logic — see sales_schema.sql), plus a totals row, and admins
// edit the budgets here. Plain sales staff get their own sales dashboard
// (/sales/dashboard) instead.
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAppAccess } from "@/lib/auth/requireAppAccess";
import { fiscalMonths, fiscalYearLabel, fiscalYearStart } from "@/lib/sales/fiscal";
import { SalesPersonCard, type MonthlyFigures } from "@/components/sales/SalesPersonCard";

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

export default async function SalesPage() {
  const supabase = await requireAppAccess("sales");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user?.id ?? "")
    .single();
  const { data: access } = await supabase
    .from("user_app_access")
    .select("sales_authority")
    .eq("user_id", user?.id ?? "")
    .maybeSingle();

  const isAdmin = profile?.role === "admin";
  const canSeeAll = isAdmin || !!access?.sales_authority;
  if (!canSeeAll) redirect("/sales/dashboard");

  const startYear = fiscalYearStart();
  const months = fiscalMonths(startYear);
  const monthIndex = new Map(months.map((m, i) => [`${m.year}-${m.month}`, i]));
  const today = new Date();
  const currentMonthIndex = monthIndex.get(`${today.getFullYear()}-${today.getMonth() + 1}`) ?? 0;

  // Who gets a card here is driven by the "sales" access flag, not the
  // role column - a role='sales' user always has that flag set (see
  // defaultAccessForRole), but this also lets an admin opt themselves in
  // (toggle their own Sales checkbox on /users) without changing their
  // role, since admins already see everything regardless of role.
  let salesPeople: { id: string; full_name: string }[] = [];
  const { data: salesAccess } = await supabase.from("user_app_access").select("user_id").eq("sales", true);
  const ids = (salesAccess ?? []).map((a) => a.user_id);
  if (ids.length > 0) {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", ids)
      .order("full_name")
      .returns<{ id: string; full_name: string }[]>();
    salesPeople = data ?? [];
  }

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

  const people = salesPeople;
  const byPerson = new Map(people.map((p) => [p.id, emptyFigures()]));

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
      const wonDate = new Date(job.won_at);
      const idx = monthIndex.get(`${wonDate.getFullYear()}-${wonDate.getMonth() + 1}`);
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
    <div className="mx-auto w-full max-w-5xl p-8">
      <Link
        href="/hub"
        className="mb-4 flex items-center gap-1.5 text-sm font-medium text-ink-soft transition hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Hub
      </Link>

      <h1 className="mb-6 text-3xl font-bold text-ink">Sales</h1>

      {people.length === 0 ? (
        <p className="text-sm text-ink-soft">No sales people set up yet.</p>
      ) : (
        <>
          {people.map((p) => (
            <SalesPersonCard
              key={p.id}
              name={p.full_name}
              userId={p.id}
              label={label}
              months={months}
              currentMonthIndex={currentMonthIndex}
              figures={(byPerson.get(p.id) as MonthlyFigures) ?? emptyFigures()}
              canEditBudget={isAdmin}
              dashboardHref={`/sales/dashboard/${p.id}`}
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
        </>
      )}
    </div>
  );
}
