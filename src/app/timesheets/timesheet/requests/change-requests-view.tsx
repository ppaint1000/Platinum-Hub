'use client'

import { useState, useTransition } from 'react'
import { submitChangeRequest } from '@/lib/timesheets/actions/changeRequests'

type EntryOption = {
  id: string
  siteId: string
  siteName: string
  date: string
  start: string
  finish: string
}

type SiteOption = { id: string; name: string }

type RequestRow = {
  id: string
  date: string
  siteName: string
  currentStart: string
  currentFinish: string
  requestedStart: string | null
  requestedFinish: string | null
  requestedSiteName: string | null
  note: string | null
  status: 'pending' | 'approved' | 'rejected'
  adminNotes: string | null
}

function formatDate(dateStr: string) {
  if (dateStr === '—') return dateStr
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-NZ', { day: '2-digit', month: 'short', year: 'numeric' })
}

const STATUS_STYLE: Record<RequestRow['status'], string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
}

export function ChangeRequestsView({
  entries,
  sites,
  requests,
  initialEntryId,
}: {
  entries: EntryOption[]
  sites: SiteOption[]
  requests: RequestRow[]
  initialEntryId: string
}) {
  const defaultEntryId = entries.some((e) => e.id === initialEntryId) ? initialEntryId : (entries[0]?.id ?? '')
  const [entryId, setEntryId] = useState(defaultEntryId)
  const selected = entries.find((e) => e.id === entryId) ?? null

  const [changeStart, setChangeStart] = useState(true)
  const [changeFinish, setChangeFinish] = useState(false)
  const [changeSite, setChangeSite] = useState(false)
  const [newStart, setNewStart] = useState(selected?.start ?? '')
  const [newFinish, setNewFinish] = useState(selected?.finish ?? '')
  const [newSiteId, setNewSiteId] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [pending, startTransition] = useTransition()

  function selectEntry(id: string) {
    setEntryId(id)
    const e = entries.find((x) => x.id === id)
    setNewStart(e?.start ?? '')
    setNewFinish(e?.finish ?? '')
    setNewSiteId('')
    setSuccess('')
    setError('')
  }

  const canSubmit =
    Boolean(entryId) &&
    (changeStart || changeFinish || changeSite) &&
    (!changeStart || Boolean(newStart)) &&
    (!changeFinish || Boolean(newFinish)) &&
    (!changeSite || Boolean(newSiteId)) &&
    note.trim().length > 0

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!entryId) {
      setError('Choose which shift this is for.')
      return
    }
    if (!changeStart && !changeFinish && !changeSite) {
      setError('Choose start time, finish time, site/job, or a combination.')
      return
    }
    if ((changeStart && !newStart) || (changeFinish && !newFinish) || (changeSite && !newSiteId)) {
      setError('Fill in the corrected value(s).')
      return
    }
    if (!note.trim()) {
      setError('Add a comment explaining what needs to change.')
      return
    }

    startTransition(async () => {
      const result = await submitChangeRequest({
        entryId,
        changeStart,
        changeFinish,
        changeSite,
        newStart,
        newFinish,
        newSiteId,
        note,
      })
      if (result?.error) {
        setError(result.error)
        return
      }
      setSuccess('Request sent to the office.')
      setNote('')
    })
  }

  return (
    <div className="space-y-8">
      <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-black/10 p-4">
        <h2 className="font-medium">File a request</h2>

        {entries.length === 0 ? (
          <p className="text-sm text-black/60">No completed shifts in the last 8 weeks to correct.</p>
        ) : (
          <>
            <div className="space-y-1">
              <label htmlFor="entry" className="text-sm font-medium">
                Shift
              </label>
              <select
                id="entry"
                value={entryId}
                onChange={(e) => selectEntry(e.target.value)}
                className="w-full rounded-md border border-black/20 px-3 py-2"
              >
                {entries.map((e) => (
                  <option key={e.id} value={e.id}>
                    {formatDate(e.date)} — {e.siteName} ({e.start}–{e.finish})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={changeStart}
                  onChange={(e) => setChangeStart(e.target.checked)}
                />
                Start time was wrong
              </label>
              {changeStart && (
                <input
                  type="time"
                  value={newStart}
                  onChange={(e) => setNewStart(e.target.value)}
                  className="rounded-md border border-black/20 px-3 py-2"
                />
              )}
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={changeFinish}
                  onChange={(e) => setChangeFinish(e.target.checked)}
                />
                Finish time was wrong
              </label>
              {changeFinish && (
                <input
                  type="time"
                  value={newFinish}
                  onChange={(e) => setNewFinish(e.target.value)}
                  className="rounded-md border border-black/20 px-3 py-2"
                />
              )}
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={changeSite}
                  onChange={(e) => setChangeSite(e.target.checked)}
                />
                Site/job was wrong
              </label>
              {changeSite && (
                <select
                  value={newSiteId}
                  onChange={(e) => setNewSiteId(e.target.value)}
                  className="w-full rounded-md border border-black/20 px-3 py-2"
                >
                  <option value="" disabled>
                    Choose the correct site/job…
                  </option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-1">
              <label htmlFor="note" className="text-sm font-medium">
                Comment <span className="text-red-600">*</span>
              </label>
              <textarea
                id="note"
                required
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Let the office know why this needs changing"
                className="w-full rounded-md border border-black/20 px-3 py-2"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {success && <p className="text-sm text-green-700">{success}</p>}

            <button
              type="submit"
              disabled={pending || !canSubmit}
              className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {pending ? 'Sending…' : 'Send request'}
            </button>
          </>
        )}
      </form>

      <div className="space-y-2">
        <h2 className="font-medium">Your requests</h2>
        {requests.length === 0 ? (
          <p className="text-sm text-black/60">No change requests filed yet.</p>
        ) : (
          <ul className="divide-y divide-black/10 rounded-lg border border-black/10">
            {requests.map((r) => (
              <li key={r.id} className="space-y-1 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {formatDate(r.date)} — {r.siteName}
                  </p>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status]}`}>
                    {r.status}
                  </span>
                </div>
                <p className="text-xs text-black/60">
                  {r.requestedStart && `Start: ${r.currentStart} → ${r.requestedStart}`}
                  {r.requestedStart && (r.requestedFinish || r.requestedSiteName) && ' · '}
                  {r.requestedFinish && `Finish: ${r.currentFinish} → ${r.requestedFinish}`}
                  {r.requestedFinish && r.requestedSiteName && ' · '}
                  {r.requestedSiteName && `Site/job: ${r.siteName} → ${r.requestedSiteName}`}
                </p>
                {r.note && <p className="text-xs text-black/60">Comment: {r.note}</p>}
                {r.status !== 'pending' && r.adminNotes && (
                  <p className="text-xs text-black/60">Office note: {r.adminNotes}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
