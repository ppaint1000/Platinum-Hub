// Everything the Clients dashboard shows. Win rate is won ÷ (won + lost) by
// number of quotes, the same as the win-rate report.

import type { SupabaseClient } from "@supabase/supabase-js";
import { nzDateKey, nzTodayDateString } from "@/lib/timesheets/formatNZ";
import { NO_LEAD_SOURCE } from "@/lib/jobs/leadSources";
import { inPeriod, isWon, periodStart, type JobStatus, type Period } from "./winRate";

// A client needs at least this many decided quotes to be ranked on win rate,
// so one lucky or unlucky quote doesn't top the list.
export const MIN_DECIDED = 3;

type JobRow = {
  client_id: string | null;
  status: JobStatus;
  quoted_sell_total: number | null;
  quoted_at: string | null;
  won_at: string | null;
  lost_at: string | null;
  lost_to: string | null;
  lead_source: string | null;
  client: { name: string } | { name: string }[] | null;
};

export type ClientStat = {
  id: string;
  name: string;
  quotedCount: number;
  quotedValue: number;
  wonCount: number;
  wonValue: number;
  lostCount: number;
  lostValue: number;
  openCount: number;
  openValue: number;
  winRate: number | null;
};

export type ClientsDashboardData = {
  period: Period;
  todayKey: string;
  totals: Omit<ClientStat, "id" | "name"> & { valueWinRate: number | null; avgDaysToDecide: number | null };
  months: { key: string; label: string; quoted: number; won: number; lost: number }[];
  topByWon: ClientStat[];
  bestWinRate: ClientStat[];
  worstWinRate: ClientStat[];
  lostTo: { name: string; count: number; value: number }[];
  openQuotes: ClientStat[];
  // Win rate for each lead source, most quotes first.
  bySource: { name: string; quotedCount: number; wonCount: number; lostCount: number; wonValue: number; winRate: number | null }[];
};

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const emptyStat = (id: string, name: string): ClientStat => ({
  id,
  name,
  quotedCount: 0,
  quotedValue: 0,
  wonCount: 0,
  wonValue: 0,
  lostCount: 0,
  lostValue: 0,
  openCount: 0,
  openValue: 0,
  winRate: null,
});

const rate = (won: number, lost: number) => (won + lost > 0 ? won / (won + lost) : null);
const clientName = (c: JobRow["client"]) => (Array.isArray(c) ? c[0]?.name : c?.name) ?? "Unknown client";
const monthOf = (d: string) => (d.length === 10 ? d.slice(0, 7) : nzDateKey(d).slice(0, 7));

export async function loadClientsDashboard(supabase: SupabaseClient, period: Period): Promise<ClientsDashboardData> {
  const todayKey = nzTodayDateString();
  const start = periodStart(period);

  const { data } = await supabase
    .from("jobs")
    .select("client_id, status, quoted_sell_total, quoted_at, won_at, lost_at, lost_to, lead_source, client:clients(name)")
    .not("client_id", "is", null)
    .returns<JobRow[]>();
  const jobs = (data ?? []).filter((j) => j.status !== "draft");

  const byClient = new Map<string, ClientStat>();
  const lostTo = new Map<string, { count: number; value: number }>();
  const decideDays: number[] = [];
  const bySource = new Map<string, { quotedCount: number; wonCount: number; lostCount: number; wonValue: number }>();

  for (const j of jobs.filter((job) => inPeriod(job, start))) {
    const id = j.client_id as string;
    const stat = byClient.get(id) ?? emptyStat(id, clientName(j.client));
    const value = Number(j.quoted_sell_total ?? 0);
    stat.quotedCount += 1;
    stat.quotedValue += value;

    const sourceName = j.lead_source?.trim() || NO_LEAD_SOURCE;
    const source = bySource.get(sourceName) ?? { quotedCount: 0, wonCount: 0, lostCount: 0, wonValue: 0 };
    source.quotedCount += 1;
    if (isWon(j.status)) {
      source.wonCount += 1;
      source.wonValue += value;
    } else if (j.status === "lost") source.lostCount += 1;
    bySource.set(sourceName, source);

    if (isWon(j.status)) {
      stat.wonCount += 1;
      stat.wonValue += value;
    } else if (j.status === "lost") {
      stat.lostCount += 1;
      stat.lostValue += value;
      const who = j.lost_to?.trim() || "Not recorded";
      const entry = lostTo.get(who) ?? { count: 0, value: 0 };
      entry.count += 1;
      entry.value += value;
      lostTo.set(who, entry);
    } else if (j.status === "quoted") {
      stat.openCount += 1;
      stat.openValue += value;
    }

    const decided = j.won_at ?? j.lost_at;
    if (decided && j.quoted_at) {
      const days = Math.round((Date.parse(decided) - Date.parse(j.quoted_at)) / 86_400_000);
      if (days >= 0) decideDays.push(days);
    }
    byClient.set(id, stat);
  }

  const clients = [...byClient.values()].map((c) => ({ ...c, winRate: rate(c.wonCount, c.lostCount) }));
  const sum = (key: keyof Omit<ClientStat, "id" | "name" | "winRate">) => clients.reduce((s, c) => s + c[key], 0);
  const totals = {
    quotedCount: sum("quotedCount"),
    quotedValue: sum("quotedValue"),
    wonCount: sum("wonCount"),
    wonValue: sum("wonValue"),
    lostCount: sum("lostCount"),
    lostValue: sum("lostValue"),
    openCount: sum("openCount"),
    openValue: sum("openValue"),
    winRate: rate(sum("wonCount"), sum("lostCount")),
    valueWinRate:
      sum("wonValue") + sum("lostValue") > 0 ? sum("wonValue") / (sum("wonValue") + sum("lostValue")) : null,
    avgDaysToDecide: decideDays.length ? Math.round(decideDays.reduce((s, d) => s + d, 0) / decideDays.length) : null,
  };

  // Month chart: always the last 12 months, whatever the period, so trends show.
  const [ty, tm] = todayKey.split("-").map(Number);
  const monthKeys = Array.from({ length: 12 }, (_, i) =>
    new Date(Date.UTC(ty, tm - 12 + i, 1)).toISOString().slice(0, 7)
  );
  const months = new Map(monthKeys.map((k) => [k, { quoted: 0, won: 0, lost: 0 }]));
  for (const j of jobs) {
    const value = Number(j.quoted_sell_total ?? 0);
    if (j.quoted_at) {
      const m = months.get(monthOf(j.quoted_at));
      if (m) m.quoted += value;
    }
    if (j.won_at && isWon(j.status)) {
      const m = months.get(monthOf(j.won_at));
      if (m) m.won += value;
    }
    if (j.lost_at && j.status === "lost") {
      const m = months.get(monthOf(j.lost_at));
      if (m) m.lost += value;
    }
  }

  const ranked = clients.filter((c) => c.wonCount + c.lostCount >= MIN_DECIDED);

  return {
    period,
    todayKey,
    totals,
    months: monthKeys.map((k) => ({
      key: k,
      label: MONTH_SHORT[Number(k.slice(5, 7)) - 1],
      ...(months.get(k) as { quoted: number; won: number; lost: number }),
    })),
    topByWon: clients
      .filter((c) => c.wonValue > 0)
      .sort((a, b) => b.wonValue - a.wonValue)
      .slice(0, 8),
    bestWinRate: [...ranked].sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0) || b.wonValue - a.wonValue).slice(0, 5),
    worstWinRate: [...ranked].sort((a, b) => (a.winRate ?? 0) - (b.winRate ?? 0) || b.lostValue - a.lostValue).slice(0, 5),
    lostTo: [...lostTo.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.count - a.count || b.value - a.value)
      .slice(0, 6),
    openQuotes: clients
      .filter((c) => c.openCount > 0)
      .sort((a, b) => b.openValue - a.openValue)
      .slice(0, 6),
    // "Not recorded" goes last, whatever its size.
    bySource: [...bySource.entries()]
      .map(([name, s]) => ({ name, ...s, winRate: rate(s.wonCount, s.lostCount) }))
      .sort(
        (a, b) =>
          Number(a.name === NO_LEAD_SOURCE) - Number(b.name === NO_LEAD_SOURCE) || b.quotedCount - a.quotedCount
      ),
  };
}
