import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/supabase/profile'
import { getReportEntries } from '@/lib/timesheets/reports'
import { addDays, nzDateKey, nzTimeString, nzTodayDateString } from '@/lib/timesheets/formatNZ'
import { ChangeRequestsView } from './change-requests-view'

type SiteRelation = { name: string } | { name: string }[] | null
type EntryRelation =
  | { clock_in_at: string; clock_out_at: string | null; sites: SiteRelation }
  | { clock_in_at: string; clock_out_at: string | null; sites: SiteRelation }[]
  | null

type RequestedSiteRelation = { name: string } | { name: string }[] | null

type RequestRow = {
  id: string
  requested_clock_in_at: string | null
  requested_clock_out_at: string | null
  note: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  admin_notes: string | null
  timesheet_entries: EntryRelation
  requested_site: RequestedSiteRelation
}

function first<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value
}

export default async function ChangeRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const initialEntryId = typeof sp.entry === 'string' ? sp.entry : ''

  const profile = await getCurrentProfile()
  const supabase = await createClient()

  // Shifts from the last 8 weeks are enough to correct a forgotten punch
  // without loading someone's entire work history into a dropdown.
  const from = addDays(nzTodayDateString(), -56)

  const [entries, { data: siteRows }, { data: requestRows }] = await Promise.all([
    getReportEntries({ userId: profile.id, from }),
    supabase.from('sites').select('id, name').eq('is_active', true).order('name'),
    supabase
      .from('timesheet_change_requests')
      .select(
        'id, requested_clock_in_at, requested_clock_out_at, note, status, created_at, admin_notes, timesheet_entries(clock_in_at, clock_out_at, sites(name)), requested_site:sites!requested_site_id(name)'
      )
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .returns<RequestRow[]>(),
  ])

  const sites = (siteRows ?? []).map((s) => ({ id: s.id, name: s.name }))

  // Only closed shifts can be corrected — an open one is fixed by clocking
  // out properly, not by filing a request against it.
  const closedEntries = entries
    .filter((e) => e.clock_out_at !== null)
    .map((e) => ({
      id: e.id,
      siteId: e.site_id,
      siteName: e.site_name,
      date: nzDateKey(e.clock_in_at),
      start: nzTimeString(e.clock_in_at),
      finish: nzTimeString(e.clock_out_at as string),
    }))

  const requests = (requestRows ?? []).map((r) => {
    const entry = first(r.timesheet_entries)
    const site = entry ? first(entry.sites) : null
    const requestedSite = first(r.requested_site)
    return {
      id: r.id,
      date: entry ? nzDateKey(entry.clock_in_at) : '—',
      siteName: site?.name ?? 'Unknown site',
      currentStart: entry ? nzTimeString(entry.clock_in_at) : '—',
      currentFinish: entry?.clock_out_at ? nzTimeString(entry.clock_out_at) : '—',
      requestedStart: r.requested_clock_in_at ? nzTimeString(r.requested_clock_in_at) : null,
      requestedFinish: r.requested_clock_out_at ? nzTimeString(r.requested_clock_out_at) : null,
      requestedSiteName: requestedSite?.name ?? null,
      note: r.note,
      status: r.status,
      adminNotes: r.admin_notes,
    }
  })

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Request a Change</h1>
        <div className="flex gap-3 text-sm">
          <Link href="/timesheets/timesheet/weekly" className="underline">
            Weekly Timesheet
          </Link>
          <Link href="/timesheets/clock" className="underline">
            Clock In/Out
          </Link>
        </div>
      </div>
      <p className="text-sm text-black/60">
        Clock in/out times are locked and can&rsquo;t be changed directly. Pick the shift below,
        say what&rsquo;s wrong, and it&rsquo;ll go to the office to fix.
      </p>

      <ChangeRequestsView
        entries={closedEntries}
        sites={sites}
        requests={requests}
        initialEntryId={initialEntryId}
      />
    </div>
  )
}
