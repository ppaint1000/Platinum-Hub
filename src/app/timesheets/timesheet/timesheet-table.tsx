import { Fragment } from 'react'
import { formatNZDateTime, mondayOf, nzDateKey, nzTodayDateString } from '@/lib/timesheets/formatNZ'
import type { ReportEntry } from '@/lib/timesheets/reports'

export function TimesheetTable({ entries }: { entries: ReportEntry[] }) {
  const totalHours = entries.reduce((sum, e) => sum + (e.hours ?? 0), 0)

  // Entries are sorted newest first, so the current week (if present) is a
  // prefix of the list - mark where it ends so painters can see this week's
  // shifts separated from older ones at a glance.
  const currentWeekStart = mondayOf(nzTodayDateString())
  const lastCurrentWeekIndex = entries.reduce(
    (lastIndex, e, i) => (nzDateKey(e.clock_in_at) >= currentWeekStart ? i : lastIndex),
    -1
  )
  const showDivider = lastCurrentWeekIndex >= 0 && lastCurrentWeekIndex < entries.length - 1

  return (
    <div className="space-y-3">
      <p className="text-sm text-black/60">
        {entries.length} shift{entries.length === 1 ? '' : 's'} · {totalHours.toFixed(2)} total hours
      </p>
      <div className="overflow-x-auto rounded-lg border border-black/10">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-black/10 bg-black/5">
            <tr>
              <th className="p-3">Site</th>
              <th className="p-3">Clock in</th>
              <th className="p-3">Clock out</th>
              <th className="p-3">Break</th>
              <th className="p-3">Hours</th>
              <th className="p-3">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/10">
            {entries.map((e, i) => (
              <Fragment key={e.id}>
                <tr>
                  <td className="p-3">{e.site_name}</td>
                  <td className="p-3">{formatNZDateTime(e.clock_in_at)}</td>
                  <td className="p-3">
                    {e.clock_out_at ? formatNZDateTime(e.clock_out_at) : 'In progress'}
                  </td>
                  <td className="p-3">{e.break_minutes > 0 ? `${e.break_minutes}m` : '—'}</td>
                  <td className="p-3">{e.hours ?? '—'}</td>
                  <td className="max-w-xs truncate p-3">{e.notes ?? ''}</td>
                </tr>
                {showDivider && i === lastCurrentWeekIndex && (
                  <tr aria-hidden="true">
                    <td colSpan={6} className="border-t-4 border-black/30 p-0" />
                  </tr>
                )}
              </Fragment>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-black/60">
                  No shifts recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
