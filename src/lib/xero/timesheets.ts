// Hours for Xero: each person's payable hours per day in a pay period,
// worked out exactly like the Timesheet Report (half-hour payroll rounding,
// lunch breaks off - lib/timesheets/payroll.ts), and sending them to Xero
// Payroll NZ as draft timesheets. Server-side only.
import { createAdminClient } from '@/lib/supabase/admin'
import { getReportEntries } from '@/lib/timesheets/reports'
import { applyPayRounding } from '@/lib/timesheets/payroll'
import { addDays, nzDateKey } from '@/lib/timesheets/formatNZ'
import { payrollNz, SALARY_ROLES, salaryRateId, xeroEarningsRates, xeroEmployees } from './client'

export type PeriodHours = {
  days: Record<string, number>
  total: number
  // Days the payroll rounding changed (e.g. switched sites mid-day) - worth a look.
  needsCheck: string[]
  // Shifts in the period never clocked out - not counted.
  openShifts: number
  // Days worked over 5 hours with no lunch break recorded.
  noLunch: string[]
}

// Worked more than this in a day with no break recorded = flagged.
const LUNCH_FLAG_HOURS = 5

export function periodDates(start: string, end: string): string[] {
  const out: string[] = []
  for (let d = start; d <= end && out.length < 62; d = addDays(d, 1)) out.push(d)
  return out
}

// A pay period moved back (or forward) by whole periods.
export function shiftPeriod(start: string, end: string, by: number) {
  const len = periodDates(start, end).length
  return { start: addDays(start, by * len), end: addDays(end, by * len) }
}

export async function hoursForPeriod(userId: string, start: string, end: string): Promise<PeriodHours & { entryIds: string[] }> {
  const entries = await getReportEntries({ userId, from: start, to: end })
  const { dayTotals } = applyPayRounding(entries)
  const days: Record<string, number> = {}
  for (const d of dayTotals) if (d.date >= start && d.date <= end) days[d.date] = (days[d.date] ?? 0) + d.hours
  // A day's finished shifts: time on site and breaks taken.
  const byDay = new Map<string, { hours: number; breakMinutes: number }>()
  for (const e of entries) {
    if (!e.clock_out_at) continue
    const d = nzDateKey(e.clock_in_at)
    const cur = byDay.get(d) ?? { hours: 0, breakMinutes: 0 }
    cur.hours += (Date.parse(e.clock_out_at) - Date.parse(e.clock_in_at)) / 3600000
    cur.breakMinutes += e.break_minutes ?? 0
    byDay.set(d, cur)
  }
  return {
    days,
    total: Object.values(days).reduce((s, n) => s + n, 0),
    needsCheck: dayTotals.filter((d) => d.needsCheck).map((d) => d.date),
    openShifts: entries.filter((e) => !e.clock_out_at).length,
    // Finished shifts - approved onto their jobs once sent to Xero.
    entryIds: entries.filter((e) => e.clock_out_at).map((e) => e.id),
    noLunch: [...byDay]
      .filter(([d, v]) => d >= start && d <= end && v.hours > LUNCH_FLAG_HOURS && v.breakMinutes === 0)
      .map(([d]) => d)
      .sort(),
  }
}

export type SendResult = { userId: string; name: string; ok: boolean; message: string; hours?: number }

// Send (or re-send) one person's timesheet. A draft already sent for the
// same period is replaced; one already approved in Xero is left alone.
export async function sendTimesheet(opts: {
  userId: string
  name: string
  employeeId: string
  calendarId: string
  earningsRateId: string
  start: string
  end: string
  pushedBy: string
}): Promise<SendResult> {
  const { userId, name } = opts
  try {
    const hours = await hoursForPeriod(userId, opts.start, opts.end)
    if (hours.total <= 0) return { userId, name, ok: false, message: 'No hours in this pay period - nothing sent.' }

    const db = createAdminClient()
    const { data: previous } = await db
      .from('xero_timesheet_pushes')
      .select('xero_timesheet_id')
      .eq('user_id', userId)
      .eq('period_start', opts.start)
      .maybeSingle()
    if (previous?.xero_timesheet_id) {
      try {
        const existing = await payrollNz<{ timesheet: { status: string } }>(`/Timesheets/${previous.xero_timesheet_id}`)
        if (existing.timesheet?.status && existing.timesheet.status !== 'Draft') {
          return { userId, name, ok: false, message: `Already ${existing.timesheet.status.toLowerCase()} in Xero - not replaced.` }
        }
        await payrollNz(`/Timesheets/${previous.xero_timesheet_id}`, { method: 'DELETE' })
      } catch {
        // Deleted in Xero already - just send a new one.
      }
    }

    const lines = Object.entries(hours.days)
      .filter(([, h]) => h > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, h]) => ({ date, earningsRateID: opts.earningsRateId, numberOfUnits: h }))
    const created = await payrollNz<{ timesheet: { timesheetID: string; totalHours: number } }>('/Timesheets', {
      method: 'POST',
      body: {
        payrollCalendarID: opts.calendarId,
        employeeID: opts.employeeId,
        startDate: opts.start,
        endDate: opts.end,
        timesheetLines: lines,
      },
    })

    // Sent to Xero = checked: approve these shifts onto their jobs (Labour
    // and Hours), the same as Jobs -> Hours to approve. Changing a shift
    // later takes the approval away again, as it always has.
    let approved = 0
    if (hours.entryIds.length) {
      const { data: done } = await db.from('job_hours_approvals').select('entry_id').in('entry_id', hours.entryIds)
      const already = new Set((done ?? []).map((d) => d.entry_id as string))
      const fresh = hours.entryIds.filter((id) => !already.has(id))
      if (fresh.length) {
        const { error } = await db
          .from('job_hours_approvals')
          .upsert(fresh.map((id) => ({ entry_id: id, approved_by: opts.pushedBy })), { onConflict: 'entry_id', ignoreDuplicates: true })
        if (!error) approved = fresh.length
      }
    }

    await db.from('xero_timesheet_pushes').upsert(
      {
        user_id: userId,
        period_start: opts.start,
        period_end: opts.end,
        xero_timesheet_id: created.timesheet?.timesheetID ?? null,
        hours: hours.total,
        pushed_by: opts.pushedBy,
        pushed_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,period_start' }
    )
    return {
      userId,
      name,
      ok: true,
      hours: hours.total,
      message: `${hours.total} h sent as a draft${previous ? ' (replaced the earlier one)' : ''}${approved ? ` · ${approved} shift${approved === 1 ? '' : 's'} approved onto jobs` : ''}.`,
    }
  } catch (e) {
    return { userId, name, ok: false, message: e instanceof Error ? e.message : 'Failed to send.' }
  }
}

// Send a pay period for these people (the Send button, and the Monday
// automatic send). Pay item: their own, else Salary for supervisors and
// sales, else the usual one. With skipSent, anyone already sent for this
// period is left alone.
export async function sendPeriod(input: {
  calendarId: string
  start: string
  end: string
  userIds: string[]
  pushedBy: string
  skipSent?: boolean
}): Promise<{ error?: string; results?: SendResult[] }> {
  const db = createAdminClient()
  const [{ data: conn }, { data: links }, { data: people }, employees, rates, { data: sent }] = await Promise.all([
    db.from('xero_connection').select('earnings_rate_id').eq('id', 1).maybeSingle(),
    db.from('xero_employee_links').select('user_id, xero_employee_id, earnings_rate_id').in('user_id', input.userIds),
    db.from('profiles').select('id, full_name, role').in('id', input.userIds),
    xeroEmployees(),
    xeroEarningsRates(),
    db.from('xero_timesheet_pushes').select('user_id').eq('period_start', input.start),
  ])
  if (!conn?.earnings_rate_id) return { error: 'Choose the pay item for hours first.' }
  const salaryId = salaryRateId(rates)
  const roleOf = new Map((people ?? []).map((p) => [p.id as string, p.role as string]))
  const nameOf = new Map((people ?? []).map((p) => [p.id as string, p.full_name as string]))
  const calendarOf = new Map(employees.map((e) => [e.employeeID, e.payrollCalendarID]))
  const alreadySent = new Set((sent ?? []).map((s) => s.user_id as string))

  const results: SendResult[] = []
  for (const link of links ?? []) {
    const userId = link.user_id as string
    const name = nameOf.get(userId) ?? 'Someone'
    if (calendarOf.get(link.xero_employee_id as string) !== input.calendarId) {
      results.push({ userId, name, ok: false, message: 'Not on this pay calendar in Xero - skipped.' })
      continue
    }
    if (input.skipSent && alreadySent.has(userId)) continue
    results.push(
      await sendTimesheet({
        userId,
        name,
        employeeId: link.xero_employee_id as string,
        calendarId: input.calendarId,
        earningsRateId:
          (link.earnings_rate_id as string | null) ||
          (SALARY_ROLES.includes(roleOf.get(userId) ?? '') ? salaryId : null) ||
          (conn.earnings_rate_id as string),
        start: input.start,
        end: input.end,
        pushedBy: input.pushedBy,
      })
    )
  }
  return { results }
}
