// Everything the Absences dashboard shows. "Not rostered / public holiday"
// records are kept (and listed) but never counted as absences. Deleted
// absences (dismissed_at set) are hidden everywhere.

import type { SupabaseClient } from "@supabase/supabase-js";
import { mondayOf, nzDateKey, nzTodayDateString } from "@/lib/timesheets/formatNZ";
import { nzPublicHolidays, type Holiday } from "./holidays";
import { COUNTED_TYPES, WEEKDAYS, weekdayIndex, type AbsenceType } from "./types";

// In the order the period buttons show.
export const RANGE_LABEL = {
  week: "This week",
  month: "This month",
  quarter: "This quarter",
  year: "This year",
  "12m": "Last 12 months",
  all: "All time",
} as const;
export type AbsenceRange = keyof typeof RANGE_LABEL;
export const DEFAULT_RANGE: AbsenceRange = "12m";

export function parseRange(value: string | undefined): AbsenceRange {
  return value && value in RANGE_LABEL ? (value as AbsenceRange) : DEFAULT_RANGE;
}

// The Absences page address for a period (the default needs no ?range).
export function absencesHref(range: AbsenceRange, extra = ""): string {
  const params = [range === DEFAULT_RANGE ? "" : `range=${range}`, extra].filter(Boolean).join("&");
  return params ? `/absences?${params}` : "/absences";
}

type Counts = { sick: number; authorised_leave: number; unauthorised_leave: number; total: number };
const emptyCounts = (): Counts => ({ sick: 0, authorised_leave: 0, unauthorised_leave: 0, total: 0 });

export type AbsenceRecord = {
  id: string;
  userId: string;
  name: string;
  date: string;
  type: AbsenceType | null;
  reason: string | null;
  flaggedByCheck: boolean;
};

export type PersonAbsences = Counts & { id: string; name: string; commonDay: string | null };

export type AbsencesData = {
  todayKey: string;
  range: AbsenceRange;
  pending: AbsenceRecord[];
  totals: Counts;
  byWeekday: (Counts & { day: string })[];
  commonDay: string | null;
  byPerson: PersonAbsences[];
  byMonth: (Counts & { key: string; label: string })[];
  recent: AbsenceRecord[];
  staff: { id: string; name: string }[];
  closedDays: { day: string; note: string | null }[];
  upcomingHolidays: Holiday[];
};

type Row = {
  id: string;
  user_id: string;
  absence_date: string;
  absence_type: AbsenceType | null;
  reason: string | null;
  flagged_by_check: boolean;
};

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function rangeStart(range: AbsenceRange, todayKey: string): string | null {
  const [y, m] = todayKey.split("-").map(Number);
  const firstOfMonth = (monthIndex: number) => new Date(Date.UTC(y, monthIndex, 1)).toISOString().slice(0, 10);
  switch (range) {
    case "all":
      return null;
    case "week":
      return mondayOf(todayKey);
    case "month":
      return firstOfMonth(m - 1);
    case "quarter":
      return firstOfMonth(Math.floor((m - 1) / 3) * 3);
    case "year":
      return `${y}-01-01`;
    case "12m":
      // The 1st of the month 11 months back, so the month chart shows 12 whole months.
      return firstOfMonth(m - 12);
  }
}

function add(counts: Counts, type: AbsenceType) {
  if (!COUNTED_TYPES.includes(type)) return;
  counts[type as keyof Omit<Counts, "total">] += 1;
  counts.total += 1;
}

function mostCommon(byDay: number[]): string | null {
  const max = Math.max(...byDay);
  if (max === 0) return null;
  const days = byDay.flatMap((n, i) => (n === max ? [WEEKDAYS[i]] : []));
  return days.join(" & ");
}

export async function loadAbsences(supabase: SupabaseClient, range: AbsenceRange): Promise<AbsencesData> {
  const todayKey = nzTodayDateString();
  const from = rangeStart(range, todayKey);

  let rowsQuery = supabase
    .from("absences")
    .select("id, user_id, absence_date, absence_type, reason, flagged_by_check")
    .is("dismissed_at", null)
    .order("absence_date", { ascending: false });
  if (from) rowsQuery = rowsQuery.gte("absence_date", from);

  const [{ data: rows }, { data: pendingRows }, { data: access }, { data: closed }] = await Promise.all([
    rowsQuery.returns<Row[]>(),
    // Anything still waiting on a reason, however old.
    supabase
      .from("absences")
      .select("id, user_id, absence_date, absence_type, reason, flagged_by_check")
      .is("absence_type", null)
      .is("dismissed_at", null)
      .order("absence_date", { ascending: false })
      .returns<Row[]>(),
    supabase.from("user_app_access").select("user_id").eq("timesheets", true),
    supabase
      .from("closed_days")
      .select("day, note")
      .gte("day", todayKey)
      .order("day")
      .returns<{ day: string; note: string | null }[]>(),
  ]);

  const peopleIds = new Set<string>([
    ...(rows ?? []).map((r) => r.user_id),
    ...(pendingRows ?? []).map((r) => r.user_id),
    ...(access ?? []).map((a) => a.user_id as string),
  ]);
  const { data: people } = peopleIds.size
    ? await supabase
        .from("profiles")
        .select("id, full_name, role, is_active")
        .in("id", [...peopleIds])
        .order("full_name")
        .returns<{ id: string; full_name: string; role: string; is_active: boolean | null }[]>()
    : { data: [] };
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const timesheetIds = new Set((access ?? []).map((a) => a.user_id as string));

  const toRecord = (r: Row): AbsenceRecord => ({
    id: r.id,
    userId: r.user_id,
    name: nameOf.get(r.user_id) ?? "Unknown",
    date: r.absence_date,
    type: r.absence_type,
    reason: r.reason,
    flaggedByCheck: r.flagged_by_check,
  });

  const totals = emptyCounts();
  const weekday = WEEKDAYS.map(() => emptyCounts());
  const personCounts = new Map<string, { counts: Counts; days: number[] }>();

  // Month chart: up to the last 12 months, starting no earlier than the range.
  const monthKeys: string[] = [];
  const [ty, tm] = todayKey.split("-").map(Number);
  for (let i = 11; i >= 0; i--) {
    const k = new Date(Date.UTC(ty, tm - 1 - i, 1)).toISOString().slice(0, 7);
    if (!from || k >= from.slice(0, 7)) monthKeys.push(k);
  }
  const byMonth = new Map(monthKeys.map((k) => [k, emptyCounts()]));

  for (const r of rows ?? []) {
    if (!r.absence_type) continue;
    add(totals, r.absence_type);
    const wd = weekdayIndex(r.absence_date);
    if (wd !== null) add(weekday[wd], r.absence_type);
    const month = byMonth.get(r.absence_date.slice(0, 7));
    if (month) add(month, r.absence_type);

    const person = personCounts.get(r.user_id) ?? { counts: emptyCounts(), days: [0, 0, 0, 0, 0] };
    add(person.counts, r.absence_type);
    if (wd !== null && COUNTED_TYPES.includes(r.absence_type)) person.days[wd] += 1;
    personCounts.set(r.user_id, person);
  }

  const byPerson: PersonAbsences[] = [...personCounts.entries()]
    .filter(([, p]) => p.counts.total > 0)
    .map(([id, p]) => ({ id, name: nameOf.get(id) ?? "Unknown", ...p.counts, commonDay: mostCommon(p.days) }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  const staff = (people ?? [])
    .filter((p) => timesheetIds.has(p.id) && p.is_active !== false && p.role !== "admin")
    .map((p) => ({ id: p.id, name: p.full_name }));

  const thisYear = Number(todayKey.slice(0, 4));
  const upcomingHolidays = [...nzPublicHolidays(thisYear), ...nzPublicHolidays(thisYear + 1)]
    .filter((h) => h.date >= todayKey)
    .slice(0, 5);

  return {
    todayKey,
    range,
    pending: (pendingRows ?? []).map(toRecord),
    totals,
    byWeekday: weekday.map((c, i) => ({ ...c, day: WEEKDAYS[i] })),
    commonDay: mostCommon(weekday.map((c) => c.total)),
    byPerson,
    byMonth: monthKeys.map((k) => ({
      ...(byMonth.get(k) as Counts),
      key: k,
      label: MONTH_SHORT[Number(k.slice(5, 7)) - 1],
    })),
    recent: (rows ?? []).filter((r) => r.absence_type).slice(0, 25).map(toRecord),
    staff,
    closedDays: closed ?? [],
    upcomingHolidays,
  };
}

// For the record form: when (if at all) they clocked in on that day.
export async function firstClockIn(supabase: SupabaseClient, userId: string, dateKey: string): Promise<string | null> {
  const start = new Date(`${dateKey}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 1);
  const end = new Date(`${dateKey}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 2);
  const { data } = await supabase
    .from("timesheet_entries")
    .select("clock_in_at")
    .eq("user_id", userId)
    .gte("clock_in_at", start.toISOString())
    .lt("clock_in_at", end.toISOString())
    .order("clock_in_at")
    .returns<{ clock_in_at: string }[]>();
  return (data ?? []).find((e) => nzDateKey(e.clock_in_at) === dateKey)?.clock_in_at ?? null;
}
