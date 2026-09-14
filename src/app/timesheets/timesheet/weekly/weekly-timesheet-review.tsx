'use client'

import { Fragment, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { confirmWeeklyTimesheet, updateTimesheetEntry } from '@/lib/timesheets/actions/timesheet'

type Site = { id: string; label: string }

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

const BREAK_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: '30', label: '½ hour' },
  { value: '45', label: '45 min' },
  { value: '60', label: '1 hour' },
  { value: 'custom', label: 'Custom' },
] as const

type BreakChoice = (typeof BREAK_OPTIONS)[number]['value']

type EditState = {
  siteId: string
  start: string
  finish: string
  breakChoice: BreakChoice
  customBreak: string
}

function breakChoiceFor(minutes: number): BreakChoice {
  if (minutes === 0) return 'none'
  if (minutes === 30 || minutes === 45 || minutes === 60) return String(minutes) as BreakChoice
  return 'custom'
}

function breakMinutesFor(state: EditState) {
  if (state.breakChoice === 'none') return 0
  if (state.breakChoice === 'custom') return Math.max(0, parseInt(state.customBreak, 10) || 0)
  return Number(state.breakChoice)
}

function initialEditState(entry: EntryRow): EditState {
  return {
    siteId: entry.siteId,
    start: entry.start,
    finish: entry.finish ?? '',
    breakChoice: breakChoiceFor(entry.breakMinutes),
    customBreak: ![0, 30, 45, 60].includes(entry.breakMinutes) ? String(entry.breakMinutes) : '',
  }
}

function rowHours(dateStr: string, state: EditState): number | null {
  if (!state.start || !state.finish) return null
  const startMs = new Date(`${dateStr}T${state.start}:00`).getTime()
  const finishMs = new Date(`${dateStr}T${state.finish}:00`).getTime()
  if (finishMs <= startMs) return null
  return (finishMs - startMs) / 3600000 - breakMinutesFor(state) / 60
}

function dayJobTotals(
  day: DayGroup,
  edits: Record<string, EditState>,
  sites: Site[]
): { jobs: { siteId: string; label: string; hours: number }[]; dayTotal: number } {
  const jobs: { siteId: string; label: string; hours: number }[] = []
  let dayTotal = 0

  for (const entry of day.entries) {
    const state = edits[entry.id]
    const hours = rowHours(day.date, state) ?? entry.hours ?? 0
    dayTotal += hours

    const label = sites.find((s) => s.id === state.siteId)?.label ?? entry.siteName
    const existing = jobs.find((j) => j.siteId === state.siteId)
    if (existing) {
      existing.hours += hours
    } else {
      jobs.push({ siteId: state.siteId, label, hours })
    }
  }

  return { jobs, dayTotal }
}

function formatDayDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-NZ', { day: '2-digit', month: 'short' })
}

function isDirty(a: EditState, b: EditState) {
  return (
    a.siteId !== b.siteId ||
    a.start !== b.start ||
    a.finish !== b.finish ||
    a.breakChoice !== b.breakChoice ||
    a.customBreak !== b.customBreak
  )
}

export function WeeklyTimesheetReview({
  days,
  sites,
  from,
  to,
}: {
  days: DayGroup[]
  sites: Site[]
  from: string
  to: string
}) {
  const allEntries = useMemo(() => days.flatMap((d) => d.entries.map((e) => ({ ...e, date: d.date }))), [days])

  const [baseline, setBaseline] = useState<Record<string, EditState>>(() =>
    Object.fromEntries(allEntries.map((e) => [e.id, initialEditState(e)]))
  )
  const [edits, setEdits] = useState<Record<string, EditState>>(() =>
    Object.fromEntries(allEntries.map((e) => [e.id, initialEditState(e)]))
  )
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function updateEdit(id: string, patch: Partial<EditState>) {
    setSuccess('')
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  const totalHours = allEntries.reduce((sum, e) => {
    const state = edits[e.id]
    const hours = rowHours(e.date, state)
    return sum + (hours ?? e.hours ?? 0)
  }, 0)

  const hasOpenShift = allEntries.some((e) => e.finish === null)
  const hasEntries = allEntries.length > 0

  async function saveDirtyEntries(): Promise<boolean> {
    for (const e of allEntries) {
      const state = edits[e.id]
      const base = baseline[e.id]
      if (!isDirty(state, base)) continue
      if (!state.start || !state.finish) {
        setError(`Fill in both start and finish time for ${e.siteName} on ${formatDayDate(e.date)}.`)
        return false
      }

      const clockInAt = new Date(`${e.date}T${state.start}:00`).toISOString()
      const clockOutAt = new Date(`${e.date}T${state.finish}:00`).toISOString()

      const result = await updateTimesheetEntry({
        entryId: e.id,
        siteId: state.siteId,
        clockInAt,
        clockOutAt,
        breakMinutes: breakMinutesFor(state),
      })

      if (result?.error) {
        setError(result.error)
        return false
      }

      setBaseline((prev) => ({ ...prev, [e.id]: state }))
    }
    return true
  }

  function handleSave() {
    setError('')
    setSuccess('')
    startTransition(async () => {
      const ok = await saveDirtyEntries()
      if (ok) setSuccess('Changes saved.')
    })
  }

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
      const ok = await saveDirtyEntries()
      if (!ok) return

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
                    <td className="p-3 align-top text-black/40" colSpan={5}>
                      No shift
                    </td>
                  </tr>
                ) : (
                  <Fragment key={day.date}>
                    {day.entries.map((entry, idx) => {
                    const state = edits[entry.id]
                    const hours = rowHours(day.date, state)
                    return (
                      <tr key={entry.id}>
                        <td className="p-3 align-top whitespace-nowrap">
                          {idx === 0 && (
                            <>
                              <p className="font-medium">{day.label}</p>
                              <p className="text-xs text-black/50">{formatDayDate(day.date)}</p>
                            </>
                          )}
                        </td>
                        <td className="p-3 align-top">
                          <select
                            value={state.siteId}
                            onChange={(e) => updateEdit(entry.id, { siteId: e.target.value })}
                            className="w-full min-w-[10rem] rounded-md border border-black/20 px-2 py-1.5"
                          >
                            {sites.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.label}
                              </option>
                            ))}
                            {!sites.some((s) => s.id === state.siteId) && (
                              <option value={state.siteId}>{entry.siteName}</option>
                            )}
                          </select>
                        </td>
                        <td className="p-3 align-top">
                          <input
                            type="time"
                            value={state.start}
                            onChange={(e) => updateEdit(entry.id, { start: e.target.value })}
                            className="rounded-md border border-black/20 px-2 py-1.5"
                          />
                        </td>
                        <td className="p-3 align-top">
                          {entry.finish === null ? (
                            <span className="text-black/40">In progress</span>
                          ) : (
                            <input
                              type="time"
                              value={state.finish}
                              onChange={(e) => updateEdit(entry.id, { finish: e.target.value })}
                              className="rounded-md border border-black/20 px-2 py-1.5"
                            />
                          )}
                        </td>
                        <td className="p-3 align-top">
                          <div className="space-y-1">
                            <select
                              value={state.breakChoice}
                              onChange={(e) =>
                                updateEdit(entry.id, { breakChoice: e.target.value as BreakChoice })
                              }
                              className="w-full min-w-[7rem] rounded-md border border-black/20 px-2 py-1.5"
                            >
                              {BREAK_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                            {state.breakChoice === 'custom' && (
                              <input
                                type="number"
                                min={0}
                                step={1}
                                inputMode="numeric"
                                value={state.customBreak}
                                onChange={(e) => updateEdit(entry.id, { customBreak: e.target.value })}
                                placeholder="Minutes"
                                className="w-full rounded-md border border-black/20 px-2 py-1.5"
                              />
                            )}
                          </div>
                        </td>
                        <td className="p-3 align-top tabular-nums">
                          {hours !== null ? hours.toFixed(2) : entry.hours !== null ? entry.hours.toFixed(2) : '—'}
                        </td>
                      </tr>
                    )
                    })}
                    {(() => {
                      const { jobs, dayTotal } = dayJobTotals(day, edits, sites)
                      return (
                        <tr className="bg-black/[0.03] text-xs text-black/70">
                          <td className="p-3 align-top"></td>
                          <td className="p-3 align-top" colSpan={4}>
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
                <td className="p-3" colSpan={5}>
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
            onClick={handleSave}
            disabled={pending}
            className="rounded-md border border-black/20 px-4 py-3 text-sm disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Save changes'}
          </button>
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
