import { requireAdminOrSupervisor } from '@/lib/timesheets/authGuards'
import { HubTopBar } from '@/components/dashboard/HubTopBar'
import { AdminNav } from './admin-nav'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const profile = await requireAdminOrSupervisor()

  return (
    <div className="flex flex-1 flex-col">
      <HubTopBar activeHref="/timesheets/admin" />
      <div className="border-b border-black/10 md:hidden">
        <AdminNav role={profile.role} />
      </div>
      <div className="flex flex-1 flex-col md:flex-row">
        <div className="hidden md:block md:w-56 md:shrink-0 md:border-r md:border-black/10">
          <AdminNav role={profile.role} />
        </div>
        {/* min-w-0 lets this shrink below its content's width inside the
            flex row - without it, a wide table (like a staff member's
            Timesheet) pushes the whole page past the viewport edge
            instead of scrolling within its own overflow-x-auto wrapper. */}
        <main className="min-w-0 flex-1 p-4">{children}</main>
      </div>
    </div>
  )
}
