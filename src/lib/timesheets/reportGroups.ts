import { createClient } from '@/lib/supabase/server'
import { getReportEntries, type ReportEntry, type ReportFilters } from '@/lib/timesheets/reports'
import { applyPayRounding } from '@/lib/timesheets/payroll'
import { formatDateKeyShort } from '@/lib/timesheets/formatNZ'

type SupabaseClientLike = Awaited<ReturnType<typeof createClient>>

export type GroupTotals = {
  grossHours: number
  breakMinutes: number
  netHours: number
}

export type StaffGroup = GroupTotals & {
  userName: string
  entries: ReportEntry[]
}

export type SiteGroup = GroupTotals & {
  siteName: string
  staffGroups: StaffGroup[]
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function totalsFor(entries: ReportEntry[]): GroupTotals {
  const completed = entries.filter((e) => e.hours !== null)
  const netHours = completed.reduce((sum, e) => sum + (e.hours ?? 0), 0)
  const breakMinutes = completed.reduce((sum, e) => sum + e.break_minutes, 0)
  return {
    grossHours: round2(netHours + breakMinutes / 60),
    breakMinutes,
    netHours: round2(netHours),
  }
}

function groupStaffEntries(entries: ReportEntry[]): StaffGroup[] {
  const byUser = new Map<string, ReportEntry[]>()
  for (const entry of entries) {
    if (entry.hours === null) continue
    const list = byUser.get(entry.user_name) ?? []
    list.push(entry)
    byUser.set(entry.user_name, list)
  }

  return Array.from(byUser.entries())
    .map(([userName, userEntries]) => ({
      userName,
      entries: userEntries,
      ...totalsFor(userEntries),
    }))
    .sort((a, b) => a.userName.localeCompare(b.userName))
}

export async function groupByStaff(
  filters: ReportFilters,
  client?: SupabaseClientLike
): Promise<StaffGroup[]> {
  const entries = await getReportEntries(filters, client)
  return groupStaffEntries(entries)
}

export type PayrollStaffReport = {
  staffGroups: StaffGroup[]
  // "UserName (DD Mon)" for each day rounding changed because of a
  // multi-site hand-off - see applyPayRounding's needsCheck.
  flaggedDates: string[]
}

// Same grouping as groupByStaff, but with the business's payroll rounding
// rules applied first (lib/payroll.ts): each day's first clock-in/last
// clock-out rounds to the nearest half hour in the business's favour, and a
// staff member's Net total for a day is that rounded day total rather than
// the sum of raw punch gaps. Used for the weekly report so it reflects
// payable hours for every staff member, not just raw punches.
export async function groupByStaffForPayroll(
  filters: ReportFilters,
  client?: SupabaseClientLike
): Promise<PayrollStaffReport> {
  const entries = await getReportEntries(filters, client)
  const { entries: rounded, dayTotals } = applyPayRounding(entries)

  const netHoursByUser = new Map<string, number>()
  for (const d of dayTotals) {
    netHoursByUser.set(d.userName, round2((netHoursByUser.get(d.userName) ?? 0) + d.hours))
  }

  const staffGroups = groupStaffEntries(rounded).map((group) => {
    const netHours = netHoursByUser.get(group.userName) ?? group.netHours
    return { ...group, netHours, grossHours: round2(netHours + group.breakMinutes / 60) }
  })

  const flaggedDates = dayTotals
    .filter((d) => d.needsCheck)
    .map((d) => `${d.userName} (${formatDateKeyShort(d.date)})`)

  return { staffGroups, flaggedDates }
}

export type DayStaffTotal = {
  date: string
  userName: string
  hours: number
}

export type DaySiteTotal = {
  date: string
  siteName: string
  hours: number
}

function dateKey(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function groupByDay<T extends { date: string; hours: number }>(
  entries: ReportEntry[],
  labelOf: (e: ReportEntry) => string,
  makeRow: (date: string, label: string, hours: number) => T,
  labelKey: keyof T
): T[] {
  const byKey = new Map<string, T>()
  for (const entry of entries) {
    if (entry.hours === null) continue
    const date = dateKey(entry.clock_in_at)
    const label = labelOf(entry)
    const key = `${date}__${label}`
    const existing = byKey.get(key)
    if (existing) {
      existing.hours = round2(existing.hours + entry.hours)
    } else {
      byKey.set(key, makeRow(date, label, round2(entry.hours)))
    }
  }

  return Array.from(byKey.values()).sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return String(a[labelKey]).localeCompare(String(b[labelKey]))
  })
}

export async function groupByDayAndStaff(
  filters: ReportFilters,
  client?: SupabaseClientLike
): Promise<DayStaffTotal[]> {
  const entries = await getReportEntries(filters, client)
  return groupByDay(
    entries,
    (e) => e.user_name,
    (date, userName, hours) => ({ date, userName, hours }),
    'userName'
  )
}

export async function groupByDayAndSite(
  filters: ReportFilters,
  client?: SupabaseClientLike
): Promise<DaySiteTotal[]> {
  const entries = await getReportEntries(filters, client)
  return groupByDay(
    entries,
    (e) => e.site_name,
    (date, siteName, hours) => ({ date, siteName, hours }),
    'siteName'
  )
}

export async function groupBySite(
  filters: ReportFilters,
  client?: SupabaseClientLike
): Promise<SiteGroup[]> {
  const entries = await getReportEntries(filters, client)

  const bySite = new Map<string, ReportEntry[]>()
  for (const entry of entries) {
    if (entry.hours === null) continue
    const list = bySite.get(entry.site_name) ?? []
    list.push(entry)
    bySite.set(entry.site_name, list)
  }

  return Array.from(bySite.entries())
    .map(([siteName, siteEntries]) => ({
      siteName,
      staffGroups: groupStaffEntries(siteEntries),
      ...totalsFor(siteEntries),
    }))
    .sort((a, b) => a.siteName.localeCompare(b.siteName))
}

export type JobStaffPayHours = {
  userName: string
  hours: number
}

export type JobPayHours = {
  siteName: string
  staff: JobStaffPayHours[]
  totalHours: number
}

// For payroll: hours per staff member per job, rounded to the nearest
// payable half hour (see lib/payroll.ts), plus a total per job.
export async function groupPayHoursBySiteAndStaff(
  filters: ReportFilters,
  client?: SupabaseClientLike
): Promise<JobPayHours[]> {
  const entries = await getReportEntries(filters, client)
  const { entries: rounded } = applyPayRounding(entries)

  const bySite = new Map<string, Map<string, number>>()
  for (const entry of rounded) {
    if (entry.hours === null) continue

    const staffHours = bySite.get(entry.site_name) ?? new Map<string, number>()
    staffHours.set(entry.user_name, round2((staffHours.get(entry.user_name) ?? 0) + entry.hours))
    bySite.set(entry.site_name, staffHours)
  }

  return Array.from(bySite.entries())
    .map(([siteName, staffHours]) => {
      const staff = Array.from(staffHours.entries())
        .map(([userName, hours]) => ({ userName, hours }))
        .sort((a, b) => a.userName.localeCompare(b.userName))
      return {
        siteName,
        staff,
        totalHours: round2(staff.reduce((sum, s) => sum + s.hours, 0)),
      }
    })
    .sort((a, b) => a.siteName.localeCompare(b.siteName))
}
