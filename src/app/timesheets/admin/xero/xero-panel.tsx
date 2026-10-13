'use client'

// The interactive parts of Timesheets → Xero payroll: which pay item hours
// go on, who's who in Xero, and sending the pay period.
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveEmployeeLinksAction, sendTimesheetsAction, setEarningsRateAction } from './actions'
import type { SendResult } from '@/lib/xero/timesheets'

export type PreviewRow = {
  userId: string
  name: string
  days: Record<string, number>
  total: number
  needsCheck: string[]
  openShifts: number
  sent: { hours: number; at: string } | null
}

type Props = {
  staff: { id: string; name: string }[]
  links: Record<string, string>
  employees: { id: string; name: string; calendarId: string | null }[]
  rates: { id: string; name: string; type: string }[]
  rateId: string | null
  calendarId: string | null
  period: { start: string; end: string } | null
  dates: string[]
  preview: PreviewRow[]
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')
const words = (s: string) => s.toLowerCase().split(/[^a-z]+/).filter(Boolean)

// Letters that differ between two words (small typos like Laurance/Laurence).
function distance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}

// How alike a Hub name and a Xero name are: 3 = the same, 2 = first and
// last swapped, 1 = close (a typo, or a short name like Sai for Saimone).
function likeness(hub: string, xero: string): number {
  if (norm(hub) === norm(xero)) return 3
  const h = words(hub)
  const x = words(xero)
  if (h.length && [...h].sort().join() === [...x].sort().join()) return 2
  const close = (a: string, b: string) => a === b || (a.length >= 3 && (b.startsWith(a) || a.startsWith(b))) || distance(a, b) <= (Math.min(a.length, b.length) > 4 ? 2 : 1)
  const pairs = h.length === 2 && x.length === 2 && ((close(h[0], x[0]) && close(h[1], x[1])) || (close(h[0], x[1]) && close(h[1], x[0])))
  return pairs ? 1 : 0
}
const dayLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric' })
const box = 'rounded-lg border border-black/10 bg-white p-5'
const select = 'w-full rounded-md border border-black/20 bg-white px-2 py-1.5 text-sm'

export function XeroPayrollPanel(p: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  const [results, setResults] = useState<SendResult[] | null>(null)

  // Suggest a Xero employee for anyone not linked yet - the closest name,
  // never one already taken. Anything short of an exact match is flagged.
  const { suggested, unsure } = useMemo(() => {
    const out: Record<string, string> = { ...p.links }
    const unsure = new Set<string>()
    const taken = new Set(Object.values(p.links))
    const candidates = p.staff
      .filter((s) => !out[s.id])
      .flatMap((s) => p.employees.map((e) => ({ s, e, score: likeness(s.name, e.name) })))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
    for (const c of candidates) {
      if (out[c.s.id] || taken.has(c.e.id)) continue
      out[c.s.id] = c.e.id
      taken.add(c.e.id)
      if (c.score < 3) unsure.add(c.s.id)
    }
    return { suggested: out, unsure }
  }, [p.links, p.staff, p.employees])
  const [links, setLinks] = useState<Record<string, string>>(suggested)
  const [renameToXero, setRenameToXero] = useState(true)
  const xeroNameOf = (userId: string) => p.employees.find((e) => e.id === links[userId])?.name ?? null
  const renames = p.staff.filter((s) => links[s.id] && xeroNameOf(s.id) && xeroNameOf(s.id) !== s.name)
  const dirty = p.staff.some((s) => (links[s.id] ?? '') !== (p.links[s.id] ?? ''))

  // Ordinary hours is the usual pay item.
  const defaultRate = p.rateId ?? p.rates.find((r) => /ordinary/i.test(r.name) || r.type === 'OrdinaryEarnings')?.id ?? ''
  const [rate, setRate] = useState(defaultRate)
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(p.preview.filter((r) => r.total > 0).map((r) => r.userId)))

  const run = (fn: () => Promise<{ error?: string }>, ok: string) => {
    setMessage('')
    startTransition(async () => {
      const r = await fn()
      setMessage(r.error ?? ok)
      if (!r.error) router.refresh()
    })
  }

  function send() {
    if (!p.calendarId || !p.period) return
    setMessage('')
    setResults(null)
    startTransition(async () => {
      if (rate !== (p.rateId ?? '')) {
        const r = await setEarningsRateAction(rate, p.rates.find((x) => x.id === rate)?.name ?? '')
        if (r.error) return setMessage(r.error)
      }
      const r = await sendTimesheetsAction({ calendarId: p.calendarId!, start: p.period!.start, end: p.period!.end, userIds: [...chosen] })
      if (r.error) return setMessage(r.error)
      setResults(r.results ?? [])
      router.refresh()
    })
  }

  const unlinked = p.staff.filter((s) => !p.links[s.id])

  return (
    <div className="space-y-6">
      {message && <p className="rounded-md bg-black/5 px-4 py-2 text-sm font-medium">{message}</p>}

      <section className={box}>
        <h2 className="mb-1 font-semibold">Pay item for hours</h2>
        <p className="mb-3 text-sm text-black/60">The earnings rate in Xero the hours go on - usually Ordinary Hours.</p>
        <div className="flex flex-wrap items-center gap-3">
          <select value={rate} onChange={(e) => setRate(e.target.value)} className={`${select} max-w-sm`}>
            <option value="">Choose…</option>
            {p.rates.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          {rate !== (p.rateId ?? '') && (
            <button
              disabled={pending || !rate}
              onClick={() => run(() => setEarningsRateAction(rate, p.rates.find((x) => x.id === rate)?.name ?? ''), 'Pay item saved.')}
              className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Save
            </button>
          )}
        </div>
      </section>

      <section className={box}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Who&apos;s who in Xero</h2>
            <p className="text-sm text-black/60">
              Match each person with Timesheets ticked to their Xero employee. Names that match exactly are filled in for you
              {unlinked.length ? ` - ${unlinked.length} not saved yet` : ''}.
            </p>
          </div>
          {(dirty || renames.length > 0) && (
            <div className="flex flex-col items-end gap-1">
              <button
                disabled={pending}
                onClick={() =>
                  run(
                    () =>
                      saveEmployeeLinksAction(
                        p.staff.map((s) => ({ userId: s.id, xeroEmployeeId: links[s.id] || null, xeroName: xeroNameOf(s.id) })),
                        renameToXero
                      ),
                    renameToXero && renames.length ? `Saved - ${renames.length} name${renames.length === 1 ? '' : 's'} changed to match Xero.` : 'Saved.'
                  )
                }
                className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Save matches
              </button>
              {renames.length > 0 && (
                <label className="flex items-center gap-2 text-xs text-black/70">
                  <input type="checkbox" checked={renameToXero} onChange={(e) => setRenameToXero(e.target.checked)} />
                  Change {renames.length} Hub name{renames.length === 1 ? '' : 's'} to match Xero
                </label>
              )}
            </div>
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {p.staff.map((s) => (
            <label key={s.id} className="flex items-center gap-3 text-sm">
              <span className="w-40 shrink-0 font-medium">
                {s.name}
                {unsure.has(s.id) && links[s.id] === suggested[s.id] && (
                  <span className="block text-xs font-normal text-amber-700">Close match - check</span>
                )}
                {renameToXero && xeroNameOf(s.id) && xeroNameOf(s.id) !== s.name && (
                  <span className="block text-xs font-normal text-black/50">→ becomes {xeroNameOf(s.id)}</span>
                )}
              </span>
              <select
                value={links[s.id] ?? ''}
                onChange={(e) => setLinks({ ...links, [s.id]: e.target.value })}
                className={`${select} ${!links[s.id] ? 'border-amber-400 bg-amber-50' : ''}`}
              >
                <option value="">Not in Xero payroll</option>
                {p.employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </section>

      <section className={box}>
        <h2 className="mb-1 font-semibold">Hours for this pay period</h2>
        <p className="mb-3 text-sm text-black/60">
          Payable hours per day, rounded the same as the Timesheet Report with lunch breaks taken off. Unfinished shifts aren&apos;t counted.
        </p>
        {p.preview.length === 0 ? (
          <p className="text-sm text-black/60">Nobody matched to an employee on this pay calendar yet - save the matches above.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wide text-black/50">
                    <th className="py-2 pr-2"></th>
                    <th className="py-2 pr-2">Name</th>
                    {p.dates.map((d) => (
                      <th key={d} className="px-1 py-2 text-right">
                        {dayLabel(d)}
                      </th>
                    ))}
                    <th className="px-2 py-2 text-right">Total</th>
                    <th className="py-2 pl-2">Xero</th>
                  </tr>
                </thead>
                <tbody>
                  {p.preview.map((r) => (
                    <tr key={r.userId} className="border-b border-black/5">
                      <td className="py-2 pr-2">
                        <input
                          type="checkbox"
                          checked={chosen.has(r.userId)}
                          disabled={r.total <= 0}
                          onChange={(e) => {
                            const next = new Set(chosen)
                            if (e.target.checked) next.add(r.userId)
                            else next.delete(r.userId)
                            setChosen(next)
                          }}
                          aria-label={`Send ${r.name}`}
                        />
                      </td>
                      <td className="py-2 pr-2 font-medium">
                        {r.name}
                        {r.openShifts > 0 && <span className="block text-xs text-red-700">{r.openShifts} shift still clocked on - not counted</span>}
                        {r.needsCheck.length > 0 && <span className="block text-xs text-amber-700">Rounded on {r.needsCheck.length} day(s) - worth a look</span>}
                      </td>
                      {p.dates.map((d) => (
                        <td key={d} className={`px-1 py-2 text-right tabular-nums ${r.needsCheck.includes(d) ? 'text-amber-700' : ''}`}>
                          {r.days[d] ? r.days[d] : '–'}
                        </td>
                      ))}
                      <td className="px-2 py-2 text-right font-semibold tabular-nums">{r.total}</td>
                      <td className="py-2 pl-2 text-xs text-black/60">
                        {r.sent ? `Sent ${r.sent.hours} h ${new Date(r.sent.at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                onClick={send}
                disabled={pending || chosen.size === 0 || !rate}
                className="rounded-md bg-[#13B5EA] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {pending ? 'Sending…' : `Send ${chosen.size} timesheet${chosen.size === 1 ? '' : 's'} to Xero`}
              </button>
              <span className="text-xs text-black/60">
                {!rate ? 'Choose the pay item first. ' : ''}Sending again replaces the draft in Xero; approved ones are left alone.
              </span>
            </div>
          </>
        )}
        {results && (
          <ul className="mt-4 space-y-1 text-sm">
            {results.map((r) => (
              <li key={r.userId} className={r.ok ? 'text-green-800' : 'text-red-700'}>
                {r.ok ? '✓' : '✕'} {r.name}: {r.message}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
