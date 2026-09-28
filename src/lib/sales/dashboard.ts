// Everything one salesperson's dashboard shows, for the current sales year
// (Apr-Mar). Built from the same sources as the Sales page tables - jobs
// credited to them (lead_by_user_id) and their sales_targets budgets - so
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
  client_id: string | null;
};

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
  value: number;
  date: string; // YYYY-MM-DD: quoted date for awaiting quotes, won date for wins
  days: number; // days since that date
};

export type SalesDashboardData = {
  todayKey: string;
  yearLabel: string;
  monthLabel: string;
  thisMonth: { quoted: number; budgetQuoted: number; won: number; budgetWon: number };
  yearToDate: { quoted: number; won: number; budgetWon: number; winRate: number | null };
  months: SalesMonth[];
  awaiting: SalesQuote[];
  awaitingValue: number;
  recentWins: SalesQuote[];
};

function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86_400_000);
}

export async function loadSalesDashboard(supabase: SupabaseClient, userId: string): Promise<SalesDashboardData> {
  const todayKey = nzTodayDateString();
  const [ty, tm] = todayKey.split("-").map(Number);
  const startYear = fiscalYearStart(new Date(Date.UTC(ty, tm - 1, 15)));
  const fiscal = fiscalMonths(startYear);
  const monthIndex = new Map(fiscal.map((m, i) => [`${m.year}-${m.month}`, i]));
  const currentIndex = monthIndex.get(`${ty}-${tm}`) ?? 0;

  // Read with the viewer's own session, so RLS decides whose jobs and
  // budgets they can see (their own, or everyone's for admins and sales
  // authority), exactly as on the Sales page.
  const [{ data: jobRows }, { data: targets }] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, job_number, name, status, quoted_sell_total, quoted_at, won_at, client_id")
      .eq("lead_by_user_id", userId)
      .returns<JobRow[]>(),
    supabase
      .from("sales_targets")
      .select("year, month, budget_quoted, budget_won")
      .eq("user_id", userId)
      .in("year", [startYear, startYear + 1])
      .returns<{ year: number; month: number; budget_quoted: number; budget_won: number }[]>(),
  ]);
  const jobs = jobRows ?? [];

  // Client names only. Sales staff have no RLS access to clients, so these
  // are read with the service role - limited to the clients on their own
  // jobs, and nothing but the name.
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

  const months: SalesMonth[] = fiscal.map((m) => ({
    key: `${m.year}-${String(m.month).padStart(2, "0")}`,
    label: MONTH_SHORT[m.month - 1],
    quoted: 0,
    won: 0,
    budgetQuoted: 0,
    budgetWon: 0,
  }));

  for (const t of targets ?? []) {
    const i = monthIndex.get(`${t.year}-${t.month}`);
    if (i === undefined) continue;
    months[i].budgetQuoted = Number(t.budget_quoted);
    months[i].budgetWon = Number(t.budget_won);
  }

  const awaiting: SalesQuote[] = [];
  const wins: SalesQuote[] = [];

  for (const job of jobs) {
    const value = Number(job.quoted_sell_total ?? 0);
    const base = {
      id: job.id,
      name: job.job_number ? `${job.job_number} · ${job.name}` : job.name,
      client: job.client_id ? clientNames.get(job.client_id) ?? null : null,
      value,
    };

    if (job.quoted_at) {
      const [y, m] = job.quoted_at.split("-").map(Number);
      const i = monthIndex.get(`${y}-${m}`);
      if (i !== undefined) months[i].quoted += value;
    }
    if (job.won_at) {
      const wonKey = nzDateKey(job.won_at);
      const [y, m] = wonKey.split("-").map(Number);
      const i = monthIndex.get(`${y}-${m}`);
      if (i !== undefined) months[i].won += value;
      wins.push({ ...base, date: wonKey, days: daysBetween(wonKey, todayKey) });
    }
    if (job.status === "quoted") {
      const quotedKey = job.quoted_at ?? todayKey;
      awaiting.push({ ...base, date: quotedKey, days: daysBetween(quotedKey, todayKey) });
    }
  }

  // Oldest first - the ones most in need of a follow-up call.
  awaiting.sort((a, b) => a.date.localeCompare(b.date));
  wins.sort((a, b) => b.date.localeCompare(a.date));

  const upTo = months.slice(0, currentIndex + 1);
  const ytdQuoted = upTo.reduce((s, m) => s + m.quoted, 0);
  const ytdWon = upTo.reduce((s, m) => s + m.won, 0);
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
      budgetWon: upTo.reduce((s, m) => s + m.budgetWon, 0),
      winRate: ytdQuoted > 0 ? ytdWon / ytdQuoted : null,
    },
    months,
    awaiting,
    awaitingValue: awaiting.reduce((s, q) => s + q.value, 0),
    recentWins: wins.slice(0, RECENT_WINS),
  };
}
