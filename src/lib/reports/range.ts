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

// Months the range covers, for monthly charts (at most the last 24).
export function rangeMonths(range: DateRange, earliest: string | null): { key: string; label: string }[] {
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
  return months.slice(-24);
}
