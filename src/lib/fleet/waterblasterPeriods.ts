// Periods for the Waterblaster fuel page: which week / month / quarter /
// financial year a fill-up date (YYYY-MM-DD) falls in, and its label.
// Weeks run Monday to Sunday; quarters are calendar quarters; the year is
// the NZ financial year (1 April to 31 March). Dates are plain calendar
// dates, so the maths is done in UTC to avoid timezone drift.

export type PeriodKind = "week" | "month" | "quarter" | "year";

export const PERIOD_KINDS: { kind: PeriodKind; label: string }[] = [
  { kind: "week", label: "Week" },
  { kind: "month", label: "Month" },
  { kind: "quarter", label: "Quarter" },
  { kind: "year", label: "Financial year" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parts(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return { y, m, d };
}

function ymdOf(date: Date) {
  return date.toISOString().slice(0, 10);
}

// Today in New Zealand, as YYYY-MM-DD.
export function todayNZ() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" });
}

// The Monday on or before the date.
function weekStart(ymd: string) {
  const { y, m, d } = parts(ymd);
  const date = new Date(Date.UTC(y, m - 1, d));
  const back = (date.getUTCDay() + 6) % 7; // Mon = 0 ... Sun = 6
  date.setUTCDate(date.getUTCDate() - back);
  return ymdOf(date);
}

// Sortable key for the period the date falls in (later periods sort higher).
export function periodKey(ymd: string, kind: PeriodKind): string {
  const { y, m } = parts(ymd);
  switch (kind) {
    case "week":
      return weekStart(ymd);
    case "month":
      return `${y}-${String(m).padStart(2, "0")}`;
    case "quarter":
      return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
    case "year":
      // Financial year named by the year it ends in (FY2027 = Apr 2026 - Mar 2027).
      return `FY${m >= 4 ? y + 1 : y}`;
  }
}

export function periodLabel(key: string, kind: PeriodKind): string {
  switch (kind) {
    case "week": {
      const { y, m, d } = parts(key);
      const end = new Date(Date.UTC(y, m - 1, d + 6));
      const endM = end.getUTCMonth();
      const start = `${d} ${MONTHS[m - 1]}`;
      return `Week of ${start} – ${end.getUTCDate()} ${MONTHS[endM]} ${end.getUTCFullYear()}`;
    }
    case "month": {
      const { y, m } = parts(key + "-01");
      return `${MONTHS[m - 1]} ${y}`;
    }
    case "quarter": {
      const [y, q] = key.split("-Q").map(Number);
      return `${MONTHS[(q - 1) * 3]} – ${MONTHS[(q - 1) * 3 + 2]} ${y}`;
    }
    case "year": {
      const end = Number(key.slice(2));
      return `Apr ${end - 1} – Mar ${end}`;
    }
  }
}

export function currentPeriodName(kind: PeriodKind): string {
  return { week: "This week", month: "This month", quarter: "This quarter", year: "This financial year" }[kind];
}
