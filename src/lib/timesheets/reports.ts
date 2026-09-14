import { createClient } from '@/lib/supabase/server'
import { nzDayEndUtcIso, nzDayStartUtcIso } from '@/lib/timesheets/formatNZ'

type SupabaseClientLike = Awaited<ReturnType<typeof createClient>>

export type ReportFilters = {
  from?: string
  to?: string
  userId?: string
  siteId?: string
}

export type ReportEntry = {
  id: string
  site_id: string
  user_name: string
  site_name: string
  customer_name: string
  clock_in_at: string
  clock_out_at: string | null
  break_minutes: number
  hours: number | null
  notes: string | null
  clock_in_map_url: string | null
  clock_out_map_url: string | null
  clock_in_device_label: string | null
  clock_out_device_label: string | null
  device_shared: boolean
}

type RawRow = {
  id: string
  user_id: string
  site_id: string
  clock_in_at: string
  clock_out_at: string | null
  break_minutes: number
  notes: string | null
  clock_in_lat: number | null
  clock_in_lng: number | null
  clock_out_lat: number | null
  clock_out_lng: number | null
  clock_in_device_id: string | null
  clock_in_device_label: string | null
  clock_out_device_id: string | null
  clock_out_device_label: string | null
  profiles: { full_name: string } | { full_name: string }[] | null
  sites:
    | { name: string; customers: { name: string } | { name: string }[] | null }
    | { name: string; customers: { name: string } | { name: string }[] | null }[]
    | null
}

export function mapUrl(lat: number | null, lng: number | null): string | null {
  if (lat === null || lng === null) return null
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
}

export async function getReportEntries(
  filters: ReportFilters,
  client?: SupabaseClientLike
): Promise<ReportEntry[]> {
  const supabase = client ?? (await createClient())

  let query = supabase
    .from('timesheet_entries')
    .select(
      'id, user_id, site_id, clock_in_at, clock_out_at, break_minutes, notes, clock_in_lat, clock_in_lng, clock_out_lat, clock_out_lng, clock_in_device_id, clock_in_device_label, clock_out_device_id, clock_out_device_label, profiles(full_name), sites(name, customers(name))'
    )
    .order('clock_in_at', { ascending: false })

  if (filters.from) query = query.gte('clock_in_at', nzDayStartUtcIso(filters.from))
  if (filters.to) query = query.lte('clock_in_at', nzDayEndUtcIso(filters.to))
  if (filters.userId) query = query.eq('user_id', filters.userId)
  if (filters.siteId) query = query.eq('site_id', filters.siteId)

  const { data } = await query.returns<RawRow[]>()

  // A device_id used by more than one distinct staff member anywhere in
  // this result set is worth flagging - one phone doesn't belong to two
  // people. Checks both clock-in and clock-out devices.
  const usersByDevice = new Map<string, Set<string>>()
  for (const row of data ?? []) {
    for (const deviceId of [row.clock_in_device_id, row.clock_out_device_id]) {
      if (!deviceId) continue
      const set = usersByDevice.get(deviceId) ?? new Set<string>()
      set.add(row.user_id)
      usersByDevice.set(deviceId, set)
    }
  }

  return (data ?? []).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
    const site = Array.isArray(row.sites) ? row.sites[0] : row.sites
    const customer = site ? (Array.isArray(site.customers) ? site.customers[0] : site.customers) : null
    const clockIn = new Date(row.clock_in_at).getTime()
    const clockOut = row.clock_out_at ? new Date(row.clock_out_at).getTime() : null

    const grossHours = clockOut ? (clockOut - clockIn) / 3600000 : null

    return {
      id: row.id,
      site_id: row.site_id,
      user_name: profile?.full_name ?? 'Unknown',
      site_name: site?.name ?? 'Unknown',
      customer_name: customer?.name ?? '',
      clock_in_at: row.clock_in_at,
      clock_out_at: row.clock_out_at,
      break_minutes: row.break_minutes,
      hours: grossHours !== null ? Math.round((grossHours - row.break_minutes / 60) * 100) / 100 : null,
      notes: row.notes,
      clock_in_map_url: mapUrl(row.clock_in_lat, row.clock_in_lng),
      clock_out_map_url: mapUrl(row.clock_out_lat, row.clock_out_lng),
      clock_in_device_label: row.clock_in_device_label,
      clock_out_device_label: row.clock_out_device_label,
      device_shared:
        [row.clock_in_device_id, row.clock_out_device_id].some(
          (id) => id && (usersByDevice.get(id)?.size ?? 0) > 1
        ),
    }
  })
}
