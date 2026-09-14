import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentProfile } from '@/lib/supabase/profile'
import { InviteStaffForm } from './invite-form'
import { EmailActionButton } from './email-action-button'
import { setStaffActive, resendInvite, deleteStaff } from '@/lib/timesheets/actions/staff'
import type { Role } from '@/lib/supabase/profile'

type StaffRow = {
  id: string
  full_name: string
  email: string
  role: Role
  is_active: boolean
  pending: boolean
  entryCount: number
  staff_types: { name: string } | { name: string }[] | null
}

export default async function StaffPage() {
  const profile = await getCurrentProfile()
  const canEdit = profile.role === 'admin'

  const supabase = await createClient()
  const [{ data: staff }, { data: authUsers }, { data: entryRows }, { data: staffTypes }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, role, is_active, staff_types(name)')
      .order('full_name'),
    createAdminClient().auth.admin.listUsers(),
    supabase.from('timesheet_entries').select('user_id'),
    supabase.from('staff_types').select('id, name').eq('is_active', true).order('name'),
  ])

  const neverSignedIn = new Set(
    (authUsers?.users ?? []).filter((u) => !u.last_sign_in_at).map((u) => u.id)
  )

  const entryCounts = new Map<string, number>()
  for (const row of entryRows ?? []) {
    entryCounts.set(row.user_id, (entryCounts.get(row.user_id) ?? 0) + 1)
  }

  const staffList = (staff ?? []).map((s) => ({
    ...s,
    pending: neverSignedIn.has(s.id),
    entryCount: entryCounts.get(s.id) ?? 0,
  })) as StaffRow[]
  const active = staffList.filter((s) => s.is_active)
  const archived = staffList.filter((s) => !s.is_active)

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Staff</h1>
        <p className="text-sm text-black/60">
          {canEdit ? 'Admin-only.' : 'You can invite new Painters below.'}
        </p>
      </div>

      <InviteStaffForm role={profile.role} staffTypes={staffTypes ?? []} />

      <StaffList
        title="Active staff"
        staffList={active}
        emptyText="No active staff."
        canEdit={canEdit}
        currentUserId={profile.id}
      />
      {archived.length > 0 && (
        <StaffList
          title="Deactivated staff"
          staffList={archived}
          emptyText=""
          canEdit={canEdit}
          currentUserId={profile.id}
        />
      )}
    </div>
  )
}

function staffTypeName(relation: StaffRow['staff_types']): string | undefined {
  return Array.isArray(relation) ? relation[0]?.name : relation?.name
}

function StaffList({
  title,
  staffList,
  emptyText,
  canEdit,
  currentUserId,
}: {
  title: string
  staffList: StaffRow[]
  emptyText: string
  canEdit: boolean
  currentUserId: string
}) {
  return (
    <div className="space-y-3">
      <h2 className="font-medium">{title}</h2>
      {staffList.length === 0 && <p className="text-sm text-black/60">{emptyText}</p>}
      <ul className="divide-y divide-black/10 rounded-lg border border-black/10">
        {staffList.map((person) => (
          <li key={person.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {canEdit ? (
                <Link href={`/timesheets/admin/staff/${person.id}`} className="font-medium underline">
                  {person.full_name}
                </Link>
              ) : (
                <p className="font-medium">{person.full_name}</p>
              )}
              <p className="text-sm text-black/60">{person.email}</p>
              {person.pending && person.is_active && (
                <p className="text-xs text-amber-600">Invited - hasn&apos;t signed in yet</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:shrink-0">
              <span className="text-sm text-black/60 capitalize">
                {person.role}
                {staffTypeName(person.staff_types) && ` · ${staffTypeName(person.staff_types)}`}
              </span>
              <Link href={`/timesheets/admin/staff/${person.id}/timesheet`} className="text-sm underline">
                Timesheet
              </Link>
              {person.pending && person.is_active && (
                <EmailActionButton
                  action={resendInvite.bind(null, person.id)}
                  label="Resend invite"
                  pendingLabel="Sending…"
                  successMessage="Invite sent."
                />
              )}
              {canEdit && person.id !== currentUserId && (
                <form action={setStaffActive.bind(null, person.id, !person.is_active)}>
                  <button type="submit" className="text-sm underline">
                    {person.is_active ? 'Deactivate' : 'Restore'}
                  </button>
                </form>
              )}
              {canEdit && person.id !== currentUserId && !person.is_active && person.entryCount === 0 && (
                <form action={deleteStaff.bind(null, person.id)}>
                  <button type="submit" className="text-sm text-red-600 underline">
                    Delete
                  </button>
                </form>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
