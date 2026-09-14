import { nzDateKey } from '@/lib/timesheets/formatNZ'
import type { ReportEntry } from '@/lib/timesheets/reports'

// Payroll is only ever paid in half-hour blocks. Punches are rounded in the
// business's favour: a clock-in rounds forward to the next half hour, a
// clock-out rounds back to the previous half hour. This never touches the
// raw punch stored in the database - it's only applied when calculating
// hours for pay.
const HALF_HOUR_MS = 30 * 60 * 1000

export function roundClockInForPay(iso: string): number {
  return Math.ceil(new Date(iso).getTime() / HALF_HOUR_MS) * HALF_HOUR_MS
}

export function roundClockOutForPay(iso: string): number {
  return Math.floor(new Date(iso).getTime() / HALF_HOUR_MS) * HALF_HOUR_MS
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function roundToHalfHour(hours: number): number {
  return Math.round(hours * 2) / 2
}

export type PayDayTotal = {
  userName: string
  date: string
  hours: number
  // True when the day's actual worked time (outer-edge rounding only,
  // summed across every site visited that day) didn't already land on a
  // half-hour multiple - e.g. a staff member switched sites partway
  // through, so the gap/hand-off pushed the total off the half-hour grid
  // and it had to be rounded to the nearest half hour to be payable.
  needsCheck: boolean
}

export type PayRoundingResult = {
  entries: ReportEntry[]
  dayTotals: PayDayTotal[]
}

// Rounding only applies to the outer edges of a staff member's working day -
// the first clock-in and the last clock-out. Someone who clocks out of one
// site and into another partway through the day keeps their actual punch
// times (and the actual gap between them) at that hand-off, so switching
// sites never shaves paid minutes off the day at each individual entry.
// Leaves an open shift (no clock-out yet) untouched.
//
// Per-entry hours (used for job-costing/site attribution) can still land on
// odd fractions because of that gap - dayTotals carries the actual payable
// total per day, rounded to the nearest half hour, with needsCheck flagging
// any day that rounding changed.
export function applyPayRounding(entries: ReportEntry[]): PayRoundingResult {
  const byDay = new Map<string, ReportEntry[]>()
  for (const entry of entries) {
    const key = `${entry.user_name}__${nzDateKey(entry.clock_in_at)}`
    const list = byDay.get(key) ?? []
    list.push(entry)
    byDay.set(key, list)
  }

  const roundedById = new Map<string, ReportEntry>()
  const dayTotals: PayDayTotal[] = []

  for (const [key, dayEntries] of byDay) {
    const [userName, date] = key.split('__')
    const sorted = [...dayEntries].sort((a, b) => a.clock_in_at.localeCompare(b.clock_in_at))
    let daySum = 0
    let hasCompletedShift = false

    sorted.forEach((entry, i) => {
      if (!entry.clock_out_at) {
        roundedById.set(entry.id, entry)
        return
      }
      hasCompletedShift = true
      const clockInMs = i === 0 ? roundClockInForPay(entry.clock_in_at) : new Date(entry.clock_in_at).getTime()
      const clockOutMs =
        i === sorted.length - 1
          ? roundClockOutForPay(entry.clock_out_at)
          : new Date(entry.clock_out_at).getTime()
      const hours = Math.max(0, round2((clockOutMs - clockInMs) / 3600000 - entry.break_minutes / 60))
      daySum += hours

      roundedById.set(entry.id, {
        ...entry,
        clock_in_at: new Date(clockInMs).toISOString(),
        clock_out_at: new Date(clockOutMs).toISOString(),
        hours,
      })
    })

    if (hasCompletedShift) {
      const rounded = roundToHalfHour(daySum)
      dayTotals.push({ userName, date, hours: rounded, needsCheck: Math.abs(rounded - daySum) > 0.001 })
    }
  }

  dayTotals.sort((a, b) => (a.userName === b.userName ? a.date.localeCompare(b.date) : a.userName.localeCompare(b.userName)))

  return { entries: entries.map((e) => roundedById.get(e.id) ?? e), dayTotals }
}
