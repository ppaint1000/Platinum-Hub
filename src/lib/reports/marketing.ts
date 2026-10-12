// Marketing ROI: for each lead source, quotes, wins and dollars won (by
// date quoted, like Lead Conversions) against what was spent on it
// (marketing_spend, entered by month). Plus enquiries (Requests) by where
// they came from.
import type { SupabaseClient } from "@supabase/supabase-js";
import { isWonStatus } from "@/lib/jobs/status";
import { LEAD_SOURCES, NO_LEAD_SOURCE } from "@/lib/jobs/leadSources";
import type { ReportJob } from "./load";
import { inRange, type DateRange } from "./range";

export type SpendRow = { month: string; source: string; amount: number };

export type SourceRoi = {
  source: string;
  quotes: number;
  won: number;
  lost: number;
  winRate: number | null;
  quoted: number;
  sold: number;
  spend: number;
  costPerQuote: number | null;
  costPerWin: number | null;
  // Dollars won for each dollar spent.
  returnOnSpend: number | null;
};

const isLost = (j: ReportJob) => j.status === "lost";
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// A spend month (the 1st) counts if any of it falls in the range.
export function spendInRange(month: string, range: DateRange) {
  const end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  return end >= (range.from ?? "0000-00-00") && month <= range.to;
}

export async function loadSpend(supabase: SupabaseClient): Promise<SpendRow[]> {
  const { data } = await supabase.from("marketing_spend").select("month, source, amount").order("month");
  return (data ?? []).map((r) => ({ month: r.month as string, source: r.source as string, amount: Number(r.amount) }));
}

export function marketingRoi(jobs: ReportJob[], spend: SpendRow[], range: DateRange) {
  const quotes = jobs.filter((j) => j.status !== "draft" && inRange(j.quoted_at, range));
  const spendBySource = new Map<string, number>();
  for (const s of spend.filter((s) => spendInRange(s.month, range))) {
    spendBySource.set(s.source, (spendBySource.get(s.source) ?? 0) + s.amount);
  }

  const sources = [...new Set([...LEAD_SOURCES, ...quotes.map((j) => j.lead_source ?? NO_LEAD_SOURCE), ...spendBySource.keys()])];
  const rows: SourceRoi[] = sources
    .map((source) => {
      const js = quotes.filter((j) => (j.lead_source ?? NO_LEAD_SOURCE) === source);
      const won = js.filter((j) => isWonStatus(j.status));
      const lost = js.filter(isLost);
      const sold = sum(won.map((j) => j.value));
      const spent = spendBySource.get(source) ?? 0;
      return {
        source,
        quotes: js.length,
        won: won.length,
        lost: lost.length,
        winRate: won.length + lost.length ? won.length / (won.length + lost.length) : null,
        quoted: sum(js.map((j) => j.value)),
        sold,
        spend: spent,
        costPerQuote: spent && js.length ? spent / js.length : null,
        costPerWin: spent && won.length ? spent / won.length : null,
        returnOnSpend: spent ? sold / spent : null,
      };
    })
    .filter((r) => r.quotes > 0 || r.spend > 0)
    .sort((a, b) => b.sold - a.sold || b.quotes - a.quotes);

  const wonAll = quotes.filter((j) => isWonStatus(j.status));
  const totalSpend = sum(rows.map((r) => r.spend));
  const totalSold = sum(wonAll.map((j) => j.value));
  return {
    rows,
    totals: {
      quotes: quotes.length,
      won: wonAll.length,
      sold: totalSold,
      winRate: wonAll.length + quotes.filter(isLost).length ? wonAll.length / (wonAll.length + quotes.filter(isLost).length) : null,
      spend: totalSpend,
      costPerWin: totalSpend && wonAll.length ? totalSpend / wonAll.length : null,
      returnOnSpend: totalSpend ? totalSold / totalSpend : null,
    },
  };
}

export const REQUEST_SOURCE_LABEL: Record<string, string> = {
  website: "Website form",
  phone: "Phone",
  email: "Email",
  referral: "Referral",
  other: "Other",
};
