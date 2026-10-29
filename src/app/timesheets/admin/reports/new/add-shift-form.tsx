'use client'

import { useActionState } from 'react'
import { addEntry } from '@/lib/timesheets/actions/entries'

type Option = { id: string; name: string }

const field = 'w-full rounded-md border border-black/20 px-3 py-2'

export function AddShiftForm({
  staff,
  sites,
  returnTo,
  defaultDate,
}: {
  staff: Option[]
  sites: Option[]
  returnTo: string
  defaultDate: string
}) {
  const [state, formAction, pending] = useActionState(addEntry, undefined)

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="return_to" value={returnTo} />
      <div className="space-y-1">
        <label htmlFor="user_id" className="text-sm font-medium">Staff</label>
        <select id="user_id" name="user_id" required defaultValue="" className={field}>
          <option value="" disabled>Choose a person…</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label htmlFor="site_id" className="text-sm font-medium">Site / job</label>
        <select id="site_id" name="site_id" required defaultValue="" className={field}>
          <option value="" disabled>Choose a site…</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label htmlFor="date" className="text-sm font-medium">Date</label>
        <input id="date" name="date" type="date" required defaultValue={defaultDate} max={defaultDate} className={field} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="start" className="text-sm font-medium">Start</label>
          <input id="start" name="start" type="time" required className={field} />
        </div>
        <div className="space-y-1">
          <label htmlFor="finish" className="text-sm font-medium">Finish</label>
          <input id="finish" name="finish" type="time" required className={field} />
        </div>
      </div>
      <div className="space-y-1">
        <label htmlFor="break_minutes" className="text-sm font-medium">Break (minutes)</label>
        <input id="break_minutes" name="break_minutes" type="number" min={0} step={1} defaultValue={0} className={field} />
      </div>
      <div className="space-y-1">
        <label htmlFor="notes" className="text-sm font-medium">Notes</label>
        <textarea id="notes" name="notes" rows={2} placeholder="e.g. Forgot to clock in - added by office" className={field} />
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button type="submit" disabled={pending} className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50">
        {pending ? 'Adding…' : 'Add shift'}
      </button>
    </form>
  )
}
