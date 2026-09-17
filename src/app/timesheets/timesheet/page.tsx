import Link from 'next/link'
import { getCurrentProfile } from '@/lib/supabase/profile'
import { getReportEntries } from '@/lib/timesheets/reports'
import { Watermark } from '@/components/timesheets/Watermark'
import { TimesheetTable } from './timesheet-table'

export default async function TimesheetPage() {
  const profile = await getCurrentProfile()
  const entries = await getReportEntries({ userId: profile.id })

  return (
    <div className="relative mx-auto max-w-3xl space-y-4 p-4">
      <Watermark />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">My Timesheet</h1>
        <div className="flex gap-3 text-sm">
          <Link href="/timesheets/timesheet/weekly" className="underline">
            Weekly Timesheet
          </Link>
          <Link href="/timesheets/timesheet/requests" className="underline">
            Request a Change
          </Link>
          <Link href="/timesheets/clock" className="underline">
            Back to Clock In/Out
          </Link>
        </div>
      </div>
      <TimesheetTable entries={entries} />
    </div>
  )
}
