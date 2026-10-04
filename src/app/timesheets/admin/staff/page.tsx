import { redirect } from 'next/navigation'

// Staff are added and managed in one place now: Users and access (name,
// role, staff type, invite / password emails, set password, timesheet).
export default function StaffPage() {
  redirect('/users')
}
