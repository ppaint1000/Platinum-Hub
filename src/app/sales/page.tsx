// Sales — each salesperson's monthly quoted/won $ against separate quoted
// and won budget targets. A plain sales-role user sees only their own row;
// admins and anyone with the "authority" flag see everyone's (enforced by
// RLS on jobs/profiles/sales_targets, not just this page's own logic — see
// sales_schema.sql). Admins additionally get a totals row across everyone.
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAppAccess } from "@/lib/auth/requireAppAccess";
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

// Sales year runs Apr-Mar (NZ tax year), not Jan-Dec. "Start year" is the
// calendar year April falls in - e.g. start year 2026 covers Apr 2026
// through Mar 2027. sales_targets/jobs are still keyed by plain calendar
// year+month, so this just windows 12 specific (year, month) pairs over
// that storage rather than changing it.
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
  if (canSeeAll) {
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
  } else {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("id", user?.id ?? "")
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

  const label = `${startYear}/${String(startYear + 1).slice(-2)}`;

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
            />
          ))}
          {canSeeAll && (
            <SalesPersonCard
              name="Total — all sales staff"
              userId=""
              label={label}
              months={months}
              currentMonthIndex={currentMonthIndex}
              figures={totals}
              canEditBudget={false}
            />
          )}
        </>
      )}
    </div>
  );
}
