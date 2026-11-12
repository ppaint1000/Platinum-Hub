// Timesheets → Timesheet Photos → Hub hours: a plain, read-only table of
// each person's week as the Hub has it - start, finish and lunch per day,
// and the hours that go to Xero - for checking against the paper
// timesheets staff email in. Admins only. ?week=YYYY-MM-DD (a Sunday),
// defaults to last week.
import Link from 'next/link'
import { requireAdmin } from '@/lib/timesheets/authGuards'
import { createAdminClient } from '@/lib/supabase/admin'
import { getReportEntries } from '@/lib/timesheets/reports'
import { hoursForPeriod } from '@/lib/xero/timesheets'
import { addDays, nzDateKey, nzTimeString } from '@/lib/timesheets/formatNZ'
import { recentWeekEndings, weekEndingLabel } from '@/lib/timesheets/timesheetPhotos'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default async function HubHoursPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  await requireAdmin()
  const { week: asked } = await searchParams
  const weeks = recentWeekEndings(8)
  const week = asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) && new Date(`${asked}T00:00:00Z`).getUTCDay() === 0 ? asked : weeks[0]
  const monday = addDays(week, -6)
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))

  const db = createAdminClient()
  const { data: people } = await db
    .from('profiles')
    .select('id, full_name, email, user_app_access!inner(timesheets)')
    .eq('user_app_access.timesheets', true)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('full_name')
    .returns<{ id: string; full_name: string; email: string | null }[]>()

  const rows = await Promise.all(
    (people ?? []).map(async (p) => {
      const [entries, xero] = await Promise.all([
        getReportEntries({ userId: p.id, from: monday, to: week }, db),
        hoursForPeriod(p.id, monday, week),
      ])
      const byDay = days.map((d) => {
        const shifts = entries.filter((e) => nzDateKey(e.clock_in_at) === d).sort((a, b) => a.clock_in_at.localeCompare(b.clock_in_at))
        if (!shifts.length) return { date: d, start: '', finish: '', lunch: 0, xero: xero.days[d] ?? 0, sites: '', open: false }
        const last = shifts[shifts.length - 1]
        return {
          date: d,
          start: nzTimeString(shifts[0].clock_in_at),
          finish: last.clock_out_at ? nzTimeString(last.clock_out_at) : 'still clocked in',
          lunch: shifts.reduce((s, e) => s + (e.break_minutes ?? 0), 0),
          xero: xero.days[d] ?? 0,
          sites: [...new Set(shifts.map((e) => e.site_name))].join(', '),
          open: shifts.some((e) => !e.clock_out_at),
        }
      })
      return { ...p, byDay, total: xero.total }
    })
  )
  const withHours = rows.filter((r) => r.total > 0 || r.byDay.some((d) => d.start))

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Hub hours - week ending {weekEndingLabel(week)}</h1>
        <Link href="/timesheets/admin/timesheet-photos" className="text-sm underline">
          ← Timesheet photos
        </Link>
      </div>
      <p className="text-sm text-black/60">
        Mon {weekEndingLabel(monday)} to Sun {weekEndingLabel(week)}. Start = first clock-in, Finish = last clock-out, Lunch = breaks taken, Xero hours =
        the hours that go to Xero for that day.
      </p>
      <div className="flex flex-wrap gap-2 text-sm">
        {weeks.map((w) => (
          <Link
            key={w}
            href={`/timesheets/admin/timesheet-photos/hours?week=${w}`}
            className={`rounded-full border px-3 py-1 ${w === week ? 'border-black bg-black text-white' : 'border-black/20'}`}
          >
            {weekEndingLabel(w)}
          </Link>
        ))}
      </div>
      {withHours.length === 0 && <p className="text-sm text-black/60">No hours in the Hub for this week.</p>}
      {withHours.map((r) => (
        <section key={r.id} className="rounded-lg border border-black/10 bg-white p-4" data-person={r.full_name} data-email={r.email ?? ''}>
          <h2 className="font-semibold">
            {r.full_name} <span className="font-normal text-black/50">{r.email}</span>
          </h2>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-black/50">
                <th className="py-1 pr-2">Day</th>
                <th className="py-1 pr-2">Date</th>
                <th className="py-1 pr-2">Start</th>
                <th className="py-1 pr-2">Finish</th>
                <th className="py-1 pr-2">Lunch (min)</th>
                <th className="py-1 pr-2">Xero hours</th>
                <th className="py-1">Site(s)</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {r.byDay.map((d, i) => (
                <tr key={d.date} className="border-t border-black/5">
                  <td className="py-1 pr-2">{DAY_NAMES[i]}</td>
                  <td className="py-1 pr-2">{d.date}</td>
                  <td className="py-1 pr-2">{d.start || '-'}</td>
                  <td className={`py-1 pr-2 ${d.open ? 'text-red-700' : ''}`}>{d.finish || '-'}</td>
                  <td className="py-1 pr-2">{d.start ? d.lunch : '-'}</td>
                  <td className="py-1 pr-2">{d.xero ? d.xero.toFixed(2) : '0'}</td>
                  <td className="py-1">{d.sites || '-'}</td>
                </tr>
              ))}
              <tr className="border-t border-black/20 font-semibold">
                <td className="py-1 pr-2" colSpan={5}>
                  Week total
                </td>
                <td className="py-1 pr-2">{r.total.toFixed(2)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </section>
      ))}
    </div>
  )
}
