import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { updateEntry, deleteEntry } from '@/lib/timesheets/actions/entries'
import { requireAdmin } from '@/lib/timesheets/authGuards'

function toLocalInputValue(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`
}

export default async function EditEntryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdmin()

  const { id } = await params
  const supabase = await createClient()

  const [{ data: entry }, { data: sites }] = await Promise.all([
    supabase
      .from('timesheet_entries')
      .select('id, site_id, clock_in_at, clock_out_at, break_minutes, notes, profiles(full_name)')
      .eq('id', id)
      .single(),
    supabase.from('sites').select('id, name').order('name'),
  ])

  if (!entry) {
    notFound()
  }

  const crewProfile = Array.isArray(entry.profiles) ? entry.profiles[0] : entry.profiles
  const crewName = crewProfile?.full_name

  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-2xl font-semibold">Edit entry</h1>
      <p className="text-sm text-black/60">Staff: {crewName ?? 'Unknown'}</p>

      <form action={updateEntry.bind(null, entry.id)} className="space-y-3">
        <div className="space-y-1">
          <label htmlFor="site_id" className="text-sm font-medium">
            Site
          </label>
          <select
            id="site_id"
            name="site_id"
            defaultValue={entry.site_id}
            required
            className="w-full rounded-md border border-black/20 px-3 py-2"
          >
            {(sites ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="clock_in_at" className="text-sm font-medium">
            Clock in
          </label>
          <input
            id="clock_in_at"
            name="clock_in_at"
            type="datetime-local"
            defaultValue={toLocalInputValue(entry.clock_in_at)}
            required
            className="w-full rounded-md border border-black/20 px-3 py-2"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="clock_out_at" className="text-sm font-medium">
            Clock out
          </label>
          <input
            id="clock_out_at"
            name="clock_out_at"
            type="datetime-local"
            defaultValue={toLocalInputValue(entry.clock_out_at)}
            className="w-full rounded-md border border-black/20 px-3 py-2"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="break_minutes" className="text-sm font-medium">
            Break (minutes)
          </label>
          <input
            id="break_minutes"
            name="break_minutes"
            type="number"
            min={0}
            step={1}
            defaultValue={entry.break_minutes}
            className="w-full rounded-md border border-black/20 px-3 py-2"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="notes" className="text-sm font-medium">
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            defaultValue={entry.notes ?? ''}
            className="w-full rounded-md border border-black/20 px-3 py-2"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-black px-4 py-2 text-sm text-white"
        >
          Save changes
        </button>
      </form>

      <form action={deleteEntry.bind(null, entry.id)}>
        <button type="submit" className="text-sm text-red-600 underline">
          Delete entry
        </button>
      </form>
    </div>
  )
}
