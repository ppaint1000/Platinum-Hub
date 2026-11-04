import { nzTodayDateString } from "@/lib/timesheets/formatNZ";
export function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-NZ", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function fmtDateTime(d: string | null | undefined) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleString("en-NZ", {
    timeZone: "Pacific/Auckland",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtMoney(n: number | null | undefined) {
  const v = Number(n) || 0;
  return "$" + v.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtKm(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString("en-NZ") + " km";
}

export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const today = Date.parse(nzTodayDateString() + "T00:00:00Z");
  const d = Date.parse(dateStr.slice(0, 10) + "T00:00:00Z");
  return Math.round((d - today) / 86400000);
}

export type ExpiryStatus = "none" | "ok" | "warn" | "critical";

export function expiryStatus(dateStr: string | null | undefined): ExpiryStatus {
  const days = daysUntil(dateStr);
  if (days === null) return "none";
  if (days < 0) return "critical";
  if (days <= 30) return "warn";
  return "ok";
}
