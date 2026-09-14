'use client'

import { useActionState } from 'react'
import { setWeeklyReportEnabled, sendWeeklyReportNow } from '@/lib/timesheets/actions/settings'

export function WeeklyReportPanel({ enabled }: { enabled: boolean }) {
  const [result, sendAction, pending] = useActionState(sendWeeklyReportNow, undefined)

  return (
    <div className="max-w-3xl space-y-3 rounded-lg border border-black/10 p-4">
      <h2 className="font-medium">Weekly email report</h2>
      <p className="text-sm text-black/60">
        Sends a PDF report for the prior Monday–Sunday week. The actual Wednesday 7am schedule
        isn&apos;t wired up yet — use &quot;Send now&quot; to test.
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
      <form action={sendAction}>
        <button
          type="submit"
          disabled={pending || !enabled}
          className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {pending ? 'Sending…' : "Send this week's report now"}
        </button>
      </form>
      {result && (
        <p className={`text-sm ${result.sent ? 'text-green-700' : 'text-red-600'}`}>
          {result.sent ? 'Sent!' : result.reason}
        </p>
      )}
    </div>
  )
}
