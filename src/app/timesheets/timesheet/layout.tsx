import { HubTopBar } from '@/components/dashboard/HubTopBar'

// My timesheet, weekly and change requests under the Hub's top bar.
export default function TimesheetLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <HubTopBar activeHref="/timesheets/timesheet" />
      {children}
    </>
  )
}
