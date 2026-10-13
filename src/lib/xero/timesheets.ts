// Hours for Xero: each person's payable hours per day in a pay period,
// worked out exactly like the Timesheet Report (half-hour payroll rounding,
// lunch breaks off - lib/timesheets/payroll.ts), and sending them to Xero
// Payroll NZ as draft timesheets. Server-side only.
import { createAdminClient } from '@/lib/supabase/admin'
import { getReportEntries } from '@/lib/timesheets/reports'
import { applyPayRounding } from '@/lib/timesheets/payroll'
import { addDays } from '@/lib/timesheets/formatNZ'
import { payrollNz } from './client'

export type PeriodHours = {
  days: Record<string, number>
  total: number
  // Days the payroll rounding changed (e.g. switched sites mid-day) - worth a look.
  needsCheck: string[]
  // Shifts in the period never clocked out - not counted.
  openShifts: number
}

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

export async function hoursForPeriod(userId: string, start: string, end: string): Promise<PeriodHours> {
  const entries = await getReportEntries({ userId, from: start, to: end })
  const { dayTotals } = applyPayRounding(entries)
  const days: Record<string, number> = {}
  for (const d of dayTotals) if (d.date >= start && d.date <= end) days[d.date] = (days[d.date] ?? 0) + d.hours
  return {
    days,
    total: Object.values(days).reduce((s, n) => s + n, 0),
    needsCheck: dayTotals.filter((d) => d.needsCheck).map((d) => d.date),
    openShifts: entries.filter((e) => !e.clock_out_at).length,
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
      message: `${hours.total} h sent as a draft${previous ? ' (replaced the earlier one)' : ''}.`,
    }
  } catch (e) {
    return { userId, name, ok: false, message: e instanceof Error ? e.message : 'Failed to send.' }
  }
}
