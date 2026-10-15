'use client'

import { useActionState } from 'react'
import { setWeeklyReportEnabled, sendWeeklyReportNow } from '@/lib/timesheets/actions/settings'

type Range = { from: string; to: string }

// "2026-10-12".."2026-10-18" -> "Mon 12 – Sun 18 Oct"
function rangeLabel({ from, to }: Range) {
  const day = (d: string, withMonth: boolean) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString('en-NZ', {
      weekday: 'short',
      day: 'numeric',
      ...(withMonth ? { month: 'short' } : {}),
      timeZone: 'UTC',
    })
  const sameMonth = from.slice(0, 7) === to.slice(0, 7)
  return `${day(from, !sameMonth)} – ${day(to, true)}`
}

export function WeeklyReportPanel({ enabled, thisWeek, lastWeek }: { enabled: boolean; thisWeek: Range; lastWeek: Range }) {
  const [result, sendAction, pending] = useActionState(sendWeeklyReportNow, undefined)

  return (
    <div className="max-w-3xl space-y-3 rounded-lg border border-black/10 p-4">
      <h2 className="font-medium">Weekly email report</h2>
      <p className="text-sm text-black/60">
        Emails a PDF timesheet report for a Monday–Sunday week to the timesheet address (and anyone who&apos;s turned it on in
        Notifications).
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <form action={setWeeklyReportEnabled}>
          <input type="hidden" name="enabled" value={(!enabled).toString()} />
          <button type="submit" className="rounded-md border border-black/20 px-4 py-2 text-sm">
            {enabled ? 'Turn off' : 'Turn on'}
          </button>
        </form>
        <span className="text-sm text-black/60">Currently {enabled ? 'on' : 'off'}</span>
      </div>
      <form action={sendAction} className="flex flex-wrap gap-2">
        <button
          type="submit"
          name="week"
          value="this"
          disabled={pending || !enabled}
          className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {pending ? 'Sending…' : `Send this week: ${rangeLabel(thisWeek)}`}
        </button>
        <button
          type="submit"
          name="week"
          value="last"
          disabled={pending || !enabled}
          className="rounded-md border border-black/20 px-4 py-2 text-sm disabled:opacity-50"
        >
          Send last week: {rangeLabel(lastWeek)}
        </button>
      </form>
      {result && <p className={`text-sm ${result.sent ? 'text-green-700' : 'text-red-600'}`}>{result.sent ? 'Sent!' : result.reason}</p>}
    </div>
  )
}
