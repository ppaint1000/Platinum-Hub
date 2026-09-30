// Everything a sales dashboard shows, for the current sales year (Apr-Mar):
// one salesperson's, or the whole team's added together (the admin
// "Overall" view). Built from the same sources as the Budgets tables - jobs
// credited to each person (lead_by_user_id) and their sales_targets - so
// the two always agree. Dates are NZ calendar dates.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { nzDateKey, nzTodayDateString } from "@/lib/timesheets/formatNZ";
import { fiscalMonths, fiscalYearLabel, fiscalYearStart } from "./fiscal";

// A quote still waiting on the client this long gets flagged to follow up.
export const FOLLOW_UP_DAYS = 30;
const RECENT_WINS = 5;

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type JobRow = {
  id: string;
  job_number: string | null;
  name: string;
  status: string;
  quoted_sell_total: number | null;
  quoted_at: string | null;
  won_at: string | null;
  lost_at: string | null;
  client_id: string | null;
  // The online proposal from the Costing app (jobs_proposal_activity.sql).
  proposal_url: string | null;
  proposal_sent_at: string | null;
  proposal_viewed_at: string | null;
  proposal_view_count: number | null;
  lead_by_user_id: string;
};

export type SalesPerson = { id: string; name: string };

export type SalesMonth = {
  key: string;
  label: string;
  quoted: number;
  won: number;
  budgetQuoted: number;
  budgetWon: number;
};

export type SalesQuote = {
  id: string;
  name: string;
  client: string | null;
  person: string; // the salesperson it's credited to
  value: number;
  date: string; // YYYY-MM-DD: quoted date for awaiting quotes, won date for wins
  days: number; // days since that date
  // Online proposal: its link, when sent, and how often/last opened.
  proposal?: { url: string; sentAt: string | null; viewedAt: string | null; viewCount: number } | null;
};

// One row of the Overall view's "By salesperson" table.
export type SalesPersonSummary = SalesPerson & {
  monthWon: number;
  monthBudgetWon: number;
  ytdWon: number;
  ytdBudgetWon: number;
  ytdQuoted: number;
  awaitingCount: number;
  awaitingValue: number;
};

export type SalesDashboardData = {
  todayKey: string;
  yearLabel: string;
  monthLabel: string;
  thisMonth: { quoted: number; budgetQuoted: number; won: number; budgetWon: number };
  yearToDate: {
    quoted: number;
    won: number;
    budgetWon: number;
    // Dollars won: $ won ÷ $ quoted.
    winRate: number | null;
    // Win rate by number of quotes: won ÷ (won + lost).
    wonCount: number;
    lostCount: number;
    countWinRate: number | null;
  };
  months: SalesMonth[];
  awaiting: SalesQuote[];
  awaitingValue: number;
  recentWins: SalesQuote[];
  people: SalesPersonSummary[];
};

type MonthField = "quoted" | "won" | "budgetQuoted" | "budgetWon";

function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86_400_000);
}

function emptyMonths(fiscal: { year: number; month: number }[]): SalesMonth[] {
  return fiscal.map((m) => ({
    key: `${m.year}-${String(m.month).padStart(2, "0")}`,
    label: MONTH_SHORT[m.month - 1],
    quoted: 0,
    won: 0,
    budgetQuoted: 0,
    budgetWon: 0,
  }));
}

// Total of one field from April up to and including month `upTo`.
function sumTo(months: SalesMonth[], field: MonthField, upTo: number): number {
  return months.slice(0, upTo + 1).reduce((s, m) => s + m[field], 0);
}

export async function loadSalesDashboard(
  supabase: SupabaseClient,
  people: SalesPerson[]
): Promise<SalesDashboardData> {
  const ids = people.map((p) => p.id);
  const nameOf = new Map(people.map((p) => [p.id, p.name]));

  const todayKey = nzTodayDateString();
  const [ty, tm] = todayKey.split("-").map(Number);
  const startYear = fiscalYearStart(new Date(Date.UTC(ty, tm - 1, 15)));
  const fiscal = fiscalMonths(startYear);
  const monthIndex = new Map(fiscal.map((m, i) => [`${m.year}-${m.month}`, i]));
  const currentIndex = monthIndex.get(`${ty}-${tm}`) ?? 0;

  // Read with the viewer's own session, so RLS decides whose jobs and
  // budgets they can see (their own, or everyone's for admins and sales
  // authority), exactly as on the Budgets page.
  const [{ data: jobRows }, { data: targets }] =
    ids.length === 0
      ? [{ data: [] as JobRow[] }, { data: [] }]
      : await Promise.all([
          supabase
            .from("jobs")
            .select("id, job_number, name, status, quoted_sell_total, quoted_at, won_at, lost_at, client_id, lead_by_user_id, proposal_url, proposal_sent_at, proposal_viewed_at, proposal_view_count")
            .in("lead_by_user_id", ids)
            .returns<JobRow[]>(),
          supabase
            .from("sales_targets")
            .select("user_id, year, month, budget_quoted, budget_won")
            .in("user_id", ids)
            .in("year", [startYear, startYear + 1])
            .returns<{ user_id: string; year: number; month: number; budget_quoted: number; budget_won: number }[]>(),
        ]);
  const jobs = jobRows ?? [];

  // Client names only. Sales staff have no RLS access to clients, so these
  // are read with the service role - limited to the clients on the jobs
  // already read above, and nothing but the name.
  const clientIds = [...new Set(jobs.map((j) => j.client_id).filter((id): id is string => !!id))];
  const clientNames = new Map<string, string>();
  if (clientIds.length > 0) {
    const { data: clients } = await createAdminClient()
      .from("clients")
      .select("id, name")
      .in("id", clientIds)
      .returns<{ id: string; name: string }[]>();
    for (const c of clients ?? []) clientNames.set(c.id, c.name);
  }

  // Month figures per person, then added together for the page.
  const byPerson = new Map(ids.map((id) => [id, emptyMonths(fiscal)]));

  for (const t of targets ?? []) {
    const i = monthIndex.get(`${t.year}-${t.month}`);
    const personMonths = byPerson.get(t.user_id);
    if (i === undefined || !personMonths) continue;
    personMonths[i].budgetQuoted = Number(t.budget_quoted);
    personMonths[i].budgetWon = Number(t.budget_won);
  }

  const awaiting: SalesQuote[] = [];
  const wins: SalesQuote[] = [];
  // Quotes won and lost this sales year, up to this month.
  let wonCount = 0;
  let lostCount = 0;
  const inYearToDate = (dateKey: string) => {
    const [y, m] = dateKey.split("-").map(Number);
    const i = monthIndex.get(`${y}-${m}`);
    return i !== undefined && i <= currentIndex;
  };
  const awaitingByPerson = new Map<string, { count: number; value: number }>();

  for (const job of jobs) {
    const personMonths = byPerson.get(job.lead_by_user_id);
    if (!personMonths) continue;
    const value = Number(job.quoted_sell_total ?? 0);
    const base = {
      id: job.id,
      name: job.job_number ? `${job.job_number} · ${job.name}` : job.name,
      client: job.client_id ? clientNames.get(job.client_id) ?? null : null,
      person: nameOf.get(job.lead_by_user_id) ?? "",
      proposal: job.proposal_url
        ? {
            url: job.proposal_url,
            sentAt: job.proposal_sent_at,
            viewedAt: job.proposal_viewed_at,
            viewCount: Number(job.proposal_view_count ?? 0),
          }
        : null,
      value,
    };

    if (job.quoted_at) {
      const [y, m] = job.quoted_at.split("-").map(Number);
      const i = monthIndex.get(`${y}-${m}`);
      if (i !== undefined) personMonths[i].quoted += value;
    }
    if (job.won_at && inYearToDate(nzDateKey(job.won_at))) wonCount++;
    if (job.status === "lost" && job.lost_at && inYearToDate(job.lost_at.slice(0, 10))) lostCount++;
    if (job.won_at) {
      const wonKey = nzDateKey(job.won_at);
      const [y, m] = wonKey.split("-").map(Number);
      const i = monthIndex.get(`${y}-${m}`);
      if (i !== undefined) personMonths[i].won += value;
      wins.push({ ...base, date: wonKey, days: daysBetween(wonKey, todayKey) });
    }
    if (job.status === "quoted") {
      const quotedKey = job.quoted_at ?? todayKey;
      awaiting.push({ ...base, date: quotedKey, days: daysBetween(quotedKey, todayKey) });
      const tally = awaitingByPerson.get(job.lead_by_user_id) ?? { count: 0, value: 0 };
      tally.count++;
      tally.value += value;
      awaitingByPerson.set(job.lead_by_user_id, tally);
    }
  }

  const months = emptyMonths(fiscal);
  for (const personMonths of byPerson.values()) {
    personMonths.forEach((m, i) => {
      months[i].quoted += m.quoted;
      months[i].won += m.won;
      months[i].budgetQuoted += m.budgetQuoted;
      months[i].budgetWon += m.budgetWon;
    });
  }

  const summaries: SalesPersonSummary[] = people.map((p) => {
    const pm = byPerson.get(p.id) ?? emptyMonths(fiscal);
    const tally = awaitingByPerson.get(p.id) ?? { count: 0, value: 0 };
    return {
      ...p,
      monthWon: pm[currentIndex].won,
      monthBudgetWon: pm[currentIndex].budgetWon,
      ytdWon: sumTo(pm, "won", currentIndex),
      ytdBudgetWon: sumTo(pm, "budgetWon", currentIndex),
      ytdQuoted: sumTo(pm, "quoted", currentIndex),
      awaitingCount: tally.count,
      awaitingValue: tally.value,
    };
  });

  // Oldest first - the ones most in need of a follow-up call.
  awaiting.sort((a, b) => a.date.localeCompare(b.date));
  wins.sort((a, b) => b.date.localeCompare(a.date));

  const ytdQuoted = sumTo(months, "quoted", currentIndex);
  const ytdWon = sumTo(months, "won", currentIndex);
  const current = months[currentIndex];

  return {
    todayKey,
    yearLabel: fiscalYearLabel(startYear),
    monthLabel: MONTH_LONG[tm - 1],
    thisMonth: {
      quoted: current.quoted,
      budgetQuoted: current.budgetQuoted,
      won: current.won,
      budgetWon: current.budgetWon,
    },
    yearToDate: {
      quoted: ytdQuoted,
      won: ytdWon,
      budgetWon: sumTo(months, "budgetWon", currentIndex),
      winRate: ytdQuoted > 0 ? ytdWon / ytdQuoted : null,
      wonCount,
      lostCount,
      countWinRate: wonCount + lostCount > 0 ? wonCount / (wonCount + lostCount) : null,
    },
    months,
    awaiting,
    awaitingValue: awaiting.reduce((s, q) => s + q.value, 0),
    recentWins: wins.slice(0, RECENT_WINS),
    people: summaries,
  };
}
