import Link from 'next/link'
import { getCurrentProfile } from '@/lib/supabase/profile'
import { getReportEntries } from '@/lib/timesheets/reports'
import { addDays, mondayOf, nzDateKey, nzTimeString, nzTodayDateString } from '@/lib/timesheets/formatNZ'
import { WeeklyTimesheetReview } from './weekly-timesheet-review'

const DAY_LABELS = ['MON', 'TUE', 'WED', 'THUR', 'FRI', 'SAT', 'SUN']

export default async function WeeklyTimesheetPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const requested = typeof sp.from === 'string' ? sp.from : ''

  const profile = await getCurrentProfile()

  const from = mondayOf(requested || nzTodayDateString())
  const to = addDays(from, 6)

  const entries = await getReportEntries({ userId: profile.id, from, to })

  const days = DAY_LABELS.map((label, i) => {
    const date = addDays(from, i)
    return {
      label,
      date,
      entries: entries
        .filter((e) => nzDateKey(e.clock_in_at) === date)
        .map((e) => ({
          id: e.id,
          siteId: e.site_id,
          siteName: e.site_name,
          start: nzTimeString(e.clock_in_at),
          finish: e.clock_out_at ? nzTimeString(e.clock_out_at) : null,
          breakMinutes: e.break_minutes,
          hours: e.hours,
        })),
    }
  })

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Weekly Timesheet</h1>
        <div className="flex gap-3 text-sm">
          <Link href="/timesheets/timesheet" className="underline">
            My Timesheet
          </Link>
          <Link href="/timesheets/timesheet/requests" className="underline">
            Request a Change
          </Link>
          <Link href="/timesheets/clock" className="underline">
            Clock In/Out
          </Link>
        </div>
      </div>
      <p className="text-sm text-black/60">Signed in as {profile.full_name}</p>

      <div className="flex items-center justify-between text-sm">
        <Link href={`/timesheets/timesheet/weekly?from=${addDays(from, -7)}`} className="underline">
          ← Previous week
        </Link>
        <span className="font-medium">
          Week ending {new Date(`${to}T00:00:00Z`).toLocaleDateString('en-NZ', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })}
        </span>
        <Link href={`/timesheets/timesheet/weekly?from=${addDays(from, 7)}`} className="underline">
          Next week →
        </Link>
      </div>

      <WeeklyTimesheetReview key={from} days={days} from={from} to={to} />
    </div>
  )
}
