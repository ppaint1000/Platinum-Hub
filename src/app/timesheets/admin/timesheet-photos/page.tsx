// Timesheets → Timesheet Photos: download the timesheets staff emailed to
// the office Gmail for a week, as a "Week ending DD-MM-YYYY" folder.
import { requireAdmin } from '@/lib/timesheets/authGuards'
import { recentWeekEndings } from '@/lib/timesheets/timesheetPhotos'
import Link from 'next/link'
import { TimesheetPhotos } from './timesheet-photos'

// Collecting the week's timesheet photos from Gmail can take a while.
export const maxDuration = 60

export default async function TimesheetPhotosPage() {
  await requireAdmin()
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">Timesheet photos</h1>
      <TimesheetPhotos weekEndings={recentWeekEndings()} />
      <p className="text-sm">
        <Link href="/timesheets/admin/timesheet-photos/hours" className="underline">
          See last week&apos;s Hub hours (what goes to Xero) →
        </Link>
      </p>
    </div>
  )
}
