import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/timesheets/authGuards'
import { formatNZDateTime } from '@/lib/timesheets/formatNZ'
import { approveChangeRequest, rejectChangeRequest } from '@/lib/timesheets/actions/changeRequests'

type ProfileRelation = { full_name: string } | { full_name: string }[] | null
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
  profiles: ProfileRelation
  timesheet_entries: EntryRelation
  requested_site: RequestedSiteRelation
}

function first<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function RequestCard({ row, resolved }: { row: RequestRow; resolved: boolean }) {
  const painter = first(row.profiles)
  const entry = first(row.timesheet_entries)
  const site = entry ? first(entry.sites) : null
  const requestedSite = first(row.requested_site)

  return (
    <li className="space-y-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{painter?.full_name ?? 'Unknown'}</p>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            row.status === 'approved'
              ? 'bg-green-100 text-green-800'
              : row.status === 'rejected'
                ? 'bg-red-100 text-red-800'
                : 'bg-amber-100 text-amber-800'
          }`}
        >
          {row.status}
        </span>
      </div>
      <p className="text-sm text-black/60">{site?.name ?? 'Unknown site'}</p>

      <div className="text-sm">
        {entry && (
          <p>
            Current: {formatNZDateTime(entry.clock_in_at)} –{' '}
            {entry.clock_out_at ? formatNZDateTime(entry.clock_out_at) : 'in progress'}
          </p>
        )}
        {row.requested_clock_in_at && <p>Requested start: {formatNZDateTime(row.requested_clock_in_at)}</p>}
        {row.requested_clock_out_at && <p>Requested finish: {formatNZDateTime(row.requested_clock_out_at)}</p>}
        {requestedSite && <p>Requested site/job: {requestedSite.name}</p>}
      </div>

      {row.note && <p className="text-sm text-black/70">Comment: {row.note}</p>}
      {resolved && row.admin_notes && <p className="text-sm text-black/70">Office note: {row.admin_notes}</p>}

      {!resolved && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <form
            action={async () => {
              'use server'
              await approveChangeRequest(row.id)
            }}
          >
            <button type="submit" className="rounded-md bg-black px-3 py-1.5 text-sm text-white">
              Approve
            </button>
          </form>
          <form
            action={async (formData: FormData) => {
              'use server'
              const notes = formData.get('admin_notes')
              await rejectChangeRequest(row.id, typeof notes === 'string' ? notes : '')
            }}
            className="flex flex-1 flex-wrap items-center gap-2"
          >
            <input
              type="text"
              name="admin_notes"
              placeholder="Reason for rejecting (optional)"
              className="min-w-[10rem] flex-1 rounded-md border border-black/20 px-2 py-1.5 text-sm"
            />
            <button
              type="submit"
              className="rounded-md border border-black/20 px-3 py-1.5 text-sm hover:bg-black/5"
            >
              Reject
            </button>
          </form>
        </div>
      )}
    </li>
  )
}

export default async function AdminChangeRequestsPage() {
  await requireAdmin()
  const supabase = await createClient()

  const { data: rows } = await supabase
    .from('timesheet_change_requests')
    .select(
      'id, requested_clock_in_at, requested_clock_out_at, note, status, created_at, admin_notes, profiles!timesheet_change_requests_user_id_fkey(full_name), timesheet_entries(clock_in_at, clock_out_at, sites(name)), requested_site:sites!requested_site_id(name)'
    )
    .order('created_at', { ascending: false })
    .limit(100)
    .returns<RequestRow[]>()

  const all = rows ?? []
  const pending = all.filter((r) => r.status === 'pending')
  const resolved = all.filter((r) => r.status !== 'pending').slice(0, 20)

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Change Requests</h1>
        <p className="text-sm text-black/60">
          Painters can no longer edit their own clock in/out times — these are the corrections
          they&rsquo;ve asked for instead.
        </p>
      </div>

      <div>
        <h2 className="mb-2 font-medium">Pending ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-black/60">No pending requests.</p>
        ) : (
          <ul className="divide-y divide-black/10 rounded-lg border border-black/10">
            {pending.map((row) => (
              <RequestCard key={row.id} row={row} resolved={false} />
            ))}
          </ul>
        )}
      </div>

      {resolved.length > 0 && (
        <div>
          <h2 className="mb-2 font-medium">Recently resolved</h2>
          <ul className="divide-y divide-black/10 rounded-lg border border-black/10">
            {resolved.map((row) => (
              <RequestCard key={row.id} row={row} resolved />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
