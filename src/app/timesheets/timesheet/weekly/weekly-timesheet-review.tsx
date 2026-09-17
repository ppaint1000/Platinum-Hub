'use client'

import { Fragment, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { confirmWeeklyTimesheet } from '@/lib/timesheets/actions/timesheet'

type EntryRow = {
  id: string
  siteId: string
  siteName: string
  start: string
  finish: string | null
  breakMinutes: number
  hours: number | null
}

type DayGroup = {
  label: string
  date: string
  entries: EntryRow[]
}

function dayJobTotals(day: DayGroup): { jobs: { siteId: string; label: string; hours: number }[]; dayTotal: number } {
  const jobs: { siteId: string; label: string; hours: number }[] = []
  let dayTotal = 0

  for (const entry of day.entries) {
    const hours = entry.hours ?? 0
    dayTotal += hours

    const existing = jobs.find((j) => j.siteId === entry.siteId)
    if (existing) {
      existing.hours += hours
    } else {
      jobs.push({ siteId: entry.siteId, label: entry.siteName, hours })
    }
  }

  return { jobs, dayTotal }
}

function formatDayDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-NZ', { day: '2-digit', month: 'short' })
}

export function WeeklyTimesheetReview({
  days,
  from,
  to,
}: {
  days: DayGroup[]
  from: string
  to: string
}) {
  const allEntries = useMemo(() => days.flatMap((d) => d.entries), [days])

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const totalHours = allEntries.reduce((sum, e) => sum + (e.hours ?? 0), 0)
  const hasOpenShift = allEntries.some((e) => e.finish === null)
  const hasEntries = allEntries.length > 0

  function handleConfirm() {
    setError('')
    setSuccess('')

    if (hasOpenShift) {
      setError('You still have a shift that hasn’t been clocked out. Clock out before confirming.')
      return
    }
    if (!hasEntries) {
      setError('No hours recorded for this week yet.')
      return
    }

    startTransition(async () => {
      const result = await confirmWeeklyTimesheet({ from, to })
      if (result?.error) {
        setError(result.error)
        return
      }
      setSuccess('Confirmed — sent to the Platinum office.')
      setTimeout(() => router.push('/timesheets/clock'), 1500)
    })
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-black/60">
        Spot something wrong? These times are locked — use{' '}
        <Link href="/timesheets/timesheet/requests" className="underline">
          Request a Change
        </Link>{' '}
        to have the office correct it.
      </p>

      {!hasEntries ? (
        <p className="text-sm text-black/60">No shifts recorded for this week yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-black/10">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-black/10 bg-black/5">
              <tr>
                <th className="p-3">Day / Date</th>
                <th className="p-3">Place of Work</th>
                <th className="p-3">Start</th>
                <th className="p-3">Finish</th>
                <th className="p-3">Break</th>
                <th className="p-3">Hours</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10">
              {days.map((day) =>
                day.entries.length === 0 ? (
                  <tr key={day.date}>
                    <td className="p-3 align-top whitespace-nowrap">
                      <p className="font-medium">{day.label}</p>
                      <p className="text-xs text-black/50">{formatDayDate(day.date)}</p>
                    </td>
                    <td className="p-3 align-top text-black/40" colSpan={6}>
                      No shift
                    </td>
                  </tr>
                ) : (
                  <Fragment key={day.date}>
                    {day.entries.map((entry, idx) => (
                      <tr key={entry.id}>
                        <td className="p-3 align-top whitespace-nowrap">
                          {idx === 0 && (
                            <>
                              <p className="font-medium">{day.label}</p>
                              <p className="text-xs text-black/50">{formatDayDate(day.date)}</p>
                            </>
                          )}
                        </td>
                        <td className="p-3 align-top">{entry.siteName}</td>
                        <td className="p-3 align-top">{entry.start}</td>
                        <td className="p-3 align-top">
                          {entry.finish ?? <span className="text-black/40">In progress</span>}
                        </td>
                        <td className="p-3 align-top">
                          {entry.breakMinutes > 0 ? `${entry.breakMinutes}m` : '—'}
                        </td>
                        <td className="p-3 align-top tabular-nums">
                          {entry.hours !== null ? entry.hours.toFixed(2) : '—'}
                        </td>
                        <td className="p-3 align-top whitespace-nowrap">
                          {entry.finish !== null && (
                            <Link
                              href={`/timesheets/timesheet/requests?entry=${entry.id}`}
                              className="text-xs underline"
                            >
                              Request change
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                    {(() => {
                      const { jobs, dayTotal } = dayJobTotals(day)
                      return (
                        <tr className="bg-black/[0.03] text-xs text-black/70">
                          <td className="p-3 align-top"></td>
                          <td className="p-3 align-top" colSpan={5}>
                            {jobs.map((j) => `${j.label}: ${j.hours.toFixed(2)}h`).join(' · ')}
                          </td>
                          <td className="p-3 align-top font-medium tabular-nums">
                            {dayTotal.toFixed(2)}
                          </td>
                        </tr>
                      )
                    })()}
                  </Fragment>
                )
              )}
            </tbody>
            <tfoot className="border-t border-black/10 bg-black/5 font-medium">
              <tr>
                <td className="p-3" colSpan={6}>
                  Total hours
                </td>
                <td className="p-3 tabular-nums">{totalHours.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-700">{success}</p>}

      {hasEntries && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleConfirm}
            disabled={pending || hasOpenShift}
            className="flex-1 rounded-md bg-black px-4 py-3 text-sm text-white disabled:opacity-50 sm:flex-none"
          >
            {pending ? 'Confirming…' : 'Confirm — looks correct'}
          </button>
        </div>
      )}
    </div>
  )
}
