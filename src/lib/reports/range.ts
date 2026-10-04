// Date ranges for Reports (?range=...), NZ calendar dates. The sales year
// is April-March, like the Sales pages.
import { nzTodayDateString } from "@/lib/timesheets/formatNZ";

export const RANGES = [
  { key: "30d", label: "Last 30 days" },
  { key: "month", label: "This month" },
  { key: "last-month", label: "Last month" },
  { key: "quarter", label: "This quarter" },
  { key: "year", label: "This sales year (Apr–Mar)" },
  { key: "last-year", label: "Last sales year" },
  { key: "12m", label: "Last 12 months" },
  { key: "all", label: "All time" },
] as const;

export type RangeKey = (typeof RANGES)[number]["key"];

export type DateRange = {
  key: RangeKey;
  label: string;
  from: string | null; // YYYY-MM-DD inclusive; null = no start
  to: string; // YYYY-MM-DD inclusive
};

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
};

export function parseRange(raw: string | undefined, fallback: RangeKey = "12m"): DateRange {
  const key = (RANGES.some((r) => r.key === raw) ? raw : fallback) as RangeKey;
  const label = RANGES.find((r) => r.key === key)!.label;
  const today = nzTodayDateString();
  const [y, m, d] = today.split("-").map(Number);
  const fyStart = m >= 4 ? y : y - 1;

  switch (key) {
    case "30d":
      return { key, label, from: ymd(y, m, d - 29), to: today };
    case "month":
      return { key, label, from: ymd(y, m, 1), to: today };
    case "last-month":
      return { key, label, from: ymd(y, m - 1, 1), to: ymd(y, m, 0) };
    case "quarter": {
      const qStart = Math.floor((m - 1) / 3) * 3 + 1;
      return { key, label, from: ymd(y, qStart, 1), to: today };
    }
    case "year":
      return { key, label, from: ymd(fyStart, 4, 1), to: today };
    case "last-year":
      return { key, label, from: ymd(fyStart - 1, 4, 1), to: ymd(fyStart, 3, 31) };
    case "12m":
      return { key, label, from: ymd(y, m - 11, 1), to: today };
    case "all":
      return { key, label, from: null, to: today };
  }
}

// A date (YYYY-MM-DD or ISO timestamp, compared by its first 10 chars) in range.
export function inRange(date: string | null | undefined, range: DateRange): boolean {
  if (!date) return false;
  const day = date.slice(0, 10);
  return (!range.from || day >= range.from) && day <= range.to;
}

// Months the range covers, for monthly charts (at most the last `limit`).
export function rangeMonths(range: DateRange, earliest: string | null, limit = 24): { key: string; label: string }[] {
  const start = (range.from ?? earliest ?? range.to).slice(0, 7);
  const end = range.to.slice(0, 7);
  const months: { key: string; label: string }[] = [];
  let [y, m] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    const key = `${y}-${pad(m)}`;
    const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-NZ", {
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    });
    months.push({ key, label });
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return months.slice(-limit);
}

// Reports that can be shown by month, quarter or year (?by=...). Quarters
// and years are the sales year, April-March, like the Sales pages.
export const PERIODS = [
  { key: "month", label: "Month" },
  { key: "quarter", label: "Quarter" },
  { key: "year", label: "Year" },
] as const;

export type Period = (typeof PERIODS)[number]["key"];

export function parsePeriod(raw: string | undefined): Period {
  return PERIODS.some((p) => p.key === raw) ? (raw as Period) : "month";
}

// The period a month ("YYYY-MM") falls in.
export function periodOf(monthKey: string, period: Period, monthLabel?: string): { key: string; label: string } {
  const [y, m] = monthKey.split("-").map(Number);
  const fy = m >= 4 ? y : y - 1;
  const fyLabel = `${fy}/${pad((fy + 1) % 100)}`;
  if (period === "year") return { key: `FY${fy}`, label: fyLabel };
  if (period === "quarter") {
    const q = Math.floor(((m - 4 + 12) % 12) / 3) + 1;
    return { key: `${fy}-Q${q}`, label: `Q${q} ${fyLabel}` };
  }
  return { key: monthKey, label: monthLabel ?? monthKey };
}

// The periods the range covers, oldest first (months: at most the last 24).
export function rangePeriods(range: DateRange, earliest: string | null, period: Period): { key: string; label: string }[] {
  if (period === "month") return rangeMonths(range, earliest);
  const seen = new Map<string, string>();
  for (const mo of rangeMonths(range, earliest, Infinity)) {
    const p = periodOf(mo.key, period);
    if (!seen.has(p.key)) seen.set(p.key, p.label);
  }
  return [...seen].map(([key, label]) => ({ key, label }));
}
