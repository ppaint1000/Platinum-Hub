import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/supabase/profile'
import { adminClockIn, adminClockOut } from '@/lib/timesheets/actions/timesheet'
import { mapUrl } from '@/lib/timesheets/reports'

type CustomerRelation = { name: string } | { name: string }[] | null
type SiteRelation =
  | { name: string; customers: CustomerRelation }
  | { name: string; customers: CustomerRelation }[]
  | null

type OpenEntryRow = {
  id: string
  user_id: string
  clock_in_at: string
  clock_in_lat: number | null
  clock_in_lng: number | null
  clock_in_device_id: string | null
  clock_in_device_label: string | null
  profiles: { full_name: string } | { full_name: string }[] | null
  sites: SiteRelation
}

function first<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function elapsedSince(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime())
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  return `${h}h ${String(m).padStart(2, '0')}m`
}

export default async function ActivityPage() {
  const profile = await getCurrentProfile()
  const canManage = profile.role === 'admin'

  const supabase = await createClient()
  const [{ data }, { data: staff }, { data: sites }] = await Promise.all([
    supabase
      .from('timesheet_entries')
      .select(
        'id, user_id, clock_in_at, clock_in_lat, clock_in_lng, clock_in_device_id, clock_in_device_label, profiles(full_name), sites(name, customers(name))'
      )
      .is('clock_out_at', null)
      .order('clock_in_at', { ascending: true })
      .returns<OpenEntryRow[]>(),
    canManage
      ? supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name')
      : Promise.resolve({ data: null }),
    canManage
      ? supabase.from('sites').select('id, name').eq('is_active', true).order('name')
      : Promise.resolve({ data: null }),
  ])

  // A device_id currently shared across two different active clock-ins can't
  // happen innocently - one phone can't be physically in two people's hands
  // at once - so it's worth flagging.
  const usersByDevice = new Map<string, Set<string>>()
  for (const row of data ?? []) {
    if (!row.clock_in_device_id) continue
    const set = usersByDevice.get(row.clock_in_device_id) ?? new Set<string>()
    set.add(row.user_id)
    usersByDevice.set(row.clock_in_device_id, set)
  }

  const rows = (data ?? []).map((row) => {
    const profileRow = first(row.profiles)
    const site = first(row.sites)
    const customer = site ? first(site.customers) : null
    return {
      id: row.id,
      name: profileRow?.full_name ?? 'Unknown',
      siteName: site?.name ?? 'Unknown',
      customerName: customer?.name ?? '',
      since: row.clock_in_at,
      mapUrl: mapUrl(row.clock_in_lat, row.clock_in_lng),
      deviceLabel: row.clock_in_device_label,
      deviceShared: row.clock_in_device_id
        ? (usersByDevice.get(row.clock_in_device_id)?.size ?? 0) > 1
        : false,
    }
  })

  const clockedInUserIds = new Set((data ?? []).map((row) => row.user_id))
  const availableStaff = (staff ?? []).filter((s) => !clockedInUserIds.has(s.id))

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Activity</h1>
        <p className="text-sm text-black/60">
          Staff currently clocked in. Reload the page to refresh.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-black/60">No one is currently clocked in.</p>
      ) : (
        <ul className="divide-y divide-black/10 rounded-lg border border-black/10">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-4 p-3">
              <div>
                <p className="font-medium">{row.name}</p>
                <p className="text-sm text-black/60">
                  {row.siteName}
                  {row.customerName ? ` (${row.customerName})` : ''}
                </p>
                {row.deviceLabel && (
                  <p className={`text-xs ${row.deviceShared ? 'font-medium text-red-600' : 'text-black/40'}`}>
                    {row.deviceLabel}
                    {row.deviceShared ? ' — also used by another active clock-in!' : ''}
                  </p>
                )}
              </div>
              <div className="text-right text-sm">
                <p className="font-medium tabular-nums">{elapsedSince(row.since)}</p>
                {row.mapUrl && (
                  <a href={row.mapUrl} target="_blank" className="underline">
                    Map
                  </a>
                )}
                {canManage && (
                  <form
                    action={async () => {
                      'use server'
                      await adminClockOut(row.id)
                    }}
                  >
                    <button type="submit" className="text-sm underline">
                      Clock out
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canManage && (staff ?? []).length > 0 && (sites ?? []).length > 0 && (
        <form
          action={async (formData: FormData) => {
            'use server'
            const userId = formData.get('user_id')
            const siteId = formData.get('site_id')
            if (typeof userId === 'string' && userId && typeof siteId === 'string' && siteId) {
              await adminClockIn(userId, siteId)
            }
          }}
          className="space-y-3 rounded-lg border border-black/10 p-4"
        >
          <h2 className="font-medium">Clock in a staff member</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="user_id" className="text-sm font-medium">
                Staff member
              </label>
              <select
                id="user_id"
                name="user_id"
                required
                defaultValue=""
                className="w-full rounded-md border border-black/20 px-3 py-2"
              >
                <option value="" disabled>
                  Choose a staff member…
                </option>
                {availableStaff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="site_id" className="text-sm font-medium">
                Site
              </label>
              <select
                id="site_id"
                name="site_id"
                required
                defaultValue=""
                className="w-full rounded-md border border-black/20 px-3 py-2"
              >
                <option value="" disabled>
                  Choose a site…
                </option>
                {(sites ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button type="submit" className="rounded-md bg-black px-4 py-2 text-sm text-white">
            Clock in
          </button>
        </form>
      )}
    </div>
  )
}
