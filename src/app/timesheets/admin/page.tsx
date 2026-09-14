import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/supabase/profile'

export default async function AdminDashboard() {
  const profile = await getCurrentProfile()
  const supabase = await createClient()
  const { count } = await supabase
    .from('timesheet_entries')
    .select('id', { count: 'exact', head: true })
    .is('clock_out_at', null)

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <p className="text-sm text-black/60">
        <Link href="/timesheets/admin/activity" className="underline">
          {count ?? 0} staff currently clocked in
        </Link>
      </p>
      <div className="flex flex-wrap gap-2">
        <Link
          href="/timesheets/admin/customers"
          className="rounded-lg bg-gray-300 px-4 py-2 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-400"
        >
          Manage customers
        </Link>
        <Link
          href="/timesheets/admin/sites"
          className="rounded-lg bg-gray-300 px-4 py-2 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-400"
        >
          Manage sites
        </Link>
        <Link
          href="/timesheets/admin/staff"
          className="rounded-lg bg-gray-300 px-4 py-2 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-400"
        >
          Manage staff
        </Link>
        {profile.role === 'admin' && (
          <Link
            href="/timesheets/admin/reports"
            className="rounded-lg bg-gray-300 px-4 py-2 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-400"
          >
            Timesheet reports
          </Link>
        )}
      </div>
    </div>
  )
}
