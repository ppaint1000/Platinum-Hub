const TIME_ZONE = 'Pacific/Auckland'

// The server runs in UTC - without an explicit timeZone, a stored UTC
// timestamp displays as the UTC clock time instead of NZ time, which is off
// by 12-13 hours (wrong date, and often AM/PM flipped).
export function formatNZDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-NZ', {
    timeZone: TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

// YYYY-MM-DD for the given instant, using NZ's calendar date (not the
// server's, which runs in UTC and can be a day off around midnight NZ time).
export function nzDateKey(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date(iso))
}

export function nzTodayDateString(): string {
  return nzDateKey(new Date().toISOString())
}

// Monday of the week containing the given YYYY-MM-DD date.
export function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  const dow = d.getUTCDay() // 0 = Sunday .. 6 = Saturday
  const diffToMonday = dow === 0 ? -6 : 1 - dow
  d.setUTCDate(d.getUTCDate() + diffToMonday)
  return d.toISOString().slice(0, 10)
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// NZ's UTC offset (+12 or +13 with daylight saving) at a given instant, in minutes.
function nzOffsetMinutesAt(ms: number): number {
  const tzName = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    timeZoneName: 'shortOffset',
  })
    .formatToParts(new Date(ms))
    .find((p) => p.type === 'timeZoneName')?.value

  const match = tzName ? /GMT([+-]\d+)/.exec(tzName) : null
  return match ? Number(match[1]) * 60 : 12 * 60
}

// The UTC instant of NZ local midnight on the given YYYY-MM-DD date - the
// real start of that day in NZ, not the UTC calendar date. Report date
// filters must use this (not `${date}T00:00:00`, which Postgres reads as
// UTC) or shifts in the first hours of the NZ day get excluded.
export function nzDayStartUtcIso(dateStr: string): string {
  const guessMs = Date.parse(`${dateStr}T00:00:00Z`)
  const offsetMin = nzOffsetMinutesAt(guessMs)
  return new Date(guessMs - offsetMin * 60000).toISOString()
}

// The UTC instant one millisecond before the next NZ day starts - the real
// end of the given NZ date, for the same reason as nzDayStartUtcIso.
export function nzDayEndUtcIso(dateStr: string): string {
  const nextDayStartMs = new Date(nzDayStartUtcIso(addDays(dateStr, 1))).getTime()
  return new Date(nextDayStartMs - 1).toISOString()
}

// HH:mm (24h) in NZ time, for pre-filling <input type="time"> editors.
export function nzTimeString(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

// For contexts (like the PDF) that want a month name instead of dd/mm/yyyy.
export function formatNZDateTimeLong(iso: string): string {
  return new Date(iso).toLocaleString('en-NZ', {
    timeZone: TIME_ZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

// Excel/ExcelJS date cells are timezone-naive - a numFmt just prints
// whatever Y/M/D/H/M/S the underlying value has, read via UTC getters. To
// make it print the NZ wall-clock time, build a Date whose UTC components
// *are* that NZ wall-clock time, rather than passing the real UTC instant.
export function toNZExcelDate(iso: string): Date {
  const parts = new Intl.DateTimeFormat('en-NZ', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso))

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)

  return new Date(
    Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  )
}
