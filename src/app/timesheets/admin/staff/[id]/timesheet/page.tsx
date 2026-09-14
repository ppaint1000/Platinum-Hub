import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getReportEntries } from '@/lib/timesheets/reports'
import { requireAdminOrSupervisor } from '@/lib/timesheets/authGuards'
import { TimesheetTable } from '@/app/timesheets/timesheet/timesheet-table'

export default async function StaffTimesheetPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdminOrSupervisor()

  const { id } = await params
  const supabase = await createClient()
  const { data: person } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('id', id)
    .single()

  if (!person) {
    notFound()
  }

  const entries = await getReportEntries({ userId: id })

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <Link href="/timesheets/admin/staff" className="text-sm underline">
          &larr; Back to Staff
        </Link>
        <h1 className="text-2xl font-semibold">{person.full_name}&apos;s Timesheet</h1>
        <p className="text-sm text-black/60">
          Exactly what {person.full_name} sees on their own Timesheet tab.
        </p>
      </div>
      <TimesheetTable entries={entries} />
    </div>
  )
}
