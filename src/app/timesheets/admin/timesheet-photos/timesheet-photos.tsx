'use client'

// Timesheets → Timesheet Photos: downloads the
// week's timesheet photos staff emailed in, as a "Week ending DD-MM-YYYY"
// folder (zip), each file named after the person.
import { useState, useTransition } from 'react'
import { timesheetPhotosAction } from './actions'

const label = (d: string) => `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}`

export function TimesheetPhotos({ weekEndings }: { weekEndings: string[] }) {
  const [week, setWeek] = useState(weekEndings[0] ?? '')
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ folder: string; files: string[]; url?: string } | null>(null)

  function run() {
    setError('')
    setResult(null)
    start(async () => {
      const r = await timesheetPhotosAction(week)
      if (r.error) return setError(r.error)
      setResult({ folder: r.folder ?? '', files: r.files ?? [], url: r.url })
      if (r.url) window.location.href = r.url
    })
  }

  return (
    <div className="space-y-3 rounded-lg border border-black/10 bg-white p-4">
      <div>
        <h2 className="text-base font-semibold">Staff timesheet photos</h2>
        <p className="text-sm text-black/60">
          Gets the timesheets your staff emailed to the office Gmail for the week, as a folder called &quot;Week ending …&quot; - each file is named
          after the person and the week. Unzip it into your Documents.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select value={week} onChange={(e) => setWeek(e.target.value)} className="rounded-md border border-black/20 px-3 py-2 text-sm" aria-label="Week ending">
          {weekEndings.map((w, i) => (
            <option key={w} value={w}>
              Week ending {label(w)}
              {i === 0 ? ' (last week)' : ''}
            </option>
          ))}
        </select>
        <button onClick={run} disabled={pending || !week} className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {pending ? 'Getting them from Gmail…' : 'Download timesheet photos'}
        </button>
      </div>
      {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
      {result &&
        (result.files.length ? (
          <div className="text-sm">
            <p className="font-semibold text-green-800">
              {result.folder}.zip - {result.files.length} file{result.files.length === 1 ? '' : 's'}.{' '}
              {result.url && (
                <a href={result.url} className="underline">
                  Download again
                </a>
              )}
            </p>
            <ul className="mt-1 list-disc pl-5 text-black/70">
              {result.files.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-black/70">No staff timesheet emails with attachments found for {result.folder}.</p>
        ))}
    </div>
  )
}
