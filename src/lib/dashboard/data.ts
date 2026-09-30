// Everything the admin Dashboard shows, loaded in one pass on the server.
//
// Sources: jobs + job_totals (the same totals the Jobs page uses, so cost to
// date is every recorded cost - supplier invoices, Resene, manual lines -
// plus timesheet labour), timesheet_entries for hours, and vehicles +
// service_records for the fleet. Dates are NZ calendar dates throughout.

import type { SupabaseClient } from "@supabase/supabase-js";
import { SERVICE_SOON_KM, nextServiceFor } from "@/lib/fleet/nextService";
import {
  addDays,
  mondayOf,
  nzDateKey,
  nzDayStartUtcIso,
  nzTodayDateString,
} from "@/lib/timesheets/formatNZ";

export const MARGIN_TARGET = 0.25;
export const STANDARD_WEEK_HOURS = 40;
// Mon-Fri 7:30am-4pm with a 30 minute break.
const STANDARD_DAY_HOURS = 8;
const DAY_START_MIN = 7 * 60 + 30;
const DAY_END_MIN = 16 * 60;
const WOF_URGENT_DAYS = 14;
const DUE_SOON_DAYS = 30;

type Relation<T> = T | T[] | null;
const one = <T,>(r: Relation<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r);

type JobRow = {
  id: string;
  job_number: string | null;
  name: string;
  description: string | null;
  status: string;
  quoted_sell_total: number | null;
  quoted_hours: number | null;
  quoted_at: string | null;
  won_at: string | null;
  client: Relation<{ name: string }>;
};
type TotalsRow = { job_id: string; budgeted_total: number; actual_total: number; hours_actual: number };
type EntryRow = {
  user_id: string;
  site_id: string | null;
  clock_in_at: string;
  clock_out_at: string;
  break_minutes: number | null;
};
type SiteRow = { id: string; name: string; job_id: string | null };
type PersonRow = { id: string; full_name: string; role: string; is_active: boolean | null };
type VehicleRow = {
  id: string;
  plate: string;
  make: string;
  model: string;
  wof_expiry: string | null;
  current_odometer_km: number | null;
  assigned_driver_id: string | null;
  next_service_km: number | null;
  next_service_date: string | null;
};
type ServiceRow = {
  vehicle_id: string;
  date: string;
  created_at: string;
  odometer_km: number | null;
  next_due_date: string | null;
  next_due_odometer_km: number | null;
};

export type Level = "alert" | "soon" | "ok";

export type DashboardJob = {
  id: string;
  jobNumber: string;
  client: string;
  scope: string;
  status: string;
  quoted: number;
  costToDate: number;
  forecastProfit: number | null;
  margin: number | null;
  hoursUsed: number;
  hoursBudget: number | null;
  overHours: boolean;
};

export type DashboardPainter = {
  id: string;
  name: string;
  hours: number;
  mainJob: string | null;
  avg4: number;
};

export type DashboardVehicle = {
  id: string;
  name: string;
  plate: string;
  driver: string | null;
  wofExpiry: string | null;
  wofDays: number | null;
  wofLevel: Level;
  serviceDate: string | null;
  serviceDays: number | null;
  serviceKm: number | null;
  serviceKmLeft: number | null;
  serviceLevel: Level;
  labels: { text: string; level: Level }[];
};

export type DashboardData = {
  todayKey: string;
  monthLabel: string;
  won: { value: number; count: number };
  quoted: { value: number; winRate: number | null };
  forecastMargin: number | null;
  hours: { logged: number; rosteredWeek: number; rosteredToDate: number };
  jobs: DashboardJob[];
  sales: {
    months: { key: string; label: string; quoted: number; won: number }[];
    won6: number;
    winRate6: number | null;
    awaitingCount: number;
    awaitingValue: number;
  };
  painters: DashboardPainter[];
  weekTotal: number;
  overtime: number;
  vehicles: DashboardVehicle[];
};

// YYYY-MM key for n months before the given one.
function monthKeyMinus(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 - n, 1));
  return d.toISOString().slice(0, 7);
}

function monthName(key: string, style: "short" | "long"): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-NZ", { month: style, timeZone: "UTC" });
}

function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86400000);
}

function shiftHours(e: EntryRow): number {
  const gross = (Date.parse(e.clock_out_at) - Date.parse(e.clock_in_at)) / 3600000;
  return Math.max(0, gross - (e.break_minutes ?? 0) / 60);
}

// Standard hours one person was rostered for, from Monday up to now.
function rosteredToDatePerPerson(mondayKey: string, todayKey: string): number {
  const dayIndex = daysBetween(mondayKey, todayKey); // 0 = Monday
  const fullDays = Math.min(dayIndex, 5);
  let hours = fullDays * STANDARD_DAY_HOURS;
  if (dayIndex < 5) {
    const nowMin = Number(
      new Intl.DateTimeFormat("en-GB", { timeZone: "Pacific/Auckland", hour: "2-digit", hourCycle: "h23" }).format(new Date())
    ) * 60 +
      Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Pacific/Auckland", minute: "2-digit" }).format(new Date()));
    const worked = Math.min(Math.max(nowMin - DAY_START_MIN, 0), DAY_END_MIN - DAY_START_MIN);
    hours += (worked / (DAY_END_MIN - DAY_START_MIN)) * STANDARD_DAY_HOURS;
  }
  return hours;
}

export async function loadDashboard(supabase: SupabaseClient): Promise<DashboardData> {
  const todayKey = nzTodayDateString();
  const mondayKey = mondayOf(todayKey);
  const fourWeeksAgo = addDays(mondayKey, -28);
  const monthKey = todayKey.slice(0, 7);
  const monthKeys = Array.from({ length: 6 }, (_, i) => monthKeyMinus(monthKey, 5 - i));

  const [jobsRes, totalsRes, entriesRes, sitesRes, peopleRes, vehiclesRes, servicesRes, fuelRes] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, job_number, name, description, status, quoted_sell_total, quoted_hours, quoted_at, won_at, client:clients(name)")
      .returns<JobRow[]>(),
    supabase.from("job_totals").select("job_id, budgeted_total, actual_total, hours_actual").returns<TotalsRow[]>(),
    supabase
      .from("timesheet_entries")
      .select("user_id, site_id, clock_in_at, clock_out_at, break_minutes")
      .gte("clock_in_at", nzDayStartUtcIso(fourWeeksAgo))
      .not("clock_out_at", "is", null)
      .returns<EntryRow[]>(),
    supabase.from("sites").select("id, name, job_id").returns<SiteRow[]>(),
    supabase.from("profiles").select("id, full_name, role, is_active").returns<PersonRow[]>(),
    supabase
      .from("vehicles")
      .select("id, plate, make, model, wof_expiry, current_odometer_km, assigned_driver_id, next_service_km, next_service_date")
      .order("plate")
      .returns<VehicleRow[]>(),
    supabase
      .from("service_records")
      .select("vehicle_id, date, created_at, odometer_km, next_due_date, next_due_odometer_km")
      .returns<ServiceRow[]>(),
    // Latest odometer readings - receipts keep them more up to date than the vehicle's own.
    supabase
      .from("fuel_entries")
      .select("vehicle_id, odometer_km")
      .not("vehicle_id", "is", null)
      .not("odometer_km", "is", null)
      .returns<{ vehicle_id: string; odometer_km: number }[]>(),
  ]);

  for (const res of [jobsRes, totalsRes, entriesRes, sitesRes, peopleRes, vehiclesRes, servicesRes, fuelRes]) {
    if (res.error) throw new Error(`Dashboard query failed: ${res.error.message}`);
  }

  const jobs = jobsRes.data ?? [];
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const totalsByJob = new Map((totalsRes.data ?? []).map((t) => [t.job_id, t]));

  // ── Sales ────────────────────────────────────────────────────────────
  const quotedByMonth = new Map<string, number>(monthKeys.map((k) => [k, 0]));
  const wonByMonth = new Map<string, number>(monthKeys.map((k) => [k, 0]));
  let wonCountThisMonth = 0;
  let awaitingCount = 0;
  let awaitingValue = 0;

  for (const job of jobs) {
    const amount = Number(job.quoted_sell_total ?? 0);
    if (job.quoted_at) {
      const k = job.quoted_at.slice(0, 7);
      if (quotedByMonth.has(k)) quotedByMonth.set(k, quotedByMonth.get(k)! + amount);
    }
    if (job.won_at) {
      const k = nzDateKey(job.won_at).slice(0, 7);
      if (wonByMonth.has(k)) wonByMonth.set(k, wonByMonth.get(k)! + amount);
      if (k === monthKey) wonCountThisMonth++;
    }
    if (job.status === "quoted") {
      awaitingCount++;
      awaitingValue += amount;
    }
  }

  const months = monthKeys.map((k) => ({
    key: k,
    label: monthName(k, "short"),
    quoted: quotedByMonth.get(k)!,
    won: wonByMonth.get(k)!,
  }));
  const quoted6 = months.reduce((s, m) => s + m.quoted, 0);
  const won6 = months.reduce((s, m) => s + m.won, 0);
  const thisMonth = months[months.length - 1];

  // ── Active jobs ──────────────────────────────────────────────────────
  // Forecast cost is the budget, or what's already been spent if that's
  // more. With no budget yet, cost to date is the best figure there is.
  let marginQuoted = 0;
  let marginProfit = 0;
  const activeJobs: DashboardJob[] = jobs
    .filter((j) => j.status === "won" || j.status === "in_progress")
    .map((j) => {
      const t = totalsByJob.get(j.id);
      const quoted = Number(j.quoted_sell_total ?? 0);
      const budgeted = Number(t?.budgeted_total ?? 0);
      const costToDate = Number(t?.actual_total ?? 0);
      const hoursUsed = Number(t?.hours_actual ?? 0);
      const hoursBudget = j.quoted_hours ? Number(j.quoted_hours) : null;
      const forecastCost = Math.max(budgeted, costToDate);
      const hasForecast = quoted > 0 && forecastCost > 0;
      const forecastProfit = hasForecast ? quoted - forecastCost : null;
      if (hasForecast) {
        marginQuoted += quoted;
        marginProfit += forecastProfit!;
      }
      return {
        id: j.id,
        jobNumber: j.job_number ?? "—",
        client: one(j.client)?.name ?? "No client",
        scope: j.description?.trim() || j.name,
        status: j.status,
        quoted,
        costToDate,
        forecastProfit,
        margin: hasForecast ? forecastProfit! / quoted : null,
        hoursUsed,
        hoursBudget,
        overHours: hoursBudget !== null && hoursUsed > hoursBudget,
      };
    })
    .sort((a, b) => Number(b.overHours) - Number(a.overHours) || (a.margin ?? 1) - (b.margin ?? 1));

  // ── Painter hours ────────────────────────────────────────────────────
  const siteById = new Map((sitesRes.data ?? []).map((s) => [s.id, s]));
  const weekStartMs = Date.parse(nzDayStartUtcIso(mondayKey));
  const weekHours = new Map<string, number>();
  const priorHours = new Map<string, number>();
  const siteHours = new Map<string, Map<string, number>>();

  for (const e of entriesRes.data ?? []) {
    const h = shiftHours(e);
    if (Date.parse(e.clock_in_at) >= weekStartMs) {
      weekHours.set(e.user_id, (weekHours.get(e.user_id) ?? 0) + h);
      if (e.site_id) {
        const bySite = siteHours.get(e.user_id) ?? new Map<string, number>();
        bySite.set(e.site_id, (bySite.get(e.site_id) ?? 0) + h);
        siteHours.set(e.user_id, bySite);
      }
    } else {
      priorHours.set(e.user_id, (priorHours.get(e.user_id) ?? 0) + h);
    }
  }

  const people = peopleRes.data ?? [];
  const onRoster = people.filter((p) => p.is_active !== false && (p.role === "painter" || p.role === "supervisor"));
  const listed = new Set([...onRoster.map((p) => p.id), ...weekHours.keys()]);

  const painters: DashboardPainter[] = people
    .filter((p) => listed.has(p.id))
    .map((p) => {
      let mainJob: string | null = null;
      let best = 0;
      for (const [siteId, h] of siteHours.get(p.id) ?? []) {
        if (h > best) {
          best = h;
          const site = siteById.get(siteId);
          const job = site?.job_id ? jobById.get(site.job_id) : undefined;
          mainJob = job?.job_number ?? site?.name ?? null;
        }
      }
      return {
        id: p.id,
        name: p.full_name,
        hours: weekHours.get(p.id) ?? 0,
        mainJob,
        avg4: (priorHours.get(p.id) ?? 0) / 4,
      };
    })
    .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name));

  const weekTotal = painters.reduce((s, p) => s + p.hours, 0);
  const overtime = painters.reduce((s, p) => s + Math.max(0, p.hours - STANDARD_WEEK_HOURS), 0);

  // ── Fleet ────────────────────────────────────────────────────────────
  const latestService = new Map<string, ServiceRow>();
  for (const s of servicesRes.data ?? []) {
    const prev = latestService.get(s.vehicle_id);
    if (!prev || s.date > prev.date || (s.date === prev.date && s.created_at > prev.created_at)) {
      latestService.set(s.vehicle_id, s);
    }
  }

  const nameById = new Map(people.map((p) => [p.id, p.full_name]));
  const vehicles: DashboardVehicle[] = (vehiclesRes.data ?? []).map((v) => {
    const wofDays = v.wof_expiry ? daysBetween(todayKey, v.wof_expiry) : null;
    const wofLevel: Level =
      wofDays === null ? "ok" : wofDays <= WOF_URGENT_DAYS ? "alert" : wofDays <= DUE_SOON_DAYS ? "soon" : "ok";

    const s = latestService.get(v.id);
    // With no service logged yet, the vehicle's own next service date/km.
    const serviceDate = s ? s.next_due_date : v.next_service_date;
    const serviceDays = serviceDate ? daysBetween(todayKey, serviceDate) : null;
    // Every 10,000 km from the last service (lib/fleet/nextService.ts).
    const next = nextServiceFor(v, servicesRes.data ?? [], fuelRes.data ?? []);
    const serviceKm = next.dueAtKm;
    const serviceKmLeft = next.kmLeft;
    const serviceOverdue = (serviceDays !== null && serviceDays < 0) || (serviceKmLeft !== null && serviceKmLeft < 0);
    const serviceSoon =
      (serviceDays !== null && serviceDays <= DUE_SOON_DAYS) ||
      (serviceKmLeft !== null && serviceKmLeft <= SERVICE_SOON_KM);
    const serviceLevel: Level = serviceOverdue ? "alert" : serviceSoon ? "soon" : "ok";

    const labels: { text: string; level: Level }[] = [];
    if (wofLevel === "alert") labels.push({ text: wofDays! < 0 ? "WOF expired" : "WOF due", level: "alert" });
    if (serviceLevel === "alert") labels.push({ text: "Service overdue", level: "alert" });
    if (labels.length === 0) {
      labels.push(
        wofLevel === "soon" || serviceLevel === "soon" ? { text: "Due soon", level: "soon" } : { text: "OK", level: "ok" }
      );
    }

    return {
      id: v.id,
      name: `${v.make} ${v.model}`,
      plate: v.plate,
      driver: v.assigned_driver_id ? nameById.get(v.assigned_driver_id) ?? null : null,
      wofExpiry: v.wof_expiry,
      wofDays,
      wofLevel,
      serviceDate,
      serviceDays,
      serviceKm,
      serviceKmLeft,
      serviceLevel,
      labels,
    };
  });
  const rank = { alert: 0, soon: 1, ok: 2 } as const;
  vehicles.sort((a, b) => rank[a.labels[0].level] - rank[b.labels[0].level]);

  return {
    todayKey,
    monthLabel: monthName(monthKey, "long"),
    won: { value: thisMonth.won, count: wonCountThisMonth },
    quoted: { value: thisMonth.quoted, winRate: thisMonth.quoted > 0 ? thisMonth.won / thisMonth.quoted : null },
    forecastMargin: marginQuoted > 0 ? marginProfit / marginQuoted : null,
    hours: {
      logged: weekTotal,
      rosteredWeek: onRoster.length * STANDARD_WEEK_HOURS,
      rosteredToDate: onRoster.length * rosteredToDatePerPerson(mondayKey, todayKey),
    },
    jobs: activeJobs,
    sales: {
      months,
      won6,
      winRate6: quoted6 > 0 ? won6 / quoted6 : null,
      awaitingCount,
      awaitingValue,
    },
    painters,
    weekTotal,
    overtime,
    vehicles,
  };
}
