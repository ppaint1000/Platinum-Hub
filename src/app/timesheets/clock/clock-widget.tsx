'use client'

import { useEffect, useState, useTransition } from 'react'
import { clockIn, clockOut } from '@/lib/timesheets/actions/timesheet'
import { getDeviceId, getDeviceLabel } from '@/lib/timesheets/deviceId'

type ExtraDocument = { id: string; name: string }
type Site = {
  id: string
  label: string
  hasExtentOfWork: boolean
  hasSafetyPlan: boolean
  safetyAcknowledged: boolean
  extraDocuments: ExtraDocument[]
}
type OpenEntry = {
  id: string
  clock_in_at: string
  site_id: string | null
  site_name: string
  hasExtentOfWork: boolean
  hasSafetyPlan: boolean
  extraDocuments: ExtraDocument[]
}
type Coords = { lat: number | null; lng: number | null }

const BREAK_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: '30', label: '30 mins' },
  { value: '45', label: '45 mins' },
  { value: '60', label: '60 mins' },
  { value: 'custom', label: 'Custom' },
] as const

function getPosition(): Promise<Coords> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve({ lat: null, lng: null })
      return
    }

    // A high-accuracy GPS fix can take a while (especially indoors or on a
    // cold start) and silently fails to a blank location if it doesn't land
    // within the timeout. Give it more room, then fall back to a faster,
    // lower-accuracy (network-based) fix rather than giving up entirely.
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => resolve({ lat: null, lng: null }),
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
        )
      },
      { enableHighAccuracy: true, timeout: 15000 }
    )
  })
}

function formatDuration(ms: number) {
  const diff = Math.max(0, ms)
  const h = String(Math.floor(diff / 3600000)).padStart(2, '0')
  const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0')
  const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0')
  return `${h}:${m}:${s}`
}

function formatTimestamp(ms: number) {
  const d = new Date(ms)
  return {
    time: d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    date: d.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }),
  }
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])

  return now
}

export function ClockWidget({
  sites,
  openEntry,
}: {
  sites: Site[]
  openEntry: OpenEntry | null
}) {
  const [siteId, setSiteId] = useState('')
  const selectedSite = sites.find((s) => s.id === siteId) ?? null
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const [safetyChecked, setSafetyChecked] = useState(false)

  const needsSafetyAck = Boolean(selectedSite?.hasSafetyPlan && !selectedSite.safetyAcknowledged)

  function handleSiteChange(id: string) {
    setSiteId(id)
    setSafetyChecked(false)
  }

  const [stopped, setStopped] = useState(false)
  const [endedAtMs, setEndedAtMs] = useState<number | null>(null)
  const [endCoords, setEndCoords] = useState<Coords>({ lat: null, lng: null })
  const [breakChoice, setBreakChoice] = useState<(typeof BREAK_OPTIONS)[number]['value']>('none')
  const [customBreak, setCustomBreak] = useState('')

  const startMs = openEntry ? new Date(openEntry.clock_in_at).getTime() : null
  const now = useNow(Boolean(openEntry) && !stopped)
  const durationMs = startMs === null ? 0 : (stopped && endedAtMs ? endedAtMs : now) - startMs

  function handleClockIn() {
    setError('')
    startTransition(async () => {
      const { lat, lng } = await getPosition()
      const result = await clockIn({
        siteId,
        lat,
        lng,
        safetyAcknowledged: safetyChecked,
        deviceId: getDeviceId(),
        deviceLabel: getDeviceLabel(),
      })
      if (result?.error) setError(result.error)
    })
  }

  function handleStop() {
    setError('')
    startTransition(async () => {
      const coords = await getPosition()
      setEndCoords(coords)
      setEndedAtMs(Date.now())
      setStopped(true)
    })
  }

  function handleSave() {
    if (!openEntry || endedAtMs === null) return

    const breakMinutes =
      breakChoice === 'none'
        ? 0
        : breakChoice === 'custom'
          ? Math.max(0, parseInt(customBreak, 10) || 0)
          : Number(breakChoice)

    setError('')
    startTransition(async () => {
      const result = await clockOut({
        entryId: openEntry.id,
        notes,
        breakMinutes,
        clockOutAt: new Date(endedAtMs).toISOString(),
        lat: endCoords.lat,
        lng: endCoords.lng,
        deviceId: getDeviceId(),
        deviceLabel: getDeviceLabel(),
      })
      if (result?.error) setError(result.error)
    })
  }

  if (openEntry && startMs !== null) {
    const started = formatTimestamp(startMs)
    const ended = stopped && endedAtMs ? formatTimestamp(endedAtMs) : null

    return (
      <div className="w-full max-w-sm space-y-4">
        <p className="text-center text-sm text-black/60">{openEntry.site_name}</p>

        {openEntry.site_id &&
          (openEntry.hasExtentOfWork || openEntry.hasSafetyPlan || openEntry.extraDocuments.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {openEntry.hasExtentOfWork && (
                <a
                  href={`/api/timesheets/site-documents/${openEntry.site_id}/extent-of-work`}
                  target="_blank"
                  className="flex-1 rounded-md border border-black/20 px-3 py-2 text-center text-sm font-medium hover:bg-black/5"
                >
                  Extent of Work
                </a>
              )}
              {openEntry.hasSafetyPlan && (
                <a
                  href={`/api/timesheets/site-documents/${openEntry.site_id}/safety-plan`}
                  target="_blank"
                  className="flex-1 rounded-md border border-black/20 px-3 py-2 text-center text-sm font-medium hover:bg-black/5"
                >
                  Safety Plan
                </a>
              )}
              {openEntry.extraDocuments.map((doc) => (
                <a
                  key={doc.id}
                  href={`/api/timesheets/site-documents/doc/${doc.id}`}
                  target="_blank"
                  className="flex-1 rounded-md border border-black/20 px-3 py-2 text-center text-sm font-medium hover:bg-black/5"
                >
                  {doc.name}
                </a>
              ))}
            </div>
          )}

        <div className="grid grid-cols-2 gap-4 rounded-lg border border-black/10 p-4 text-center">
          <div>
            <p className="text-xs uppercase tracking-wide text-black/50">Started</p>
            <p className="font-medium">{started.time}</p>
            <p className="text-xs text-black/50">{started.date}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-black/50">Ended</p>
            {ended ? (
              <>
                <p className="font-medium">{ended.time}</p>
                <p className="text-xs text-black/50">{ended.date}</p>
              </>
            ) : (
              <p className="font-medium text-black/40">— — —</p>
            )}
          </div>
        </div>

        <div className="text-center">
          <p className="text-xs uppercase tracking-wide text-black/50">Duration</p>
          <p className="text-3xl font-semibold tabular-nums">{formatDuration(durationMs)}</p>
        </div>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          rows={2}
          className="w-full rounded-md border border-black/20 px-3 py-2 text-sm"
        />

        {error && <p className="text-center text-sm text-red-600">{error}</p>}

        {!stopped ? (
          <button
            onClick={handleStop}
            disabled={pending}
            className="w-full rounded-md bg-red-600 px-4 py-3 text-white disabled:opacity-50"
          >
            {pending ? 'Stopping…' : 'Stop'}
          </button>
        ) : (
          <div className="space-y-3 rounded-lg border border-black/10 p-4">
            <p className="text-sm font-medium">Breaks</p>
            <div className="flex flex-wrap gap-2">
              {BREAK_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setBreakChoice(option.value)}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    breakChoice === option.value
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {breakChoice === 'custom' && (
              <input
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={customBreak}
                onChange={(e) => setCustomBreak(e.target.value)}
                placeholder="Minutes"
                className="w-full rounded-md border border-black/20 px-3 py-2 text-sm"
              />
            )}
            <button
              onClick={handleSave}
              disabled={pending}
              className="w-full rounded-md bg-black px-4 py-3 text-white disabled:opacity-50"
            >
              {pending ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="w-full max-w-sm space-y-4 text-center">
      {sites.length === 0 ? (
        <p className="text-sm text-black/60">
          No active sites yet — ask your admin or supervisor to add one.
        </p>
      ) : (
        <>
          <div className="space-y-1 text-left">
            <label htmlFor="site" className="text-sm font-medium">
              Site
            </label>
            <select
              id="site"
              value={siteId}
              required
              onChange={(e) => handleSiteChange(e.target.value)}
              className="w-full rounded-md border border-black/20 px-3 py-2"
            >
              <option value="" disabled>
                Select a site…
              </option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.label}
                </option>
              ))}
            </select>
          </div>
          {selectedSite &&
            (selectedSite.hasExtentOfWork ||
              selectedSite.hasSafetyPlan ||
              selectedSite.extraDocuments.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {selectedSite.hasExtentOfWork && (
                <a
                  href={`/api/timesheets/site-documents/${selectedSite.id}/extent-of-work`}
                  target="_blank"
                  className="flex-1 rounded-md border border-black/20 px-3 py-2 text-sm font-medium hover:bg-black/5"
                >
                  Extent of Work
                </a>
              )}
              {selectedSite.hasSafetyPlan && (
                <a
                  href={`/api/timesheets/site-documents/${selectedSite.id}/safety-plan`}
                  target="_blank"
                  className="flex-1 rounded-md border border-black/20 px-3 py-2 text-sm font-medium hover:bg-black/5"
                >
                  Safety Plan
                </a>
              )}
              {selectedSite.extraDocuments.map((doc) => (
                <a
                  key={doc.id}
                  href={`/api/timesheets/site-documents/doc/${doc.id}`}
                  target="_blank"
                  className="flex-1 rounded-md border border-black/20 px-3 py-2 text-sm font-medium hover:bg-black/5"
                >
                  {doc.name}
                </a>
              ))}
            </div>
          )}
          {needsSafetyAck && (
            <label className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-left text-sm">
              <input
                type="checkbox"
                checked={safetyChecked}
                onChange={(e) => setSafetyChecked(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                I have read and understood the Site Safety Plan for this site.
              </span>
            </label>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            onClick={handleClockIn}
            disabled={pending || !siteId || (needsSafetyAck && !safetyChecked)}
            className="w-full rounded-md bg-black px-4 py-3 text-white disabled:opacity-50"
          >
            {pending ? 'Clocking in…' : 'Clock In'}
          </button>
        </>
      )}
    </div>
  )
}
