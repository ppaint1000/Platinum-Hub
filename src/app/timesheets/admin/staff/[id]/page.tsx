import { redirect } from 'next/navigation'

// Editing a staff member is on Users and access now (the "More" button on
// their row). Their timesheet is still at ./timesheet.
export default function EditStaffPage() {
  redirect('/users')
}
